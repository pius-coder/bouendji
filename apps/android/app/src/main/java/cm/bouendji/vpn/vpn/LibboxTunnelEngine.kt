package cm.bouendji.vpn.vpn

import android.content.Context
import android.util.Log
import cm.bouendji.vpn.brand.BrandTokens
import cm.bouendji.vpn.config.SingBoxConfig
import io.nekohasekai.libbox.CommandServer
import io.nekohasekai.libbox.CommandServerHandler
import io.nekohasekai.libbox.Libbox
import io.nekohasekai.libbox.OverrideOptions
import io.nekohasekai.libbox.SetupOptions
import io.nekohasekai.libbox.SystemProxyStatus
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder

/**
 * Le moteur **réel** : `libbox` (sing-box 1.14.3), compilé depuis les sources
 * par `tools/build-libbox.ps1` puis embarqué en `.aar`.
 *
 * ## Ce qui a été vérifié avant d'écrire ce fichier
 *
 * Toutes les signatures viennent de `javap` sur le `classes.jar` du `.aar`
 * produit, et le séquencement vient du client officiel
 * (`sing-box-for-android`, `bg/BoxService.kt`) :
 *
 * ```kotlin
 * Libbox.setup(SetupOptions())
 * val server = Libbox.newCommandServer(handler, platform)
 * server.start()
 * server.startOrReloadService(configJson, OverrideOptions())
 * server.closeService(); server.close()
 * ```
 *
 * ## Bascule et mesure : par l'API Clash, pas par un redémarrage
 *
 * La configuration construite par [SingBoxConfig] expose déjà un
 * `experimental.clash_api` en boucle locale avec un secret tiré au build. On
 * s'en sert pour :
 *
 * - **changer de sortie** sans couper le trafic (`PUT /proxies/proxy`) ;
 * - **mesurer** une sortie à travers le vrai tunnel
 *   (`GET /proxies/{tag}/delay`), ce qu'un simple test TCP ne prouve pas.
 *
 * Aucune de ces deux opérations ne recharge la configuration : c'est la seule
 * bascule gratuite.
 */
class LibboxTunnelEngine(private val context: Context) : TunnelEngine {

    override val name: String = "libbox-1.14.3"

    private var server: CommandServer? = null
    private var setupDone = false
    private var clashPort: Int = 0
    private var clashSecret: String = ""

    /**
     * Vérifie que la bibliothèque native se charge réellement dans le
     * processus. `Libbox.version()` traverse la frontière JNI : si elle répond,
     * `arm64-v8a/libbox.so` est présent et utilisable.
     */
    override fun isAvailable(): Boolean =
        runCatching { Libbox.version().isNotBlank() }.getOrDefault(false)

    override suspend fun start(request: TunnelRequest): Result<Unit> = withContext(Dispatchers.IO) {
        runCatching {
            ensureSetup()

            // Un démarrage qui remplace un précédent ne doit pas laisser deux
            // moteurs sur le même TUN.
            stopInternal()

            val platform = TunnelPlatform(request.protect, request.tun.fd)
            val created = Libbox.newCommandServer(handler(request), platform)
            created.start()
            created.startOrReloadService(request.configJson, OverrideOptions())

            server = created
            clashPort = request.clashApiPort ?: 0
            clashSecret = request.clashApiSecret.orEmpty()
        }
    }

    override suspend fun stop() = withContext(Dispatchers.IO) { stopInternal() }

    override suspend fun selectOutbound(tag: String): Result<Unit> = withContext(Dispatchers.IO) {
        runCatching {
            require(clashPort != 0) { "API de contrôle indisponible : bascule impossible." }
            clash(
                method = "PUT",
                path = "/proxies/${SingBoxConfig.SELECTOR_TAG}",
                body = """{"name":${JSONObject.quote(tag)}}""",
            )
            Unit
        }
    }

    override suspend fun measureDelayMs(
        tag: String,
        probeUrl: String,
        timeoutMs: Int,
    ): Result<Int> = withContext(Dispatchers.IO) {
        runCatching {
            require(clashPort != 0) { "API de contrôle indisponible : mesure impossible." }
            val encodedUrl = URLEncoder.encode(probeUrl, "UTF-8")
            val body = clash(
                method = "GET",
                path = "/proxies/$tag/delay?timeout=$timeoutMs&url=$encodedUrl",
            )
            val delay = JSONObject(body).optInt("delay", -1)
            require(delay >= 0) { "Mesure illisible : $body" }
            delay
        }
    }

    /* ------------------------------------------------------------- interne */

    private fun stopInternal() {
        val current = server ?: return
        server = null
        runCatching { current.closeService() }
            .onFailure { Log.w(TAG, "closeService : ${it.message}") }
        runCatching { current.close() }
            .onFailure { Log.w(TAG, "close : ${it.message}") }
    }

    /**
     * `Libbox.setup` est global au processus et ne doit être appelé qu'une fois.
     * Les chemins sont ceux de l'application : rien n'est écrit hors de son
     * bac à sable.
     */
    private fun ensureSetup() {
        if (setupDone) return
        val working = File(context.filesDir, "sing-box").apply { mkdirs() }
        Libbox.setup(
            SetupOptions().apply {
                basePath = context.filesDir.absolutePath
                workingPath = working.absolutePath
                tempPath = context.cacheDir.absolutePath
                fixAndroidStack = true
                logMaxLines = 300
                debug = false
                appVersion = BrandTokens.appVersion
            },
        )
        setupDone = true
    }

    private fun handler(request: TunnelRequest): CommandServerHandler =
        object : CommandServerHandler {

            override fun connectSSHAgent(): Int = -1

            override fun getSystemProxyStatus(): SystemProxyStatus? = null

            override fun serviceReload() {
                Log.i(TAG, "rechargement demandé par le moteur")
            }

            override fun serviceStop() {
                request.onFatal("Le moteur a arrêté le service.")
            }

            override fun setSystemProxyEnabled(enabled: Boolean) {
                throw UnsupportedOperationException("Proxy système non géré par cette application.")
            }

            override fun triggerNativeCrash() {
                throw IllegalStateException("Plantage natif demandé par le moteur.")
            }

            override fun writeDebugMessage(message: String?) {
                Log.d(TAG, message.orEmpty())
            }
        }

    /**
     * Appel local à l'API Clash. Le secret est indispensable : sans lui, toute
     * application du téléphone pourrait changer la sortie du tunnel.
     */
    private fun clash(method: String, path: String, body: String? = null): String {
        val connection = URL("http://127.0.0.1:$clashPort$path").openConnection() as HttpURLConnection
        return try {
            connection.requestMethod = method
            connection.connectTimeout = 3_000
            connection.readTimeout = 8_000
            if (clashSecret.isNotEmpty()) {
                connection.setRequestProperty("Authorization", "Bearer $clashSecret")
            }
            if (body != null) {
                connection.doOutput = true
                connection.setRequestProperty("Content-Type", "application/json")
                connection.outputStream.use { it.write(body.toByteArray()) }
            }
            val code = connection.responseCode
            val stream = if (code in 200..299) connection.inputStream else connection.errorStream
            val text = stream?.bufferedReader()?.use { it.readText() }.orEmpty()
            if (code !in 200..299) {
                error("API de contrôle : HTTP $code ${text.take(180)}")
            }
            text
        } finally {
            connection.disconnect()
        }
    }

    private companion object {
        const val TAG = "LibboxEngine"
    }
}
