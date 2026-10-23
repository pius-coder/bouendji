package cm.bouendji.vpn

import android.app.Application
import cm.bouendji.vpn.brand.BrandTokens
import cm.bouendji.vpn.crypto.DeviceKeys
import cm.bouendji.vpn.crypto.SecureStore
import cm.bouendji.vpn.net.ApiClient
import cm.bouendji.vpn.net.DeviceAuth
import cm.bouendji.vpn.offline.ConfigVault
import cm.bouendji.vpn.offline.OfflineBundle
import cm.bouendji.vpn.vpn.LibboxTunnelEngine
import cm.bouendji.vpn.vpn.TunnelEngine

/**
 * Point d'entrée du processus.
 *
 * Le conteneur est un simple objet construit une fois : le service VPN, l'UI et
 * les écrans de réglages partagent les mêmes instances, donc le même Keystore,
 * le même stockage chiffré et le même client. Aucune dépendance injectée au
 * runtime, aucun singleton statique mutable hors [TunnelStateBus].
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
 * Graphe d'objets du socle.
 *
 * Le client HTTP est **paresseux** : un build de marque dont `BrandTokens` n'a
 * pas été remplacé doit pouvoir s'ouvrir (et dire pourquoi il ne peut pas
 * joindre le serveur) au lieu de planter au démarrage. L'erreur est levée au
 * premier appel réseau, avec un message qui nomme le champ fautif.
 */
class AppContainer(application: Application) {

    val secureStore: SecureStore = SecureStore(application)

    val deviceKeys: DeviceKeys = DeviceKeys()

    val deviceAuth: DeviceAuth = DeviceAuth(deviceKeys, secureStore)

    val vault: ConfigVault = ConfigVault(secureStore)

    val offlineBundle: OfflineBundle = OfflineBundle(
        keys = deviceKeys,
        store = secureStore,
        vault = vault,
        deviceIdProvider = { deviceAuth.deviceId() },
    )

    val api: ApiClient by lazy {
        BrandTokens.requireValid()
        ApiClient(
            baseUrl = BrandTokens.apiBaseUrl,
            appId = BrandTokens.appId,
            auth = deviceAuth,
            keys = deviceKeys,
            store = secureStore,
        )
    }

    /**
     * Le moteur réel : `libbox` (sing-box 1.14.3), compilé depuis les sources
     * et embarqué en `.aar`. `isAvailable()` interroge la frontière JNI : si la
     * bibliothèque native ne se charge pas, l'application le dit au lieu de
     * prétendre protéger l'appareil.
     */
    val tunnelEngine: TunnelEngine = LibboxTunnelEngine(application)

    /**
     * Vrai quand l'appareil peut réellement participer : Android 12+ (clé
     * d'accord), moteur disponible, et marque injectée.
     */
    fun isOperational(): Boolean =
        DeviceKeys.supportsAgreement() && tunnelEngine.isAvailable() && BrandTokens.isValid()
}
