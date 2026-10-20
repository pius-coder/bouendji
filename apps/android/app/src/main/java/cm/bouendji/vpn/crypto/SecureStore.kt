package cm.bouendji.vpn.crypto

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * Stockage local chiffré — AES-256-GCM dont la clé vit dans Android Keystore.
 *
 * Ce qui est sur disque : des `SharedPreferences` qui ne contiennent que
 * `base64(iv || ciphertext || tag)`. Ce qui n'y est jamais : un URI VLESS en
 * clair, un jeton de session en clair, une clé privée (elle ne quitte pas le
 * Keystore de toute façon).
 *
 * Trois choix explicites :
 *
 * 1. **La clé est `vpn-store`**, un troisième alias, distinct de `vpn-sign` et
 *    `vpn-agree`. Un stockage compromis ne donne pas la capacité de signer une
 *    requête.
 * 2. **Le nom de la préférence sert d'AAD** : une valeur déplacée d'une clé à
 *    une autre ne se déchiffre pas. Cela empêche un échange d'entrées entre
 *    deux bundles ou deux sessions.
 * 3. **`commit()`, pas `apply()`.** L'ordre des écritures est une garantie
 *    métier ici : un bundle hors-ligne doit être marqué consommé *avant* que
 *    ses configurations soient écrites. Une écriture asynchrone ne garantirait
 *    rien en cas de coupure.
 *
 * En cas d'échec de déchiffrement (clé invalidée, données corrompues), l'entrée
 * est supprimée et `null` est renvoyé : la donnée est perdue, pas silencieusement
 * remplacée par une valeur fausse.
 */
class SecureStore(context: Context) {

    companion object {
        private const val PREFS = "vpn.secure.v1"
        private const val ALIAS_STORE = "vpn-store"
        private const val ANDROID_KEYSTORE = "AndroidKeyStore"
        private const val IV_LENGTH = 12
        private const val TAG_BITS = 128
    }

    private val prefs = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    private val lock = Any()
    private val keyStore: KeyStore = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }

    /* ------------------------------------------------------------------ clé */

    private fun secretKey(): SecretKey {
        val existing = keyStore.getEntry(ALIAS_STORE, null) as? KeyStore.SecretKeyEntry
        if (existing != null) return existing.secretKey

        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEYSTORE)
        generator.init(
            KeyGenParameterSpec.Builder(
                ALIAS_STORE,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .setRandomizedEncryptionRequired(true)
                .setUserAuthenticationRequired(false)
                .build(),
        )
        return generator.generateKey()
    }

    /** Efface la clé et toutes les valeurs : l'appareil redevient nu. */
    fun wipe() {
        synchronized(lock) {
            prefs.edit().clear().commit()
            runCatching { keyStore.deleteEntry(ALIAS_STORE) }
        }
    }

    /* -------------------------------------------------------------- écriture */

    fun putString(key: String, value: String): Boolean =
        putBytes(key, value.toByteArray(Charsets.UTF_8))

    fun putBytes(key: String, plain: ByteArray): Boolean = synchronized(lock) {
        try {
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.ENCRYPT_MODE, secretKey())
            cipher.updateAAD(key.toByteArray(Charsets.UTF_8))
            val sealed = cipher.doFinal(plain)
            val blob = cipher.iv + sealed
            prefs.edit().putString(key, Base64.encodeToString(blob, Base64.NO_WRAP)).commit()
        } catch (_: Exception) {
            false
        }
    }

    /* --------------------------------------------------------------- lecture */

    fun getString(key: String): String? = getBytes(key)?.toString(Charsets.UTF_8)

    fun getBytes(key: String): ByteArray? = synchronized(lock) {
        val encoded = prefs.getString(key, null) ?: return null
        val blob = try {
            Base64.decode(encoded, Base64.DEFAULT)
        } catch (_: IllegalArgumentException) {
            remove(key)
            return null
        }
        if (blob.size <= IV_LENGTH) {
            remove(key)
            return null
        }
        val iv = blob.copyOfRange(0, IV_LENGTH)
        val sealed = blob.copyOfRange(IV_LENGTH, blob.size)
        return try {
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.DECRYPT_MODE, secretKey(), GCMParameterSpec(TAG_BITS, iv))
            cipher.updateAAD(key.toByteArray(Charsets.UTF_8))
            cipher.doFinal(sealed)
        } catch (_: Exception) {
            // Clé invalidée ou données corrompues : on ne garde pas un fantôme.
            remove(key)
            null
        }
    }

    fun contains(key: String): Boolean = prefs.contains(key)

    fun remove(key: String) {
        synchronized(lock) { prefs.edit().remove(key).commit() }
    }

    /* ------------------------------------------------------------- inventaire */

    /**
     * Supprime toutes les entrées dont le nom commence par [prefix]. Utilisé
     * pour purger les sessions d'une marque ou d'un compte sans toucher à
     * l'identité de l'appareil (`vpn-sign` / `vpn-agree`).
     */
    fun removeByPrefix(prefix: String) {
        synchronized(lock) {
            val editor = prefs.edit()
            for (name in prefs.all.keys) {
                if (name.startsWith(prefix)) editor.remove(name)
            }
            editor.commit()
        }
    }
}
