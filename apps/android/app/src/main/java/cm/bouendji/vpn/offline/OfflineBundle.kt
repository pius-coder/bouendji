package cm.bouendji.vpn.offline

import android.os.Build
import android.util.Base64
import cm.bouendji.vpn.brand.BrandTokens
import cm.bouendji.vpn.config.BundlePayload
import cm.bouendji.vpn.config.SingBoxConfig
import cm.bouendji.vpn.config.parseInstant
import cm.bouendji.vpn.crypto.DeviceEnvelope
import cm.bouendji.vpn.crypto.DeviceKeys
import cm.bouendji.vpn.crypto.SecureStore
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import java.security.KeyFactory
import java.security.MessageDigest
import java.security.Signature
import java.security.spec.X509EncodedKeySpec

/* --------------------------------------------------------------- stockage local */

/**
 * Stockage des configurations, chiffré au repos (clé Keystore via [SecureStore]).
 *
 * Un seul emplacement pour les deux origines — bundle tiré de l'API et fichier
 * hors-ligne importé : le moteur n'a pas à savoir d'où vient la liste, et
 * l'écrasement est atomique du point de vue de l'appelant.
 *
 * Le clair n'existe qu'entre [read] et la construction de la configuration
 * sing-box, en mémoire.
 */
class ConfigVault(private val store: SecureStore) {

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

    /** Retire la liste : plus rien à connecter (rétention, révocation, abonnement fini). */
    fun clear() = store.remove(KEY_PAYLOAD)

    fun isEmpty(): Boolean = read()?.configs.isNullOrEmpty()
}

/* ------------------------------------------------------------- fichier hors-ligne */

/**
 * Import du fichier de secours (nœud `offline-bundle`, décision D20).
 *
 * Ce que l'app peut faire : vérifier, déchiffrer, refuser, et ne jamais réutiliser
 * un identifiant déjà consommé. Ce qu'elle ne peut pas : supprimer le fichier
 * que l'utilisateur a reçu par WhatsApp ou enregistré dans Téléchargements. La
 * protection réelle est la signature, le chiffrement par appareil, l'usage
 * unique côté serveur et un `not_after` court.
 *
 * ## Conteneur v1 — **contrat proposé, pas encore émis par le serveur**
 *
 * Aucune route serveur ne produit ce fichier aujourd'hui (`offline_bundles`
 * n'existe pas dans `schema.ts`). La forme ci-dessous est donc une proposition
 * à figer côté serveur ; l'app la vérifie strictement pour qu'une divergence
 * échoue à l'import plutôt que de produire un demi-import.
 *
 * ```json
 * {
 *   "v": 1,
 *   "bundleId": "uuid",
 *   "deviceId": "uuid de la ligne devices",
 *   "issuedAt": "ISO-8601",
 *   "notAfter": "ISO-8601",
 *   "revision": 0,
 *   "envelope": { "version": 1, "ephemeralKey": "b64", "salt": "b64",
 *                 "iv": "b64", "ciphertext": "b64", "tag": "b64", "digest": "b64" },
 *   "sig": "base64(Ed25519(message))"
 * }
 * ```
 *
 * La chaîne signée est textuelle, pour éviter toute canonicalisation JSON :
 *
 * ```
 * vpn-offline-v1 \n v \n bundleId \n deviceId \n issuedAt \n notAfter \n revision
 *                \n sha256hex(envelope.ephemeralKey|salt|iv|ciphertext|tag)
 * ```
 *
 * `revision` sert d'`info` HKDF (`vpn-bundle-v1|deviceId|revision`), comme pour
 * un bundle en ligne : c'est ce qui empêche de rejouer l'enveloppe d'un autre
 * appareil ou d'une autre révision.
 *
 * ## Ordre des contrôles
 *
 * signature → `not_after` → appareil → non-consommé → déchiffrement → marquage
 * consommé → écriture. Le marquage est **écrit avant** la liste : une coupure
 * entre les deux laisse un bundle consommé sans configurations (l'utilisateur
 * redemande un fichier), jamais l'inverse (un bundle réutilisable).
 */
