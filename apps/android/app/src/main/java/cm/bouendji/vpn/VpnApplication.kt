package cm.bouendji.vpn

import android.app.Application
import cm.bouendji.vpn.access.AccessState
import cm.bouendji.vpn.brand.BrandTokens
import cm.bouendji.vpn.crypto.DeviceKeys
import cm.bouendji.vpn.crypto.SecureStore
import cm.bouendji.vpn.net.ApiClient
import cm.bouendji.vpn.net.DeviceAuth
import cm.bouendji.vpn.net.TrustRoots
import cm.bouendji.vpn.offline.ConfigVault
import cm.bouendji.vpn.offline.OfflineBundle
import cm.bouendji.vpn.sync.BundleSync
import cm.bouendji.vpn.telemetry.TelemetryQueue
import cm.bouendji.vpn.vpn.LibboxTunnelEngine
import cm.bouendji.vpn.vpn.TunnelEngine
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.json.Json

/**
 * Point d'entrée du processus. Le conteneur est construit une fois : le service
 * VPN et l'interface partagent le même Keystore, le même coffre, le même client.
 */
class VpnApplication : Application() {

    lateinit var container: AppContainer
        private set

    override fun onCreate() {
        super.onCreate()
        container = AppContainer(this)
    }
}

/**
 * Graphe d'objets.
 *
 * Le client HTTP est **paresseux** : un build dont `BrandTokens` n'a pas été
 * remplacé doit s'ouvrir et dire pourquoi il ne joint pas le serveur, au lieu
 * de planter au démarrage.
 */
class AppContainer(private val application: Application) {

    val secureStore: SecureStore = SecureStore(application)

    val deviceKeys: DeviceKeys = DeviceKeys(secureStore)

    val deviceAuth: DeviceAuth = DeviceAuth(deviceKeys, secureStore)

    val vault: ConfigVault = ConfigVault(secureStore)

    val access: AccessState = AccessState(secureStore)

    val telemetry: TelemetryQueue = TelemetryQueue(secureStore)

    val offlineBundle: OfflineBundle = OfflineBundle(
        agree = deviceKeys::agreementSecret,
        store = secureStore,
        vault = vault,
        deviceIdProvider = { deviceAuth.deviceId() },
    )

    val api: ApiClient by lazy {
        BrandTokens.requireValid()
        val roots = listOf(R.raw.isrg_root_x1, R.raw.isrg_root_x2).map { application.resources.openRawResource(it) }
        ApiClient(
            baseUrl = BrandTokens.apiBaseUrl,
            appId = BrandTokens.appId,
            auth = deviceAuth,
            keys = deviceKeys,
            store = secureStore,
            http = TrustRoots.clientWith(roots, ApiClient.defaultHttpClientBuilder()),
        )
    }

    /** Un seul chemin de tirage du bundle (D61, D67), partagé par l'UI et le service. */
    val bundleSync: BundleSync by lazy { BundleSync({ api.fetchBundle() }, vault, access) }

    /** `libbox` (sing-box 1.14.3) compilé depuis les sources ; `isAvailable()` traverse JNI. */
    val tunnelEngine: TunnelEngine = LibboxTunnelEngine(application)

    private val reportLock = Mutex()
    private val json = Json { encodeDefaults = false; explicitNulls = false }

    /**
     * Vide ce qui attend le réseau : télémétrie (D64) et consommation des
     * fichiers hors-ligne. Sans session, rien ne part (la route exige bearer +
     * preuve d'appareil). Jamais d'exception : c'est de l'observation.
     */
    suspend fun flushPending() = reportLock.withLock {
        if (!BrandTokens.isValid()) return@withLock
        val client = runCatching { api }.getOrNull() ?: return@withLock
        if (deviceAuth.deviceToken() == null) return@withLock

        for (bundleId in offlineBundle.pendingReports()) {
            val done = runCatching { client.offlineConsumed(bundleId) }.getOrDefault(false)
            if (done) offlineBundle.reported(bundleId) else break
        }

        if (!client.hasSession()) return@withLock
        runCatching {
            telemetry.flush { batch ->
                telemetry.classify(client.telemetry(json.encodeToString(TelemetryQueue.Batch.serializer(), batch)))
            }
        }
    }

    /** Oublie tout ce qui lie l'appareil au compte, sans toucher à son identité. */
    fun forgetAccount() {
        vault.clear()
        access.clear()
        telemetry.clear()
    }

    /**
     * Réinitialise l'identité de l'appareil (appareil révoqué, D23) : nouvelles
     * clés, nouvel identifiant d'installation. L'appareil devra être réenrôlé
     * et reprendra une place de son forfait.
     */
    fun resetDevice() {
        forgetAccount()
        runCatching { api.clearSession() }
        deviceAuth.forgetDevice()
        deviceAuth.resetInstallation()
        deviceKeys.deleteAll()
    }
}
