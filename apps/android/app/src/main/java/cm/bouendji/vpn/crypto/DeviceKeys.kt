package cm.bouendji.vpn.crypto

import android.os.Build
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import androidx.annotation.RequiresApi
import java.security.KeyFactory
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.PrivateKey
import java.security.Signature
import java.security.spec.ECGenParameterSpec
import java.security.spec.X509EncodedKeySpec
import javax.crypto.KeyAgreement

/**
 * Les deux clés d'identité de l'appareil (D4).
 *
 *   `vpn-sign`  — EC P-256 dans le Keystore, PURPOSE_SIGN (API 23+). Signe
 *                 `METHOD\nPATH\nsha256(body)\ntimestamp\nnonce`.
 *   accord      — EC P-256, sert à l'ECDH qui ouvre les enveloppes du serveur.
 *
 * ## Deux modes pour la clé d'accord
 *
 * | Mode | Android | Où vit la clé privée |
 * |---|---|---|
 * | [AgreementMode.KEYSTORE] | 12+ (API 31) | Keystore, alias `vpn-agree`, jamais exportable |
 * | [AgreementMode.WRAPPED]  | 6 à 11 (API 23-30) | PKCS#8 chiffré AES-256-GCM par la clé Keystore de [SecureStore] |
 *
 * `PURPOSE_AGREE_KEY` n'existe qu'à partir de l'API 31 (`api-versions.xml`).
 * Exiger Android 12 excluait une grande partie des téléphones du marché visé
 * (Cameroun, parc ancien) : le mode [AgreementMode.WRAPPED] est le repli
 * explicite, et son coût est écrit : la clé privée passe en mémoire du
 * processus le temps d'un accord (voir `notes/compat-abi-minsdk.md`).
 *
 * Le mode est **fixé à la création** et mémorisé : un téléphone mis à jour
 * vers Android 12 garde sa clé logicielle, que le serveur connaît déjà.
 *
 * Invariants conservés : aucun identifiant matériel, alias séparés par usage,
 * aucune clé privée écrite en clair.
 */
