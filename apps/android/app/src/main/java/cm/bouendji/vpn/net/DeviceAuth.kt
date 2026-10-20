package cm.bouendji.vpn.net

import android.util.Base64
import cm.bouendji.vpn.crypto.DeviceKeys
import cm.bouendji.vpn.crypto.SecureStore
import java.security.MessageDigest
import java.security.SecureRandom
import java.util.UUID

/**
 * Preuve d'appareil : la chaîne canonique, et l'état local nécessaire pour la
 * produire.
 *
 * La forme signée est **exactement** celle du serveur
 * (`canonicalProof`, `apps/api/src/lib/crypto.ts:114`) :
 *
 *     METHOD \n PATH \n sha256hex(body) \n timestamp \n nonce
 *
 * Contraintes vérifiées côté serveur (`verifyDeviceProof`,
 * `apps/api/src/lib/auth.ts:123-156`) et donc respectées ici :
 *
 *   - `timestamp` en **millisecondes epoch**, tolérance ±120 000 ms ;
 *   - `nonce` entre 16 et 80 caractères, unique par requête (la base refuse le
 *     rejeu : `device_nonces`) ;
 *   - `path` **sans query string** (`req.url.split("?")[0]`) ;
 *   - `sha256` du corps **brut**, donc des octets réellement envoyés, pas d'un
 *     objet re-sérialisé ;
 *   - signature ECDSA-SHA256 DER, base64.
 *
 * L'horloge n'est pas fiable sur un téléphone : le serveur renvoie `serverTime`
 * dans chaque challenge et chaque réponse d'enrôlement. On mémorise l'écart et
 * on l'applique, plutôt que d'envoyer l'heure locale et de prier.
 */
object DeviceProof {

    /**
     * @param method verbe HTTP déjà en majuscules ou non (le serveur met en
     *   majuscules de son côté, on le fait ici aussi).
     * @param path chemin seul, commençant par `/`, sans query.
     * @param body corps exact envoyé, `""` si aucun.
     */
    fun canonical(method: String, path: String, body: String, timestamp: String, nonce: String): String {
        require(path.startsWith("/")) { "chemin attendu commençant par / : $path" }
        require(!path.contains('?')) { "le chemin signé ne contient pas de query" }
        val hash = sha256Hex(body.toByteArray(Charsets.UTF_8))
        return buildString {
            append(method.uppercase())
            append('\n'); append(path)
            append('\n'); append(hash)
            append('\n'); append(timestamp)
            append('\n'); append(nonce)
        }
    }

    fun sha256Hex(data: ByteArray): String {
        val digest = MessageDigest.getInstance("SHA-256").digest(data)
        val out = StringBuilder(digest.size * 2)
        for (byte in digest) {
            val value = byte.toInt() and 0xFF
            out.append(HEX[value ushr 4]).append(HEX[value and 0x0F])
        }
        return out.toString()
    }

    private val HEX = "0123456789abcdef".toCharArray()
}

/** Les trois en-têtes de preuve, noms exacts lus par le serveur. */
data class ProofHeaders(
    val timestamp: String,
    val nonce: String,
    val signature: String,
) {
    fun asHeaders(): Map<String, String> = mapOf(
        HEADER_TIMESTAMP to timestamp,
        HEADER_NONCE to nonce,
        HEADER_SIGNATURE to signature,
    )

    companion object {
        const val HEADER_TIMESTAMP = "X-Device-Timestamp"
        const val HEADER_NONCE = "X-Device-Nonce"
        const val HEADER_SIGNATURE = "X-Device-Signature"
    }
}

/** Nom exact du jeton d'appareil (`x-device-token`, `lib/auth.ts:115`). */
const val HEADER_DEVICE_TOKEN = "X-Device-Token"

/**
 * État d'identité local : jeton d'appareil, identifiant d'installation, écart
 * d'horloge, et la fabrique de preuves.
 *
 * Aucun de ces champs ne dérive d'un identifiant matériel. L'`installationId`
 * est un UUID v4 tiré au hasard à la première ouverture et conservé chiffré.
 * Conséquence assumée : désinstaller l'app crée une nouvelle installation, donc
 * un nouvelle appareil à enrôler, qui consommera une place.
 */
class DeviceAuth(
    private val keys: DeviceKeys,
    private val store: SecureStore,
    private val random: SecureRandom = SecureRandom(),
) {

    companion object {
        private const val KEY_INSTALLATION_ID = "auth.installationId"
        private const val KEY_DEVICE_TOKEN = "auth.deviceToken"
        private const val KEY_DEVICE_ID = "auth.deviceId"
        private const val KEY_CLOCK_SKEW = "auth.clockSkewMs"

        /** Le serveur exige 16 à 80 caractères ; 16 octets base64url en font 22. */
        private const val NONCE_BYTES = 16
    }

    /* -------------------------------------------------------- installation */

    /** UUID local, créé une fois, jamais dérivé du matériel. */
    fun installationId(): String {
        store.getString(KEY_INSTALLATION_ID)?.let { return it }
        val generated = UUID.randomUUID().toString()
        store.putString(KEY_INSTALLATION_ID, generated)
        return generated
    }

    /* ------------------------------------------------------------ appareil */

    fun deviceToken(): String? = store.getString(KEY_DEVICE_TOKEN)

    fun deviceId(): String? = store.getString(KEY_DEVICE_ID)

    fun rememberDevice(deviceId: String, deviceToken: String) {
        store.putString(KEY_DEVICE_ID, deviceId)
        store.putString(KEY_DEVICE_TOKEN, deviceToken)
    }

    fun forgetDevice() {
        store.remove(KEY_DEVICE_TOKEN)
        store.remove(KEY_DEVICE_ID)
    }

    fun isEnrolled(): Boolean = deviceToken() != null && keys.hasIdentity()

    /* ---------------------------------------------------------------- horloge */

    /**
     * Mémorise l'écart entre l'horloge serveur et l'horloge locale, à partir
     * d'un `serverTime` ISO-8601 reçu dans une réponse.
     */
    fun syncClock(serverTimeIso: String) {
        val serverMs = runCatching { java.time.Instant.parse(serverTimeIso).toEpochMilli() }.getOrNull() ?: return
        store.putString(KEY_CLOCK_SKEW, (serverMs - System.currentTimeMillis()).toString())
    }

    private fun now(): Long {
        val skew = store.getString(KEY_CLOCK_SKEW)?.toLongOrNull() ?: 0L
        return System.currentTimeMillis() + skew
    }

    /* ----------------------------------------------------------------- preuve */

    /**
     * Preuve pour une requête ordinaire : nonce neuf à chaque appel.
     *
     * @param nonceOverride utilisé pour l'enrôlement, où le nonce **doit** être
     *   celui du challenge (sinon le challenge ne prouve rien :
     *   `routes/devices.ts:149`).
     */
    fun proof(
        method: String,
        path: String,
        body: String,
        nonceOverride: String? = null,
    ): ProofHeaders {
        val timestamp = now().toString()
        val nonce = nonceOverride ?: newNonce()
        val message = DeviceProof.canonical(method, path, body, timestamp, nonce)
        return ProofHeaders(
            timestamp = timestamp,
            nonce = nonce,
            signature = keys.signUtf8(message),
        )
    }

    /** Nonce base64url sans padding, 22 caractères. */
    fun newNonce(): String {
        val bytes = ByteArray(NONCE_BYTES)
        random.nextBytes(bytes)
        return Base64.encodeToString(bytes, Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING)
    }
}
