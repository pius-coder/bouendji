package cm.bouendji.vpn.crypto

import java.security.KeyFactory
import java.security.KeyPair
import java.security.KeyPairGenerator
import java.security.MessageDigest
import java.security.PrivateKey
import java.security.spec.ECGenParameterSpec
import java.security.spec.PKCS8EncodedKeySpec
import java.security.spec.X509EncodedKeySpec
import javax.crypto.Cipher
import javax.crypto.KeyAgreement
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

/**
 * Ouverture d'une enveloppe scellée par le serveur
 * (`sealForDevice`, `apps/api/src/lib/crypto.ts:141`).
 *
 * Schéma, à ne pas modifier d'un seul côté :
 *
 *   shared = ECDH(clé privée d'accord, clé éphémère serveur)
 *   key    = HKDF-SHA256(ikm = shared, salt = envelope.salt,
 *                        info = "vpn-bundle-v1|<deviceId>|<revision>", 32 o)
 *   plain  = AES-256-GCM(key, iv = envelope.iv, ct = ciphertext || tag)
 *
 * L'ECDH est passé en paramètre ([agree]) : la même ouverture sert à la clé du
 * Keystore (Android 12+) et à la clé logicielle chiffrée au repos (Android
 * 6 à 11), et elle est testable sur la JVM contre une enveloppe produite par
 * Node (`DeviceEnvelopeTest`).
 */
object DeviceEnvelope {

    const val INFO_PREFIX = "vpn-bundle-v1"

    class OpenException(message: String, cause: Throwable? = null) : Exception(message, cause)

    fun info(deviceId: String, revision: Long): ByteArray =
        "$INFO_PREFIX|$deviceId|$revision".toByteArray(Charsets.UTF_8)

    fun open(
        agree: (peerSpkiDer: ByteArray) -> ByteArray,
        deviceId: String,
        revision: Long,
        ephemeralKeyB64: String,
        saltB64: String,
        ivB64: String,
        ciphertextB64: String,
        tagB64: String,
        digestB64: String?,
    ): ByteArray {
        val ephemeral = decodeStrict(ephemeralKeyB64, "ephemeralKey")
        val salt = decodeStrict(saltB64, "salt")
        val iv = decodeStrict(ivB64, "iv")
        val ciphertext = decodeStrict(ciphertextB64, "ciphertext")
        val tag = decodeStrict(tagB64, "tag")

        if (iv.size != 12) throw OpenException("IV de ${iv.size} octets : 12 attendus.")
        if (tag.size != 16) throw OpenException("Tag de ${tag.size} octets : 16 attendus.")

        val shared = try {
            agree(ephemeral)
        } catch (error: Exception) {
            throw OpenException("Accord de clé impossible : clé d'appareil absente ou invalide.", error)
        }
        val key = try {
            Hkdf.sha256(shared, salt, info(deviceId, revision), 32)
        } finally {
            shared.fill(0)
        }

        val plain = try {
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.DECRYPT_MODE, SecretKeySpec(key, "AES"), GCMParameterSpec(128, iv))
            cipher.doFinal(ciphertext + tag)
        } catch (error: Exception) {
            throw OpenException("Déchiffrement refusé : clé, révision ou appareil ne correspondent pas.", error)
        } finally {
            key.fill(0)
        }

        if (digestB64 != null) {
            val expected = decodeStrict(digestB64, "digest")
            val actual = MessageDigest.getInstance("SHA-256").digest(plain)
            if (!MessageDigest.isEqual(expected, actual)) {
                plain.fill(0)
                throw OpenException("Empreinte du clair différente de celle annoncée.")
            }
        }
        return plain
    }

    private fun decodeStrict(value: String, field: String): ByteArray = try {
        B64.decode(value)
    } catch (error: IllegalArgumentException) {
        throw OpenException("Champ $field : base64 invalide.", error)
    }
}

/**
 * ECDH P-256 en logiciel — repli des appareils Android 6 à 11, où le Keystore
 * ne sait pas faire d'accord de clé (`PURPOSE_AGREE_KEY`, API 31).
 *
 * Fonctions pures, sans dépendance Android : la génération, l'export et
 * l'accord sont testés sur la JVM. La clé privée n'est jamais écrite en clair :
 * l'appelant ([DeviceKeys]) la chiffre avec la clé AES du Keystore.
 */
object SoftwareEcdh {

    private const val CURVE = "secp256r1"

    fun generate(): KeyPair {
        val generator = KeyPairGenerator.getInstance("EC")
        generator.initialize(ECGenParameterSpec(CURVE))
        return generator.generateKeyPair()
    }

    fun privateFromPkcs8(der: ByteArray): PrivateKey =
        KeyFactory.getInstance("EC").generatePrivate(PKCS8EncodedKeySpec(der))

    fun agree(privateKey: PrivateKey, peerSpkiDer: ByteArray): ByteArray {
        val peer = KeyFactory.getInstance("EC").generatePublic(X509EncodedKeySpec(peerSpkiDer))
        val agreement = KeyAgreement.getInstance("ECDH")
        agreement.init(privateKey)
        agreement.doPhase(peer, true)
        return agreement.generateSecret()
    }
}
