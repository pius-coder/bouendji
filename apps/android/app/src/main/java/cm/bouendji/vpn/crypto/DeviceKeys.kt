package cm.bouendji.vpn.crypto

import android.os.Build
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import androidx.annotation.RequiresApi
import java.security.KeyFactory
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.MessageDigest
import java.security.PrivateKey
import java.security.Signature
import java.security.spec.ECGenParameterSpec
import java.security.spec.X509EncodedKeySpec
import javax.crypto.Cipher
import javax.crypto.KeyAgreement
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

/**
 * Les deux clés d'identité de l'appareil (D4), dans Android Keystore.
 *
 *   alias `vpn-sign`  — EC P-256, PURPOSE_SIGN. Signe
 *                       `METHOD\nPATH\nsha256(body)\ntimestamp\nnonce`.
 *   alias `vpn-agree` — EC P-256, PURPOSE_AGREE_KEY. Sert à l'ECDH qui déchiffre
 *                       les enveloppes scellées par le serveur.
 *
 * Trois invariants :
 *
 * 1. **Aucune clé privée ne sort.** Le Keystore ne rend jamais de bytes privés :
 *    on ne demande que `PublicKey.encoded` (SPKI DER), exactement ce que le
 *    serveur attend (`parseSpki`, `apps/api/src/lib/crypto.ts:101`).
 * 2. **Aucun identifiant matériel.** Ni `ANDROID_ID`, ni `Build.SERIAL`, ni
 *    IMEI : l'identité est la paire de clés, et l'`installationId` est un UUID
 *    aléatoire stocké localement.
 * 3. **Les alias sont séparés par usage.** Une clé qui signe ne fait pas d'ECDH,
 *    même si P-256 le permettrait : la compromission d'un usage ne donne pas
 *    l'autre.
 *
 * Contrainte réelle, non contournée : `PURPOSE_AGREE_KEY` n'existe qu'à partir
 * d'API 31, alors que `minSdk` est 26. Sur API 26–30, la clé d'accord n'est pas
 * générable ; `supportsAgreement()` le dit et l'enrôlement doit refuser
 * l'appareil avec un message explicite plutôt que d'inventer un repli qui
 * sortirait une clé privée du Keystore. Aucune vérification sur appareil n'a
 * été faite ici.
 */
