package cm.bouendji.vpn.offline

import cm.bouendji.vpn.brand.BrandTokens
import cm.bouendji.vpn.config.BundlePayload
import cm.bouendji.vpn.config.SingBoxConfig
import cm.bouendji.vpn.config.parseInstant
import cm.bouendji.vpn.crypto.B64
import cm.bouendji.vpn.crypto.DeviceEnvelope
import cm.bouendji.vpn.crypto.Ed25519
import cm.bouendji.vpn.util.IsoTime
import cm.bouendji.vpn.util.KeyValueStore
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import java.security.MessageDigest

/* --------------------------------------------------------------- stockage local */

/**
 * Stockage des configurations, chiffré au repos (clé Keystore via
 * [cm.bouendji.vpn.crypto.SecureStore]).
 *
 * Un seul emplacement pour les deux origines — bundle tiré de l'API et fichier
 * hors-ligne importé : le moteur n'a pas à savoir d'où vient la liste.
 */
class ConfigVault(private val store: KeyValueStore) {

    companion object {
        private const val KEY_PAYLOAD = "vault.bundle"
        private val JSON = Json {
            ignoreUnknownKeys = true
            explicitNulls = false
            encodeDefaults = true
        }
    }

    fun save(payload: BundlePayload): Boolean =
        store.putString(KEY_PAYLOAD, JSON.encodeToString(BundlePayload.serializer(), payload))

    fun read(): BundlePayload? {
        val raw = store.getString(KEY_PAYLOAD) ?: return null
        return runCatching { JSON.decodeFromString(BundlePayload.serializer(), raw) }.getOrNull()
    }

    /** Retire la liste : plus rien à connecter (révocation, droits finis, effacement). */
    fun clear() = store.remove(KEY_PAYLOAD)

    fun isEmpty(): Boolean = read()?.configs.isNullOrEmpty()

    /** Nombre de configurations encore valides à [nowMs] — ce que l'accueil peut promettre. */
    fun usableCount(nowMs: Long = System.currentTimeMillis()): Int =
        read()?.configs?.count { (parseInstant(it.expiresAt) ?: 0L) > nowMs } ?: 0
}

/* ------------------------------------------------------------- fichier hors-ligne */

/**
 * Import du fichier de secours (nœud `offline-bundle`, D20, D29).
 *
 * Le fichier est émis par `POST /v1/admin/devices/:id/offline-bundles`
 * (`services/offlineBundles.ts`, `OfflineFile`) : mêmes huit clés, même chaîne
 * signée. Ce que l'app peut faire : vérifier, déchiffrer, refuser, et ne
 * jamais réutiliser un identifiant déjà consommé. Ce qu'elle ne peut pas :
 * supprimer le fichier que l'utilisateur a reçu par WhatsApp.
 *
 * Chaîne signée (Ed25519, `offlineSignedMessage` côté serveur) :
 *
 * ```
 * vpn-offline-v1 \n v \n bundleId \n deviceId \n issuedAt \n notAfter \n revision
 *                \n sha256hex(ephemeralKey|salt|iv|ciphertext|tag)
 * ```
 *
 * Ordre : signature → `notAfter` → appareil → non-consommé → déchiffrement →
 * marquage consommé → écriture. Le marquage est **écrit avant** la liste
 * (D29) : une coupure laisse un fichier consommé sans configurations, jamais
 * un fichier réutilisable.
 *
 * Ed25519 : plateforme si disponible (Android 13+), sinon vérification RFC 8032
 * en Kotlin pur ([Ed25519]) — aucun appareil ancien n'est refusé pour ça.
 */
