package cm.bouendji.vpn.vpn

import android.content.Context
import android.net.ConnectivityManager
import android.net.LinkProperties
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import io.nekohasekai.libbox.BridgeOptions
import io.nekohasekai.libbox.BridgeSession
import io.nekohasekai.libbox.ConnectionOwner
import io.nekohasekai.libbox.InterfaceUpdateListener
import io.nekohasekai.libbox.Libbox
import io.nekohasekai.libbox.LocalDNSTransport
import io.nekohasekai.libbox.NeighborUpdateListener
import io.nekohasekai.libbox.NetworkInterface
import io.nekohasekai.libbox.NetworkInterfaceIterator
import io.nekohasekai.libbox.Notification
import io.nekohasekai.libbox.PlatformInterface
import io.nekohasekai.libbox.PlatformUser
import io.nekohasekai.libbox.ShellSession
import io.nekohasekai.libbox.StringIterator
import io.nekohasekai.libbox.TunOptions
import io.nekohasekai.libbox.WIFIState
import java.net.NetworkInterface as JavaInterface

/**
 * Implémentations des types d'itérateur de `libbox`.
 *
 * `libbox` est généré par `gomobile` : les itérateurs sont des interfaces Java
 * que l'appelant doit fournir. Côté Go, ils sont drainés par
 * `iteratorToArray` (hasNext/next), et `len()` sert seulement à préallouer.
 */
internal class StringList(private val items: List<String>) : StringIterator {

    private var position = 0

    override fun len(): Int = items.size

    override fun hasNext(): Boolean = position < items.size

    override fun next(): String = items[position++]
}

internal class InterfaceList(
    private val items: List<NetworkInterface>,
) : NetworkInterfaceIterator {

    private var position = 0

    override fun hasNext(): Boolean = position < items.size

    override fun next(): NetworkInterface = items[position++]
}

/**
 * Valeurs par défaut des 27 méthodes de [PlatformInterface].
 *
 * Toutes les signatures ci-dessous sont relevées avec `javap` sur le
 * `classes.jar` du `libbox.aar` effectivement embarqué — pas recopiées d'une
 * documentation. Les méthodes qui n'ont pas de sens pour cette application
 * (shell, Tailscale, USBIP, bridge) échouent explicitement : si un jour le
 * moteur les appelle, on veut une exception nommée, pas un silence.
 */
internal interface PlatformDefaults : PlatformInterface {

    override fun autoDetectInterfaceControl(fd: Int) = Unit

    override fun cancelNotification(identifier: String?, typeID: Int) = Unit

    override fun checkPlatformShell() {
        throw UnsupportedOperationException("Shell de plateforme non pris en charge.")
    }

    override fun clearDNSCache() = Unit

    override fun closeDefaultInterfaceMonitor(listener: InterfaceUpdateListener?) = Unit

    override fun closeNeighborMonitor(listener: NeighborUpdateListener?) = Unit

    override fun createBridge(options: BridgeOptions?): BridgeSession {
        throw UnsupportedOperationException("Bridge non pris en charge.")
    }

    override fun findConnectionOwner(
        ipProtocol: Int,
        sourceAddress: String?,
        sourcePort: Int,
        destinationAddress: String?,
        destinationPort: Int,
    ): ConnectionOwner {
        throw UnsupportedOperationException("Recherche du propriétaire de connexion non armée.")
    }

    override fun getInterfaces(): NetworkInterfaceIterator {
        throw UnsupportedOperationException("Énumération des interfaces non fournie.")
    }

    override fun includeAllNetworks(): Boolean = false

    override fun localDNSTransport(): LocalDNSTransport? = null

    override fun lookupSFTPServer(): String {
        throw UnsupportedOperationException("SFTP non pris en charge.")
    }

    override fun lookupUser(username: String?): PlatformUser {
        throw UnsupportedOperationException("Utilisateurs de plateforme non pris en charge.")
    }