class DeviceKeys(
    private val store: SecureStore,
    private val keyStore: KeyStore = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) },
) {

    enum class AgreementMode { KEYSTORE, WRAPPED }

    companion object {
        const val ANDROID_KEYSTORE = "AndroidKeyStore"
        const val ALIAS_SIGN = "vpn-sign"
        const val ALIAS_AGREE = "vpn-agree"

        private const val KEY_MODE = "keys.agree.mode"
        private const val KEY_WRAPPED_PRIVATE = "keys.agree.pkcs8"
        private const val KEY_WRAPPED_PUBLIC = "keys.agree.spki"

        private const val CURVE = "secp256r1"
        private const val SIGNATURE_ALGORITHM = "SHA256withECDSA"

        /** Accord de clé dans le Keystore : API 31 minimum. */
        fun keystoreAgreementSupported(): Boolean = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S

        /** Toujours vrai depuis le repli logiciel : conservé pour les appelants existants. */
        fun supportsAgreement(): Boolean = true
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
            // Jamais de biométrie : le tunnel doit pouvoir se reconnecter écran
            // éteint, et une clé invalidée couperait l'accès sans recours.
            .setUserAuthenticationRequired(false)
            .build()
        generator.initialize(spec)
        generator.generateKeyPair()
        return keyStore.containsAlias(ALIAS_SIGN)
    }

    /** Mode courant, ou `null` si aucune clé d'accord n'existe encore. */
    fun agreementMode(): AgreementMode? {
        val stored = store.getString(KEY_MODE)?.let { runCatching { AgreementMode.valueOf(it) }.getOrNull() }
        if (stored == AgreementMode.WRAPPED && store.contains(KEY_WRAPPED_PRIVATE)) return AgreementMode.WRAPPED
        if (keyStore.containsAlias(ALIAS_AGREE)) return AgreementMode.KEYSTORE
        return null
    }

    /** Crée la clé d'accord si absente, dans le meilleur mode disponible. Idempotent. */
    fun ensureAgreementKey(): AgreementMode {
        agreementMode()?.let { return it }
        return if (keystoreAgreementSupported()) {
            createKeystoreAgreementKey()
            store.putString(KEY_MODE, AgreementMode.KEYSTORE.name)
            AgreementMode.KEYSTORE
        } else {
            val pair = SoftwareEcdh.generate()
            val private = pair.private.encoded
            try {
                check(store.putBytes(KEY_WRAPPED_PRIVATE, private)) { "écriture de la clé d'accord refusée" }
                check(store.putString(KEY_WRAPPED_PUBLIC, B64.encode(pair.public.encoded))) { "écriture de la clé publique refusée" }
                check(store.putString(KEY_MODE, AgreementMode.WRAPPED.name)) { "écriture du mode refusée" }
            } finally {
                private.fill(0)
            }
            AgreementMode.WRAPPED
        }
    }

    @RequiresApi(Build.VERSION_CODES.S)
    private fun createKeystoreAgreementKey() {
        val generator = KeyPairGenerator.getInstance(KeyProperties.KEY_ALGORITHM_EC, ANDROID_KEYSTORE)
        val spec = KeyGenParameterSpec.Builder(ALIAS_AGREE, KeyProperties.PURPOSE_AGREE_KEY)
            .setAlgorithmParameterSpec(ECGenParameterSpec(CURVE))
            .setUserAuthenticationRequired(false)
            .build()
        generator.initialize(spec)
        generator.generateKeyPair()
    }

    fun hasIdentity(): Boolean = keyStore.containsAlias(ALIAS_SIGN) && agreementMode() != null

    /**
     * Efface l'identité locale. À n'appeler que sur révocation ou réinstallation
     * volontaire : l'appareil redevient inconnu du serveur.
     */
    fun deleteAll() {
        for (alias in listOf(ALIAS_SIGN, ALIAS_AGREE)) runCatching { keyStore.deleteEntry(alias) }
        store.remove(KEY_WRAPPED_PRIVATE)
        store.remove(KEY_WRAPPED_PUBLIC)
        store.remove(KEY_MODE)
    }

    /* ------------------------------------------------------------- clés publiques */

    /** SPKI DER en base64 standard — le format exact de `signingKey` côté serveur. */
    fun signingPublicKeySpkiB64(): String {
        val certificate = keyStore.getCertificate(ALIAS_SIGN) ?: error("alias Keystore absent : $ALIAS_SIGN")
        return B64.encode(certificate.publicKey.encoded)
    }

    fun agreementPublicKeySpkiB64(): String = when (agreementMode()) {
        AgreementMode.KEYSTORE -> {
            val certificate = keyStore.getCertificate(ALIAS_AGREE) ?: error("alias Keystore absent : $ALIAS_AGREE")
            B64.encode(certificate.publicKey.encoded)
        }
        AgreementMode.WRAPPED -> store.getString(KEY_WRAPPED_PUBLIC) ?: error("clé publique d'accord absente")
        null -> error("clé d'accord absente")
    }

    /* ----------------------------------------------------------------- signature */

    /** ECDSA-SHA256, DER, base64 — ce que `crypto.verify("sha256", …)` accepte côté Node. */
    fun signUtf8(message: String): String {
        val key = keyStore.getKey(ALIAS_SIGN, null) as? PrivateKey ?: error("clé de signature absente : $ALIAS_SIGN")
        val signer = Signature.getInstance(SIGNATURE_ALGORITHM)
        signer.initSign(key)
        signer.update(message.toByteArray(Charsets.UTF_8))
        return B64.encode(signer.sign())
    }

    /* -------------------------------------------------------------------- ECDH */

    /** Secret partagé avec la clé éphémère du serveur (`SealedEnvelope.ephemeralKey`, SPKI DER). */
    fun agreementSecret(peerSpkiDer: ByteArray): ByteArray = when (agreementMode()) {
        AgreementMode.KEYSTORE -> keystoreSecret(peerSpkiDer)
        AgreementMode.WRAPPED -> {
            val der = store.getBytes(KEY_WRAPPED_PRIVATE) ?: error("clé d'accord illisible")
            try {
                SoftwareEcdh.agree(SoftwareEcdh.privateFromPkcs8(der), peerSpkiDer)
            } finally {
                der.fill(0)
            }
        }
        null -> error("clé d'accord absente : enrôlement requis")
    }

    private fun keystoreSecret(peerSpkiDer: ByteArray): ByteArray {
        val key = keyStore.getKey(ALIAS_AGREE, null) as? PrivateKey ?: error("clé d'accord absente : $ALIAS_AGREE")
        val peer = KeyFactory.getInstance(KeyProperties.KEY_ALGORITHM_EC).generatePublic(X509EncodedKeySpec(peerSpkiDer))
        val agreement = KeyAgreement.getInstance("ECDH")
        agreement.init(key)
        agreement.doPhase(peer, true)
        return agreement.generateSecret()
    }
}
