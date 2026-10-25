package cm.bouendji.vpn.crypto

import kotlin.io.encoding.Base64
import kotlin.io.encoding.ExperimentalEncodingApi

/**
 * Base64 indépendant de la plateforme.
 *
 * `java.util.Base64` n'existe qu'à partir d'Android 8 (API 26), et
 * `android.util.Base64` n'existe pas sur la JVM des tests unitaires. La
 * bibliothèque standard Kotlin couvre les deux, de l'API 23 à la JVM.
 */
@OptIn(ExperimentalEncodingApi::class)
object B64 {

    /** Base64 standard avec remplissage — le format de l'API (`Buffer.toString("base64")`). */
    fun encode(bytes: ByteArray): String = Base64.Default.encode(bytes)

    /** Base64url sans remplissage — nonces et secrets locaux. */
    fun encodeUrl(bytes: ByteArray): String = Base64.UrlSafe.encode(bytes).trimEnd('=')

    /**
     * Décodage tolérant au seul remplissage manquant ; tout autre défaut lève
     * [IllegalArgumentException].
     */
    fun decode(value: String): ByteArray {
        val clean = value.trim()
        val padded = when (clean.length % 4) {
            2 -> "$clean=="
            3 -> "$clean="
            else -> clean
        }
        return if (padded.contains('-') || padded.contains('_')) {
            Base64.UrlSafe.decode(padded)
        } else {
            Base64.Default.decode(padded)
        }
    }
}