class OfflineBundle(
    private val keys: DeviceKeys,
    private val store: SecureStore,
    private val vault: ConfigVault,
    private val deviceIdProvider: () -> String?,
    /** Clé Ed25519 publique épinglée, base64 SPKI. Vide tant que le build ne l'injecte pas. */
    private val pinnedKeyB64: String = BrandTokens.offlineBundleSigningKeyB64,
    private val clock: () -> Long = System::currentTimeMillis,
) {

    companion object {
        /** Limite locale de lecture, pas une limite d'API : un bundle fait quelques Ko. */
        const val MAX_BYTES = 256 * 1024

        private const val KEY_CONSUMED = "offline.consumed"
        private const val MAX_CONSUMED_IDS = 32
        private const val PREFIX = "vpn-offline-v1"

        private val JSON = Json {
            ignoreUnknownKeys = false
            explicitNulls = false
            encodeDefaults = false
        }
    }

    /* ------------------------------------------------------------------ types */

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
    private data class ConsumedList(val ids: List<String> = emptyList())

    enum class Reason {
        TOO_LARGE,
        MALFORMED,
        UNSUPPORTED_VERSION,
        UNSUPPORTED_DEVICE,
        NOT_ENROLLED,
        WRONG_DEVICE,
        EXPIRED,
        ALREADY_CONSUMED,
        SIGNATURE_UNAVAILABLE,
        SIGNATURE_INVALID,
        DECRYPT_FAILED,
        NOTHING_USABLE,
        WRITE_FAILED,
    }

    sealed interface Import {
        /** [droppedExpired] : configurations écartées parce que déjà expirées. */
        data class Accepted(val bundleId: String, val payload: BundlePayload, val droppedExpired: Int) : Import

        data class Refused(val reason: Reason, val message: String) : Import
    }

    /* ------------------------------------------------------------------ entrée */

    /**
     * Importe [bytes] (contenu du fichier, jamais le chemin).
     *
     * Peut bloquer (Keystore, déchiffrement) : appeler hors du fil principal.
     */
    fun import(bytes: ByteArray): Import {
        if (bytes.isEmpty()) return refuse(Reason.MALFORMED, "Fichier vide.")
        if (bytes.size > MAX_BYTES) return refuse(Reason.TOO_LARGE, "Fichier trop volumineux pour un bundle.")

        val container = try {
            JSON.decodeFromString(Container.serializer(), bytes.toString(Charsets.UTF_8))
        } catch (_: Exception) {
            return refuse(Reason.MALFORMED, "Ce fichier n'est pas un bundle lisible.")
        }

        if (container.v != 1) {
            return refuse(Reason.UNSUPPORTED_VERSION, "Version de bundle non prise en charge (${container.v}).")
        }

        val localDeviceId = deviceIdProvider()
            ?: return refuse(
                Reason.NOT_ENROLLED,
                "Cet appareil n'est pas enrôlé : un bundle hors-ligne se demande depuis le dashboard pour un appareil connu.",
            )
        if (container.deviceId != localDeviceId) {
            return refuse(Reason.WRONG_DEVICE, "Ce bundle a été émis pour un autre appareil.")
        }

        val notAfterMs = runCatching { java.time.Instant.parse(container.notAfter).toEpochMilli() }.getOrNull()
            ?: return refuse(Reason.MALFORMED, "Date de validité illisible.")
        if (notAfterMs <= clock()) {
            return refuse(Reason.EXPIRED, "Ce bundle a expiré le ${container.notAfter}.")
        }

        val consumed = consumedIds()
        if (container.bundleId in consumed) {
            return refuse(Reason.ALREADY_CONSUMED, "Ce bundle a déjà été utilisé sur cet appareil.")
        }

        if (pinnedKeyB64.isBlank()) {
            return refuse(
                Reason.SIGNATURE_UNAVAILABLE,
                "Aucune clé de vérification n'est intégrée à ce build : import refusé.",
            )
        }

        val message = signedMessage(container)
        when {
            !ed25519Available() -> return refuse(
                Reason.SIGNATURE_UNAVAILABLE,
                "La vérification Ed25519 n'est pas disponible sur cet appareil (Android ${Build.VERSION.SDK_INT}).",
            )
            !verifyEd25519(pinnedKeyB64, message, container.sig) ->
                return refuse(Reason.SIGNATURE_INVALID, "Signature invalide : ce fichier n'a pas été émis par le service.")
        }

        // Déchiffrement : à partir d'ici, le contenu existe en mémoire.
        val plain = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            try {
                DeviceEnvelope.open(
                    keys = keys,
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
                return refuse(Reason.DECRYPT_FAILED, error.message ?: "Impossible de déchiffrer ce bundle.")
            }
        } else {
            return refuse(
                Reason.UNSUPPORTED_DEVICE,
                "Le déchiffrement d'un bundle exige Android 12 ou plus récent.",
            )
        }

        val payload = try {
            decodePayload(plain)
        } catch (_: Exception) {
            return refuse(Reason.MALFORMED, "Le contenu déchiffré n'est pas une liste de configurations.")
        } finally {
            plain.fill(0)
        }

        val now = clock()
        val usable = payload.configs.filter { config ->
            (parseInstant(config.expiresAt) ?: 0L) > now
        }
        if (usable.isEmpty()) {
            // Rien d'utilisable : ni consommé, ni écrit. Le bundle n'a pas servi.
            return refuse(Reason.NOTHING_USABLE, "Toutes les configurations de ce bundle sont déjà expirées.")
        }

        // Marquage AVANT écriture — c'est la garantie d'usage unique côté app.
        if (!markConsumed(container.bundleId)) {
            return refuse(Reason.WRITE_FAILED, "Impossible d'enregistrer la consommation du bundle.")
        }

        val accepted = BundlePayload(
            revision = payload.revision,
            issuedAt = payload.issuedAt,
            expiresAt = payload.expiresAt,
            configs = usable,
        )
        if (!vault.save(accepted)) {
            return refuse(Reason.WRITE_FAILED, "Impossible d'enregistrer les configurations.")
        }

        return Import.Accepted(
            bundleId = container.bundleId,
            payload = accepted,
            droppedExpired = payload.configs.size - usable.size,
        )
    }

    /* -------------------------------------------------------------- vérification */

    /** Vrai si la plateforme sait vérifier de l'Ed25519 (sonde, pas supposition). */
    fun ed25519Available(): Boolean = runCatching { KeyFactory.getInstance("Ed25519") }.isSuccess

    private fun signedMessage(container: Container): ByteArray {
        val envelopeDigest = sha256Hex(
            listOf(
                container.envelope.ephemeralKey,
                container.envelope.salt,
                container.envelope.iv,
                container.envelope.ciphertext,
                container.envelope.tag,
            ).joinToString("|").toByteArray(Charsets.UTF_8),
        )
        return listOf(
            PREFIX,
            container.v.toString(),
            container.bundleId,
            container.deviceId,
            container.issuedAt,
            container.notAfter,
            container.revision.toString(),
            envelopeDigest,
        ).joinToString("\n").toByteArray(Charsets.UTF_8)
    }

    private fun verifyEd25519(publicKeyB64: String, message: ByteArray, signatureB64: String): Boolean = runCatching {
        val spki = Base64.decode(publicKeyB64, Base64.DEFAULT)
        val key = KeyFactory.getInstance("Ed25519").generatePublic(X509EncodedKeySpec(spki))
        val signature = Signature.getInstance("Ed25519")
        signature.initVerify(key)
        signature.update(message)
        signature.verify(Base64.decode(signatureB64, Base64.DEFAULT))
    }.getOrDefault(false)

    private fun sha256Hex(data: ByteArray): String {
        val digest = MessageDigest.getInstance("SHA-256").digest(data)
        return digest.joinToString("") { "%02x".format(it) }
    }

    /* --------------------------------------------------------------- consommation */

    private fun consumedIds(): List<String> {
        val raw = store.getString(KEY_CONSUMED) ?: return emptyList()
        return runCatching { JSON.decodeFromString(ConsumedList.serializer(), raw).ids }.getOrDefault(emptyList())
    }

    /** Écrit la liste des identifiants consommés, en gardant les plus récents. */
    private fun markConsumed(bundleId: String): Boolean {
        val updated = (consumedIds() + bundleId).takeLast(MAX_CONSUMED_IDS)
        val encoded = JSON.encodeToString(ConsumedList.serializer(), ConsumedList(updated))
        return store.putString(KEY_CONSUMED, encoded)
    }

    private fun decodePayload(plain: ByteArray): BundlePayload {
        // `ConfigVault` et l'API partagent le même modèle ; on passe par le même
        // désérialiseur pour que les deux chemins ne divergent jamais.
        val text = plain.toString(Charsets.UTF_8)
        return SingBoxConfig.BUNDLE_JSON.decodeFromString(BundlePayload.serializer(), text)
    }

    private fun refuse(reason: Reason, message: String): Import = Import.Refused(reason, message)

    /* ------------------------------------------------------------------ essai */

    /**
     * Contrôle de forme, **sans** déchiffrer ni consommer : utile à l'écran
     * d'import pour dire « ce fichier a expiré » avant de demander quoi que ce
     * soit. Ne remplace pas [import].
     */
    fun peek(bytes: ByteArray): Import? {
        if (bytes.isEmpty() || bytes.size > MAX_BYTES) return refuse(Reason.MALFORMED, "Fichier vide ou trop gros.")
        val container = runCatching {
            JSON.decodeFromString(Container.serializer(), bytes.toString(Charsets.UTF_8))
        }.getOrNull() ?: return refuse(Reason.MALFORMED, "Ce fichier n'est pas un bundle lisible.")
        val notAfterMs = runCatching { java.time.Instant.parse(container.notAfter).toEpochMilli() }.getOrNull()
            ?: return refuse(Reason.MALFORMED, "Date de validité illisible.")
        if (notAfterMs <= clock()) return refuse(Reason.EXPIRED, "Ce bundle a expiré.")
        if (container.bundleId in consumedIds()) {
            return refuse(Reason.ALREADY_CONSUMED, "Ce bundle a déjà été utilisé.")
        }
        return null
    }
}
