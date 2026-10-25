package cm.bouendji.vpn.vpn

import android.os.ParcelFileDescriptor
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * États visibles (nœuds `android-app` et `failover-client`) — exactement sept,
 * pas un de plus. Chaque état doit dire la vérité : « protégé » n'existe pas
 * tant que le tunnel ne porte pas de trafic.
 *
 * Il n'y a volontairement pas d'état `ERROR` : une panne se traduit par
 * [NO_CONNECTION] avec un message, ou par [STOPPED]. Un huitième état
 * « erreur » finirait affiché à la place de la vérité.
 */
enum class TunnelState {
    STOPPED,
    CONNECTING,
    CONNECTED,
    RECONNECTING,
    NO_CONNECTION,
    SUBSCRIPTION_EXPIRED,
    DEVICE_REVOKED,
}

/**
 * Ce que le service passe au moteur. Aucun champ n'est persistable : [configJson]
 * est le seul endroit où les URI VLESS existent en clair, et il ne quitte pas
 * la mémoire du processus.
 */
data class TunnelRequest(
    /** Configuration sing-box complète, construite par [cm.bouendji.vpn.config.SingBoxConfig]. */
    val configJson: String,
    /** Descripteur TUN fourni par `VpnService.establish()`. Le moteur ne le ferme pas. */
    val tun: ParcelFileDescriptor,
    /**
     * `VpnService.protect(fd)` : sans cela, les sockets du moteur repartent dans
     * le tunnel qu'elles viennent de créer, et rien ne sort.
     */
    val protect: (Int) -> Boolean,
    /** Appelé par le moteur quand il abandonne définitivement (nœud mort, plantage). */
    val onFatal: (reason: String) -> Unit,
    /** Port de l'API Clash de contrôle, s'il a été exposé. */
    val clashApiPort: Int? = null,
    /** Secret de l'API Clash — jamais journalisé. */
    val clashApiSecret: String? = null,
)

/**
 * Le moteur de tunnel, sans engagement sur son API.
 *
 * **Aucune dépendance `libbox` n'est déclarée dans ce module**, et aucune
 * signature de `libbox` n'est supposée ici. La raison est simple : aucune
 * version de `libbox` n'a été installée ni vérifiée sur cette machine, et
 * écrire des appels « plausibles » à une API Go/Kotlin non vérifiée produirait
 * du code qui ne compile pas, ou pire, qui compile et se trompe.
 *
 * Ce que l'adaptateur devra fournir, et qui est déjà décidé ici :
 *
 * 1. **Démarrer avec un fd déjà établi** par `VpnService`, pas créer son propre
 *    TUN : le service possède le descripteur et le ferme.
 * 2. **Protéger ses propres sockets** via [TunnelRequest.protect].
 * 3. **Changer de sortie sans redémarrer** : [selectOutbound] déplace le
 *    selector (« proxy ») de la configuration, ce qui est la seule bascule
 *    gratuite (nœud `singbox-engine`).
 * 4. **Mesurer une sortie sans couper le trafic** : [measureDelayMs] interroge
 *    l'API Clash en boucle locale (`/proxies/{tag}/delay`). Un test TCP ne
 *    prouve rien : il faut un vrai handshake VLESS puis une requête HTTP.
 *
 * Tant qu'aucun adaptateur n'est branché, [UnavailableTunnelEngine] est utilisé
 * et l'application affiche « aucune connexion disponible » plutôt que de
 * prétendre protéger l'appareil.
 */
interface TunnelEngine {

    /** Nom affiché dans les diagnostics (`unavailable`, `libbox-…`). */
    val name: String

    /** `false` : inutile de demander le consentement VPN, rien ne démarrerait. */
    fun isAvailable(): Boolean

    suspend fun start(request: TunnelRequest): Result<Unit>

    suspend fun stop()

    /** Déplace le selector vers [tag]. Ne recharge pas la configuration. */
    suspend fun selectOutbound(tag: String): Result<Unit>

    /** Latence mesurée à travers [tag], en millisecondes, ou échec motivé. */
    suspend fun measureDelayMs(tag: String, probeUrl: String = DEFAULT_PROBE_URL, timeoutMs: Int = 5_000): Result<Int>

    /**
     * Sortie réellement utilisée : `now` du selector, puis `now` du `urltest`
     * s'il est sélectionné (`clashapi/proxies.go:80`).
     */
    suspend fun activeOutbound(): Result<String> = Result.failure(UnsupportedOperationException("non pris en charge"))

    /** Octets montants et descendants depuis le démarrage du moteur (`clashapi/connections.go`, `uploadTotal`/`downloadTotal`). */
    suspend fun trafficTotals(): Result<Pair<Long, Long>> = Result.failure(UnsupportedOperationException("non pris en charge"))

    companion object {
        /** Point de contrôle : 204, sans contenu, joignable partout. */
        const val DEFAULT_PROBE_URL = "https://www.gstatic.com/generate_204"
    }
}

/**
 * Moteur absent. C'est le moteur **par défaut** de ce lot.
 *
 * Il échoue proprement et le dit : c'est la seule implémentation honnête tant
 * que `libbox` n'est pas intégré et testé.
 */
class UnavailableTunnelEngine(
    private val reason: String = "Moteur sing-box non intégré dans cette version.",
) : TunnelEngine {

    override val name: String = "unavailable"

    override fun isAvailable(): Boolean = false

    override suspend fun start(request: TunnelRequest): Result<Unit> =
        Result.failure(IllegalStateException(reason))

    override suspend fun stop() = Unit

    override suspend fun selectOutbound(tag: String): Result<Unit> =
        Result.failure(IllegalStateException(reason))

    override suspend fun measureDelayMs(tag: String, probeUrl: String, timeoutMs: Int): Result<Int> =
        Result.failure(IllegalStateException(reason))
}

/**
 * Bus d'état, observé par l'UI et par la notification.
 *
 * Volontairement un singleton : le service vit dans le même processus que l'UI,
 * et un `bindService` pour lire un état serait plus de code pour moins de
 * garanties. La vague UI peut le remplacer par une `ViewModel` sans toucher au
 * service.
 */
object TunnelStateBus {

    private val _state = MutableStateFlow(TunnelState.STOPPED)
    val state: StateFlow<TunnelState> = _state.asStateFlow()

    private val _detail = MutableStateFlow<String?>(null)

    /** Message court et vrai, affiché sous l'état (« moteur indisponible », etc.). */
    val detail: StateFlow<String?> = _detail.asStateFlow()

    fun publish(state: TunnelState, detail: String? = null) {
        _detail.value = detail
        _state.value = state
        if (state != TunnelState.CONNECTED && state != TunnelState.RECONNECTING) _link.value = LinkInfo()
    }

    /** Mesures du tunnel actif — la seule source des chiffres affichés à l'accueil. */
    data class LinkInfo(
        /** Dernière latence mesurée à travers la sortie active, `null` = pas encore mesurée. */
        val latencyMs: Int? = null,
        /** Libellé de la sortie active (le `label` du bundle, jamais l'URI). */
        val exitLabel: String? = null,
        /** D61 : aucune sortie ne répond — bandeau non bloquant, le tunnel reste ouvert. */
        val degraded: Boolean = false,
        /** Début de la session courante (epoch ms), 0 si aucune. */
        val connectedSinceMs: Long = 0,
    )

    private val _link = MutableStateFlow(LinkInfo())
    val link: StateFlow<LinkInfo> = _link.asStateFlow()

    fun publishLink(info: LinkInfo) {
        _link.value = info
    }
}