class OfflineBundle(
    /** ECDH avec la clé d'accord de l'appareil (Keystore ou repli logiciel). */
    private val agree: (ByteArray) -> ByteArray,
    private val store: KeyValueStore,
    private val vault: ConfigVault,
    private val deviceIdProvider: () -> String?,
    /** Clé Ed25519 publique épinglée au build, base64 SPKI. Vide = import refusé. */
    private val pinnedKeyB64: String = BrandTokens.offlineBundleSigningKeyB64,
    private val clock: () -> Long = System::currentTimeMillis,
) {

    companion object {
        /** Limite locale de lecture, pas une limite d'API : un fichier fait quelques Ko. */
        const val MAX_BYTES = 256 * 1024

        private const val KEY_CONSUMED = "offline.consumed"
        private const val KEY_PENDING_REPORT = "offline.pendingReport"
        private const val MAX_CONSUMED_IDS = 32
        private const val PREFIX = "vpn-offline-v1"

        private val JSON = Json {
            ignoreUnknownKeys = false
            explicitNulls = false
            encodeDefaults = false
        }
    }

    @Serializable
    private data class Container(
        val v: Int,
        val bundleId: String,
        val deviceId: String,
        val issuedAt: String,
        val notAfter: String,
        val revision: Long = 0,
        val envelope: Envelope,
        val sig: String,
    )

    @Serializable
    private data class Envelope(
        val version: Int,
        val ephemeralKey: String,
        val salt: String,
        val iv: String,
        val ciphertext: String,
        val tag: String,
        val digest: String? = null,
    )

    @Serializable
    private data class IdList(val ids: List<String> = emptyList())

    enum class Reason {
        TOO_LARGE, MALFORMED, UNSUPPORTED_VERSION, NOT_ENROLLED, WRONG_DEVICE, EXPIRED,
        ALREADY_CONSUMED, SIGNATURE_UNAVAILABLE, SIGNATURE_INVALID, DECRYPT_FAILED,
        NOTHING_USABLE, WRITE_FAILED,
    }

    sealed interface Import {
        /** [droppedExpired] : configurations écartées parce que déjà expirées. */
        data class Accepted(val bundleId: String, val payload: BundlePayload, val droppedExpired: Int) : Import

        data class Refused(val reason: Reason, val message: String) : Import
    }

    /** Importe [bytes] (contenu du fichier). Bloquant : hors du fil principal. */
    fun import(bytes: ByteArray): Import {
        if (bytes.isEmpty()) return refuse(Reason.MALFORMED, "Ce fichier est vide.")
        if (bytes.size > MAX_BYTES) return refuse(Reason.TOO_LARGE, "Ce fichier est trop volumineux pour un fichier d'accès.")

        val container = try {
            JSON.decodeFromString(Container.serializer(), bytes.toString(Charsets.UTF_8))
        } catch (_: Exception) {
            return refuse(Reason.MALFORMED, "Ce fichier n'est pas un fichier d'accès lisible.")
        }
        if (container.v != 1) return refuse(Reason.UNSUPPORTED_VERSION, "Version de fichier non prise en charge (${container.v}).")

        val localDeviceId = deviceIdProvider()
            ?: return refuse(Reason.NOT_ENROLLED, "Connectez-vous une première fois sur cet appareil avant d'importer un fichier.")
        if (container.deviceId != localDeviceId) {
            return refuse(Reason.WRONG_DEVICE, "Ce fichier a été émis pour un autre appareil.")
        }

        val notAfterMs = IsoTime.parseMs(container.notAfter)
            ?: return refuse(Reason.MALFORMED, "Date de validité illisible.")
        if (notAfterMs <= clock()) return refuse(Reason.EXPIRED, "Ce fichier a expiré. Demandez-en un nouveau.")

        if (container.bundleId in ids(KEY_CONSUMED)) {
            return refuse(Reason.ALREADY_CONSUMED, "Ce fichier a déjà été utilisé sur cet appareil.")
        }

        if (pinnedKeyB64.isBlank()) {
            return refuse(Reason.SIGNATURE_UNAVAILABLE, "Cette version de l'application ne sait pas vérifier les fichiers d'accès.")
        }
        val verified = runCatching {
            Ed25519.verifySpki(B64.decode(pinnedKeyB64), signedMessage(container), B64.decode(container.sig))
        }.getOrDefault(false)
        if (!verified) return refuse(Reason.SIGNATURE_INVALID, "Signature invalide : ce fichier n'a pas été émis par le service.")

        val plain = try {
            DeviceEnvelope.open(
                agree = agree,
                deviceId = localDeviceId,
                revision = container.revision,
                ephemeralKeyB64 = container.envelope.ephemeralKey,
                saltB64 = container.envelope.salt,
                ivB64 = container.envelope.iv,
                ciphertextB64 = container.envelope.ciphertext,
                tagB64 = container.envelope.tag,
                digestB64 = container.envelope.digest,
            )
        } catch (error: Exception) {
            return refuse(Reason.DECRYPT_FAILED, "Impossible d'ouvrir ce fichier sur cet appareil.")
        }

        val payload = try {
            SingBoxConfig.BUNDLE_JSON.decodeFromString(BundlePayload.serializer(), plain.toString(Charsets.UTF_8))
        } catch (_: Exception) {
            return refuse(Reason.MALFORMED, "Le contenu de ce fichier est illisible.")
        } finally {
            plain.fill(0)
        }

        val now = clock()
        val usable = payload.configs.filter { (parseInstant(it.expiresAt) ?: 0L) > now }
        if (usable.isEmpty()) return refuse(Reason.NOTHING_USABLE, "Les accès de ce fichier ont déjà expiré.")

        // Marquage AVANT écriture — garantie d'usage unique côté app (D29).
        if (!remember(KEY_CONSUMED, container.bundleId)) {
            return refuse(Reason.WRITE_FAILED, "Impossible d'enregistrer l'utilisation du fichier.")
        }
        val accepted = payload.copy(configs = usable)
        if (!vault.save(accepted)) return refuse(Reason.WRITE_FAILED, "Impossible d'enregistrer les accès.")

        // Le serveur est prévenu plus tard, quand le réseau le permet.
        remember(KEY_PENDING_REPORT, container.bundleId)
        return Import.Accepted(container.bundleId, accepted, payload.configs.size - usable.size)
    }

    /** Fichiers consommés dont le serveur n'a pas encore été prévenu (`POST /v1/offline-bundles/:id/consumed`). */
    fun pendingReports(): List<String> = ids(KEY_PENDING_REPORT)

    fun reported(bundleId: String) {
        val remaining = ids(KEY_PENDING_REPORT) - bundleId
        store.putString(KEY_PENDING_REPORT, JSON.encodeToString(IdList.serializer(), IdList(remaining)))
    }

    private fun signedMessage(container: Container): ByteArray {
        val envelopeDigest = sha256Hex(
            listOf(
                container.envelope.ephemeralKey, container.envelope.salt, container.envelope.iv,
                container.envelope.ciphertext, container.envelope.tag,
            ).joinToString("|").toByteArray(Charsets.UTF_8),
        )
        return listOf(
            PREFIX, container.v.toString(), container.bundleId, container.deviceId, container.issuedAt,
            container.notAfter, container.revision.toString(), envelopeDigest,
        ).joinToString("\n").toByteArray(Charsets.UTF_8)
    }

    private fun sha256Hex(data: ByteArray): String =
        MessageDigest.getInstance("SHA-256").digest(data).joinToString("") { "%02x".format(it) }

    private fun ids(key: String): List<String> {
        val raw = store.getString(key) ?: return emptyList()
        return runCatching { JSON.decodeFromString(IdList.serializer(), raw).ids }.getOrDefault(emptyList())
    }

    private fun remember(key: String, id: String): Boolean {
        val updated = (ids(key) - id + id).takeLast(MAX_CONSUMED_IDS)
        return store.putString(key, JSON.encodeToString(IdList.serializer(), IdList(updated)))
    }

    private fun refuse(reason: Reason, message: String): Import = Import.Refused(reason, message)
}