    override fun openShellSession(
        user: PlatformUser?,
        command: String?,
        environ: StringIterator?,
        term: String?,
        rows: Int,
        cols: Int,
    ): ShellSession {
        throw UnsupportedOperationException("Session shell non prise en charge.")
    }

    override fun openTun(options: TunOptions): Int {
        throw UnsupportedOperationException("Aucun TUN fourni.")
    }

    override fun readSystemSSHHostKey(): String {
        throw UnsupportedOperationException("Clé d'hôte SSH non gérée.")
    }

    override fun readWIFIState(): WIFIState? = null

    override fun registerMyInterface(name: String?) = Unit

    override fun sendNotification(notification: Notification?) = Unit

    override fun startDefaultInterfaceMonitor(listener: InterfaceUpdateListener?) = Unit

    override fun startNeighborMonitor(listener: NeighborUpdateListener?) = Unit

    override fun tailscaleHostname(): String = ""

    override fun underNetworkExtension(): Boolean = false

    /**
     * `true` : c'est l'application qui protège les sockets du moteur via
     * `VpnService.protect()`. Sans cela, le moteur sortirait par le tunnel
     * qu'il vient de créer, et rien ne passerait.
     */
    override fun usePlatformAutoDetectInterfaceControl(): Boolean = true

    override fun usePlatformBridge(): Boolean = false

    override fun usePlatformShell(): Boolean = false

    /**
     * Pas de `procfs` : il ne sert qu'à retrouver le propriétaire d'une
     * connexion, et cette application n'utilise pas de règle `process_name`.
     */
    override fun useProcFS(): Boolean = false
}

/**
 * Le pont entre `libbox` et **notre** `VpnService`.
 *
 * Deux choix, tous les deux volontaires :
 *
 * 1. [openTun] rend le descripteur **déjà établi** par
 *    `VpnTunnelService.establishTun()` au lieu d'en créer un second. Le
 *    service reste propriétaire de l'interface, des routes, du MTU et du DNS :
 *    une seule source de vérité.
 * 2. [autoDetectInterfaceControl] délègue à `VpnService.protect(fd)`. Si
 *    `protect` refuse un descripteur, on lève : un tunnel qui ne sort pas est
 *    pire qu'un tunnel qui refuse de démarrer.
 */