class DeviceKeys(
    private val keyStore: KeyStore = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) },
) {

    companion object {
        const val ANDROID_KEYSTORE = "AndroidKeyStore"
        const val ALIAS_SIGN = "vpn-sign"
        const val ALIAS_AGREE = "vpn-agree"

        private const val CURVE = "secp256r1"
        private const val SIGNATURE_ALGORITHM = "SHA256withECDSA"

        /** `KeyAgreement` ECDH sur Keystore : API 31 minimum. */
        fun supportsAgreement(): Boolean = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
    }

    /* --------------------------------------------------------------- création */

    /** Crée la clé de signature si absente. Idempotent. */
    fun ensureSigningKey(): Boolean {
        if (keyStore.containsAlias(ALIAS_SIGN)) return true
        val generator = KeyPairGenerator.getInstance(KeyProperties.KEY_ALGORITHM_EC, ANDROID_KEYSTORE)
        val spec = KeyGenParameterSpec.Builder(
            ALIAS_SIGN,
            KeyProperties.PURPOSE_SIGN or KeyProperties.PURPOSE_VERIFY,
        )
            .setAlgorithmParameterSpec(ECGenParameterSpec(CURVE))
            .setDigests(KeyProperties.DIGEST_SHA256)
            // Jamais de biometrie : le tunnel doit pouvoir se reconnecter écran
            // éteint, et une clé invalidée par un changement d'empreinte
            // couperait l'accès sans recours hors ligne.
            .setUserAuthenticationRequired(false)
            .build()
        generator.initialize(spec)
        generator.generateKeyPair()
        return keyStore.containsAlias(ALIAS_SIGN)
    }

    /** Crée la clé d'accord si absente. API 31+. */
    @RequiresApi(Build.VERSION_CODES.S)
    fun ensureAgreementKey(): Boolean {
        if (keyStore.containsAlias(ALIAS_AGREE)) return true
        val generator = KeyPairGenerator.getInstance(KeyProperties.KEY_ALGORITHM_EC, ANDROID_KEYSTORE)
        val spec = KeyGenParameterSpec.Builder(ALIAS_AGREE, KeyProperties.PURPOSE_AGREE_KEY)
            .setAlgorithmParameterSpec(ECGenParameterSpec(CURVE))
            .setUserAuthenticationRequired(false)
            .build()
        generator.initialize(spec)
        generator.generateKeyPair()
        return keyStore.containsAlias(ALIAS_AGREE)
    }

    fun hasIdentity(): Boolean =
        keyStore.containsAlias(ALIAS_SIGN) && keyStore.containsAlias(ALIAS_AGREE)

    /**
     * Efface l'identité locale. À n'appeler que sur révocation ou réinstallation
     * volontaire : l'appareil redevient inconnu du serveur et consommera une
     * nouvelle place.
     */
    fun deleteAll() {
        for (alias in listOf(ALIAS_SIGN, ALIAS_AGREE)) {
            runCatching { keyStore.deleteEntry(alias) }
        }
    }

    /* ------------------------------------------------------------- clés publiques */

    /** SPKI DER en base64 standard — le format exact de `signingKey` côté serveur. */
    fun signingPublicKeySpkiB64(): String = publicKeySpkiB64(ALIAS_SIGN)

    fun agreementPublicKeySpkiB64(): String = publicKeySpkiB64(ALIAS_AGREE)

    private fun publicKeySpkiB64(alias: String): String {
        val certificate = keyStore.getCertificate(alias)
            ?: error("alias Keystore absent : $alias")
        return Base64.encodeToString(certificate.publicKey.encoded, Base64.NO_WRAP)
    }

    /* ----------------------------------------------------------------- signature */

    /**
     * Signature ECDSA-SHA256, encodage DER, en base64 — c'est ce que
     * `crypto.verify("sha256", …, signatureB64)` accepte côté Node.
     *
     * `message` est la chaîne canonique encodée en UTF-8 ; le Keystore ne signe
     * que des octets, la canonicalisation est la responsabilité de [DeviceProof].
     */
    fun signUtf8(message: String): String {
        val signature = signBytes(message.toByteArray(Charsets.UTF_8))
        return Base64.encodeToString(signature, Base64.NO_WRAP)
    }

    private fun signBytes(message: ByteArray): ByteArray {
        val key = keyStore.getKey(ALIAS_SIGN, null) as? PrivateKey
            ?: error("clé de signature absente : $ALIAS_SIGN")
        val signer = Signature.getInstance(SIGNATURE_ALGORITHM)
        signer.initSign(key)
        signer.update(message)
        return signer.sign()
    }

    /* -------------------------------------------------------------------- ECDH */

    /**
     * Secret partagé ECDH avec la clé éphémère du serveur.
     *
     * `peerSpkiDer` est le DER SPKI décodé de `SealedEnvelope.ephemeralKey`.
     * Le Keystore refuse `generateSecret()` sur une clé d'accord créée avec
     * `PURPOSE_AGREE_KEY` si l'appelant tente de lire la clé privée : on ne
     * demande que le secret, jamais le matériel de clé.
     */
    @RequiresApi(Build.VERSION_CODES.S)
    fun agreementSecret(peerSpkiDer: ByteArray): ByteArray {
        val key = keyStore.getKey(ALIAS_AGREE, null) as? PrivateKey
            ?: error("clé d'accord absente : $ALIAS_AGREE")
        val peer = KeyFactory.getInstance(KeyProperties.KEY_ALGORITHM_EC)
            .generatePublic(X509EncodedKeySpec(peerSpkiDer))
        val agreement = KeyAgreement.getInstance("ECDH")
        agreement.init(key)
        agreement.doPhase(peer, true)
        return agreement.generateSecret()
    }
}

/**
 * Ouverture d'une enveloppe scellée par le serveur
 * (`sealForDevice`, `apps/api/src/lib/crypto.ts:141`).
 *
 * Schéma, à ne pas modifier d'un seul côté :
 *
 *   shared = ECDH(clé privée `vpn-agree`, clé éphémère serveur)
 *   key    = HKDF-SHA256(ikm = shared, salt = envelope.salt,
 *                        info = "vpn-bundle-v1|<deviceId>|<revision>", 32 o)
 *   plain  = AES-256-GCM(key, iv = envelope.iv, ct = ciphertext || tag)
 *
 * Le `digest` (SHA-256 du clair, base64) est revérifié après coup : GCM suffit
 * déjà à authentifier, mais un écart de `revision` ou de `deviceId` dans
 * l'`info` produit alors un message d'erreur exact au lieu d'un « tag invalide ».
 */
object DeviceEnvelope {

    const val INFO_PREFIX = "vpn-bundle-v1"

    class OpenException(message: String, cause: Throwable? = null) : Exception(message, cause)

    fun info(deviceId: String, revision: Long): ByteArray =
        "$INFO_PREFIX|$deviceId|$revision".toByteArray(Charsets.UTF_8)

    @RequiresApi(Build.VERSION_CODES.S)
    fun open(
        keys: DeviceKeys,
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

        val shared = keys.agreementSecret(ephemeral)
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
            throw OpenException(
                "Déchiffrement refusé : clé, révision ou appareil ne correspondent pas.",
                error,
            )
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
        Base64.decode(value, Base64.DEFAULT)
    } catch (error: IllegalArgumentException) {
        throw OpenException("Champ $field : base64 invalide.", error)
    }
}
