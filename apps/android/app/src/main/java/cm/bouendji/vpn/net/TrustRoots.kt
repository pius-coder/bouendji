package cm.bouendji.vpn.net

import okhttp3.OkHttpClient
import java.io.InputStream
import java.security.KeyStore
import java.security.cert.CertificateException
import java.security.cert.CertificateFactory
import java.security.cert.X509Certificate
import javax.net.ssl.SSLContext
import javax.net.ssl.TrustManagerFactory
import javax.net.ssl.X509TrustManager

/**
 * Racines de confiance **ajoutées** aux racines du système, jamais à leur place.
 *
 * Android 7.0 et antérieurs ne connaissent pas ISRG Root X1, la racine de
 * Let's Encrypt (le certificat croisé DST Root CA X3 a expiré). Une API servie
 * avec un certificat Let's Encrypt serait donc injoignable depuis les
 * téléphones Android 6 et 7, nombreux dans le parc visé. `network_security_config`
 * n'existe qu'à partir de l'API 24 : on compose donc nous-mêmes un
 * `X509TrustManager` qui essaie le système, puis les racines embarquées.
 *
 * Racines embarquées (`res/raw/*.crt` — pas `.pem`, ignoré par le `.gitignore` racine), empreintes SHA-256 relevées le 2026-10-24 :
 *   ISRG Root X1 `96BCEC06264976F37460779ACF28C5A7CFE8A3C0AAE11A8FFCEE05C0BDDF08C6`
 *   ISRG Root X2 `69729B8E15A86EFC177A57AFB7171DFC64ADD28C2FCA8CF1507E34453CCB1470`
 *
 * Aucune vérification n'est assouplie : le nom d'hôte reste vérifié par
 * OkHttp, et une chaîne doit aboutir à une racine connue.
 */
object TrustRoots {

    fun clientWith(extraRoots: List<InputStream>, base: OkHttpClient.Builder): OkHttpClient {
        val manager = runCatching { composite(extraRoots) }.getOrNull() ?: return base.build()
        val context = SSLContext.getInstance("TLS")
        context.init(null, arrayOf(manager), null)
        return base.sslSocketFactory(context.socketFactory, manager).build()
    }

    fun composite(extraRoots: List<InputStream>): X509TrustManager {
        val system = trustManager(null)
        val factory = CertificateFactory.getInstance("X.509")
        val store = KeyStore.getInstance(KeyStore.getDefaultType()).apply { load(null, null) }
        extraRoots.forEachIndexed { index, stream ->
            stream.use { input ->
                factory.generateCertificates(input).forEachIndexed { sub, cert ->
                    store.setCertificateEntry("extra-$index-$sub", cert)
                }
            }
        }
        val extra = trustManager(store)
        return CompositeTrustManager(system, extra)
    }

    private fun trustManager(store: KeyStore?): X509TrustManager {
        val factory = TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm())
        factory.init(store)
        return factory.trustManagers.filterIsInstance<X509TrustManager>().first()
    }

    private class CompositeTrustManager(
        private val primary: X509TrustManager,
        private val secondary: X509TrustManager,
    ) : X509TrustManager {

        override fun checkClientTrusted(chain: Array<out X509Certificate>, authType: String) =
            primary.checkClientTrusted(chain, authType)

        override fun checkServerTrusted(chain: Array<out X509Certificate>, authType: String) {
            try {
                primary.checkServerTrusted(chain, authType)
            } catch (first: CertificateException) {
                try {
                    secondary.checkServerTrusted(chain, authType)
                } catch (_: CertificateException) {
                    throw first
                }
            }
        }

        override fun getAcceptedIssuers(): Array<X509Certificate> =
            primary.acceptedIssuers + secondary.acceptedIssuers
    }
}