internal class TunnelPlatform(
    private val context: Context,
    private val protect: (Int) -> Boolean,
    private val tunFd: Int,
) : PlatformDefaults {

    private var networkCallback: ConnectivityManager.NetworkCallback? = null
    private var defaultNetwork: Network? = null

    override fun openTun(options: TunOptions): Int = tunFd

    /**
     * Interface physique par défaut (LTE, Wi-Fi), hors VPN.
     *
     * Avec `auto_detect_interface`, sing-box sort par l'interface que la
     * plateforme lui signale ici. Sans ce signal, le tunnel est monté mais
     * aucune connexion sortante n'aboutit : c'était le cas avec un moniteur vide.
     * Même principe que `DefaultNetworkMonitor` de sing-box-for-android.
     */
    override fun startDefaultInterfaceMonitor(listener: InterfaceUpdateListener?) {
        if (listener == null) return
        val manager = context.getSystemService(ConnectivityManager::class.java) ?: return

        fun publish(network: Network?) {
            defaultNetwork = network
            val name = network?.let { manager.getLinkProperties(it) }?.interfaceName
            if (name.isNullOrEmpty()) {
                listener.updateDefaultInterface("", -1, false, false)
                return
            }
            val index = runCatching { JavaInterface.getByName(name)?.index }.getOrNull() ?: -1
            val capabilities = manager.getNetworkCapabilities(network)
            val expensive = capabilities?.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_METERED) == false
            listener.updateDefaultInterface(name, index, expensive, false)
        }

        val callback = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) = publish(network)
            override fun onLinkPropertiesChanged(network: Network, linkProperties: LinkProperties) = publish(network)
            override fun onLost(network: Network) {
                // Un réseau qui n'est pas celui par défaut (Wi-Fi perdu alors
                // que la 4G porte déjà le trafic) ne doit pas effacer
                // l'interface : sinon sing-box repasse en « aucune connexion »
                // et attend jusqu'à 10 minutes avant de réessayer.
                if (network == defaultNetwork) publish(null)
            }
        }
        val request = NetworkRequest.Builder()
            .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
            .addCapability(NetworkCapabilities.NET_CAPABILITY_NOT_VPN)
            .build()
        // Le rappel initial peut arriver après le démarrage : on publie l'état courant
        // tout de suite. L'appel le plus récent gagne côté sing-box.
        manager.allNetworks.firstOrNull { network ->
            manager.getNetworkCapabilities(network)?.let {
                it.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) &&
                    it.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_VPN)
            } == true
        }?.let(::publish)
        manager.registerNetworkCallback(request, callback)
        networkCallback = callback
    }

    override fun closeDefaultInterfaceMonitor(listener: InterfaceUpdateListener?) {
        val callback = networkCallback ?: return
        networkCallback = null
        runCatching { context.getSystemService(ConnectivityManager::class.java)?.unregisterNetworkCallback(callback) }
    }

    override fun autoDetectInterfaceControl(fd: Int) {
        if (!protect(fd)) {
            throw IllegalStateException("protect($fd) a été refusé par le système.")
        }
    }

    /**
     * Énumération réelle des interfaces, lue depuis `java.net`.
     *
     * `libbox` consomme ces entrées avec `netip.MustParsePrefix` : une chaîne
     * mal formée ne provoque pas une erreur, elle provoque un **panic** Go.
     * D'où le formatage explicite en `adresse/préfixe`, sans identifiant de
     * zone (`%wlan0`), et le rejet de la boucle locale et du lien local.
     */
    override fun getInterfaces(): NetworkInterfaceIterator {
        val entries = mutableListOf<NetworkInterface>()

        val all = runCatching {
            JavaInterface.getNetworkInterfaces()?.toList().orEmpty()
        }.getOrDefault(emptyList())

        for (network in all) {
            if (!runCatching { network.isUp }.getOrDefault(false)) continue

            val interfaceName = runCatching { network.name }.getOrNull() ?: continue
            if (interfaceName.startsWith("lo") || interfaceName.startsWith("tun")) continue

            val prefixes = runCatching { network.interfaceAddresses }.getOrDefault(emptyList())
                .mapNotNull { item ->
                    val address = item.address ?: return@mapNotNull null
                    if (address.isLoopbackAddress || address.isLinkLocalAddress) return@mapNotNull null
                    val host = address.hostAddress?.substringBefore('%') ?: return@mapNotNull null
                    "$host/${item.networkPrefixLength}"
                }
            if (prefixes.isEmpty()) continue

            var flags = IFF_UP or IFF_RUNNING
            if (runCatching { network.supportsMulticast() }.getOrDefault(false)) {
                flags = flags or IFF_MULTICAST
            }

            entries += NetworkInterface().apply {
                index = runCatching { network.index }.getOrDefault(0)
                this.name = interfaceName
                mtu = runCatching { network.mtu }.getOrDefault(1500)
                addresses = StringList(prefixes)
                dnsServer = StringList(emptyList())
                gateway = StringList(emptyList())
                this.flags = flags
                type = interfaceType(interfaceName)
                metered = false
            }
        }

        return InterfaceList(entries)
    }

    private fun interfaceType(name: String): Int = when {
        name.startsWith("wlan") -> Libbox.InterfaceTypeWIFI
        name.startsWith("rmnet") ||
            name.startsWith("ccmni") ||
            name.startsWith("pdp") -> Libbox.InterfaceTypeCellular
        name.startsWith("eth") -> Libbox.InterfaceTypeEthernet
        else -> Libbox.InterfaceTypeOther
    }

    private companion object {
        // Constantes `IFF_*` de Linux, celles que `libbox` traduit ensuite.
        const val IFF_UP = 0x1
        const val IFF_RUNNING = 0x40
        const val IFF_MULTICAST = 0x1000
    }
}
