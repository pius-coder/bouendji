package cm.bouendji.vpn.crypto

import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

/**
 * HKDF-SHA256 (RFC 5869), extract puis expand.
 *
 * Pourquoi à la main : ni le JDK ni Android n'exposent HKDF, et le serveur en a
 * besoin (`hkdfSync("sha256", shared, salt, info, 32)` dans
 * `apps/api/src/lib/crypto.ts:151`). Une implémentation de bibliothèque
 * ajouterait une dépendance dont aucune version n'est vérifiée ici.
 *
 * Le sel est de 16 octets, la sortie de 32 octets, et l'`info` est
 * `vpn-bundle-v1|<deviceId>|<revision>` : toute divergence avec le serveur se
 * manifeste par un échec d'authentification GCM, pas par un résultat faux.
 */
internal object Hkdf {

    private const val ALGORITHM = "HmacSHA256"
    private const val HASH_LEN = 32

    fun sha256(ikm: ByteArray, salt: ByteArray, info: ByteArray, length: Int): ByteArray {
        require(length > 0) { "hkdf: longueur nulle" }
        require(length <= 255 * HASH_LEN) { "hkdf: longueur trop grande" }

        // Extract : PRK = HMAC(salt, IKM). Un sel vide est autorisé par la RFC
        // et remplacé par HASH_LEN zéros.
        val effectiveSalt = if (salt.isEmpty()) ByteArray(HASH_LEN) else salt
        val mac = Mac.getInstance(ALGORITHM)
        mac.init(SecretKeySpec(effectiveSalt, ALGORITHM))
        val prk = mac.doFinal(ikm)

        // Expand : T(n) = HMAC(PRK, T(n-1) || info || n)
        mac.init(SecretKeySpec(prk, ALGORITHM))
        val out = ByteArray(length)
        var previous = ByteArray(0)
        var offset = 0
        var counter = 1
        while (offset < length) {
            mac.reset()
            mac.update(previous)
            mac.update(info)
            mac.update(counter.toByte())
            previous = mac.doFinal()
            val take = minOf(previous.size, length - offset)
            previous.copyInto(out, offset, 0, take)
            offset += take
            counter++
        }
        // Efface le PRK : il vaut la clé de chiffrement.
        prk.fill(0)
        return out
    }
}
