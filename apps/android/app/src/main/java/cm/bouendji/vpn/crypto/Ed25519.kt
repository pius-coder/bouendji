package cm.bouendji.vpn.crypto

import java.math.BigInteger
import java.security.KeyFactory
import java.security.MessageDigest
import java.security.Signature
import java.security.spec.X509EncodedKeySpec

/**
 * Vérification Ed25519 (RFC 8032 §5.1.7) — signature du fichier hors-ligne (D29).
 *
 * `KeyFactory.getInstance("Ed25519")` n'est pas garanti avant Android 13 : la
 * plateforme est essayée d'abord, puis cette implémentation en Kotlin pur,
 * transcription directe du code de référence de la RFC (coordonnées étendues).
 * Elle n'a qu'un usage — vérifier une signature publique —, donc l'absence de
 * temps constant n'expose aucun secret.
 *
 * Testée contre les vecteurs 1 et 2 de la RFC et contre l'Ed25519 du JDK
 * (`Ed25519Test`).
 */
object Ed25519 {

    /** Préfixe DER d'une clé publique Ed25519 SPKI (RFC 8410) : 12 octets, puis 32 octets de clé. */
    private val SPKI_PREFIX = byteArrayOf(
        0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x03, 0x21, 0x00,
    )

    /** `BigInteger.TWO` n'existe qu'à partir de Java 9 : constante locale, déclarée avant son premier usage. */
    private val TWO: BigInteger = BigInteger.valueOf(2)

    private val P: BigInteger = BigInteger.ONE.shiftLeft(255).subtract(BigInteger.valueOf(19))
    private val L: BigInteger = BigInteger.ONE.shiftLeft(252).add(BigInteger("27742317777372353535851937790883648493"))
    private val D: BigInteger = BigInteger.valueOf(-121665).multiply(inv(BigInteger.valueOf(121666))).mod(P)
    private val SQRT_M1: BigInteger = TWO.modPow(P.subtract(BigInteger.ONE).shiftRight(2), P)

    private val G: Array<BigInteger> by lazy {
        val gy = BigInteger.valueOf(4).multiply(inv(BigInteger.valueOf(5))).mod(P)
        val gx = recoverX(gy, 0) ?: error("Ed25519 : point de base invalide")
        arrayOf(gx, gy, BigInteger.ONE, gx.multiply(gy).mod(P))
    }

    /** Clé brute de 32 octets extraite d'un SPKI DER, ou `null` si ce n'est pas une clé Ed25519. */
    fun rawFromSpki(spki: ByteArray): ByteArray? {
        if (spki.size == 32) return spki
        if (spki.size != SPKI_PREFIX.size + 32) return null
        for (i in SPKI_PREFIX.indices) if (spki[i] != SPKI_PREFIX[i]) return null
        return spki.copyOfRange(SPKI_PREFIX.size, spki.size)
    }

    /** Plateforme d'abord ; implémentation pure si elle est absente ou refuse la clé. */
    fun verifySpki(spki: ByteArray, message: ByteArray, signature: ByteArray): Boolean {
        val platform = runCatching {
            val key = KeyFactory.getInstance("Ed25519").generatePublic(X509EncodedKeySpec(spki))
            val verifier = Signature.getInstance("Ed25519")
            verifier.initVerify(key)
            verifier.update(message)
            verifier.verify(signature)
        }
        if (platform.isSuccess) return platform.getOrThrow()
        val raw = rawFromSpki(spki) ?: return false
        return verify(raw, message, signature)
    }

    /** Vérification pure. [publicKey] : 32 octets ; [signature] : 64 octets. */
    fun verify(publicKey: ByteArray, message: ByteArray, signature: ByteArray): Boolean {
        if (publicKey.size != 32 || signature.size != 64) return false
        val a = decompress(publicKey) ?: return false
        val rBytes = signature.copyOfRange(0, 32)
        val r = decompress(rBytes) ?: return false
        val s = littleEndian(signature.copyOfRange(32, 64))
        if (s >= L) return false

        val digest = MessageDigest.getInstance("SHA-512")
        digest.update(rBytes)
        digest.update(publicKey)
        digest.update(message)
        val h = littleEndian(digest.digest()).mod(L)

        val sB = multiply(s, G)
        val hA = multiply(h, a)
        return equal(sB, add(r, hA))
    }

    /* ------------------------------------------------------------- arithmétique */

    private fun inv(x: BigInteger): BigInteger = x.modPow(P.subtract(TWO), P)

    private fun add(p: Array<BigInteger>, q: Array<BigInteger>): Array<BigInteger> {
        val a = p[1].subtract(p[0]).multiply(q[1].subtract(q[0])).mod(P)
        val b = p[1].add(p[0]).multiply(q[1].add(q[0])).mod(P)
        val c = TWO.multiply(p[3]).multiply(q[3]).multiply(D).mod(P)
        val d = TWO.multiply(p[2]).multiply(q[2]).mod(P)
        val e = b.subtract(a)
        val f = d.subtract(c)
        val g = d.add(c)
        val h = b.add(a)
        return arrayOf(e.multiply(f).mod(P), g.multiply(h).mod(P), f.multiply(g).mod(P), e.multiply(h).mod(P))
    }

    private fun multiply(scalar: BigInteger, point: Array<BigInteger>): Array<BigInteger> {
        var q = arrayOf(BigInteger.ZERO, BigInteger.ONE, BigInteger.ONE, BigInteger.ZERO)
        var p = point
        var s = scalar
        while (s.signum() > 0) {
            if (s.testBit(0)) q = add(q, p)
            p = add(p, p)
            s = s.shiftRight(1)
        }
        return q
    }

    private fun equal(p: Array<BigInteger>, q: Array<BigInteger>): Boolean {
        if (p[0].multiply(q[2]).subtract(q[0].multiply(p[2])).mod(P).signum() != 0) return false
        if (p[1].multiply(q[2]).subtract(q[1].multiply(p[2])).mod(P).signum() != 0) return false
        return true
    }

    private fun recoverX(y: BigInteger, sign: Int): BigInteger? {
        if (y >= P) return null
        val y2 = y.multiply(y)
        val x2 = y2.subtract(BigInteger.ONE).multiply(inv(D.multiply(y2).add(BigInteger.ONE))).mod(P)
        if (x2.signum() == 0) return if (sign != 0) null else BigInteger.ZERO
        var x = x2.modPow(P.add(BigInteger.valueOf(3)).shiftRight(3), P)
        if (x.multiply(x).subtract(x2).mod(P).signum() != 0) x = x.multiply(SQRT_M1).mod(P)
        if (x.multiply(x).subtract(x2).mod(P).signum() != 0) return null
        if ((if (x.testBit(0)) 1 else 0) != sign) x = P.subtract(x)
        return x
    }

    private fun decompress(bytes: ByteArray): Array<BigInteger>? {
        if (bytes.size != 32) return null
        var y = littleEndian(bytes)
        val sign = if (y.testBit(255)) 1 else 0
        y = y.clearBit(255)
        val x = recoverX(y, sign) ?: return null
        return arrayOf(x, y, BigInteger.ONE, x.multiply(y).mod(P))
    }

    private fun littleEndian(bytes: ByteArray): BigInteger = BigInteger(1, bytes.reversedArray())
}
