package cm.bouendji.vpn.vpn

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update

/**
 * Ce que l'écran Serveurs et l'accueil savent des sorties : libellé, région,
 * latence **mesurée**, et laquelle porte le trafic.
 *
 * Jamais d'hôte, d'UUID ni de chemin ici : ce bus est lu par l'interface.
 */
enum class ProbeState { UNKNOWN, TESTING, OK, FAILED }

/** Comment la latence a été obtenue : à travers le tunnel (HTTP) ou en direct (TCP). */
enum class ProbeMethod { TUNNEL, DIRECT }

data class ServerStatus(
    val configId: String,
    val tag: String,
    val label: String,
    val region: String,
    val latencyMs: Int? = null,
    val probe: ProbeState = ProbeState.UNKNOWN,
    val method: ProbeMethod? = null,
)

/** Débit cumulé du tunnel, lu dans l'API de contrôle de sing-box. */
data class TrafficTotals(val uploadBytes: Long, val downloadBytes: Long)

object ServerBus {

    /** Valeur stockée pour « laisser l'application choisir ». */
    const val AUTO = "auto"

    private val _servers = MutableStateFlow<List<ServerStatus>>(emptyList())
    val servers: StateFlow<List<ServerStatus>> = _servers.asStateFlow()

    /** `configId` de la sortie qui porte le trafic, `null` si inconnue ou tunnel coupé. */
    private val _active = MutableStateFlow<String?>(null)
    val active: StateFlow<String?> = _active.asStateFlow()

    /** Bandeau non bloquant (D18) : bascule automatique, plus aucun serveur, etc. */
    private val _notice = MutableStateFlow<String?>(null)
    val notice: StateFlow<String?> = _notice.asStateFlow()

    private val _traffic = MutableStateFlow<TrafficTotals?>(null)
    val traffic: StateFlow<TrafficTotals?> = _traffic.asStateFlow()

    /** Remplace la liste en gardant les mesures déjà faites pour les mêmes configurations. */
    fun setServers(list: List<ServerStatus>) {
        val previous = _servers.value.associateBy { it.configId }
        _servers.value = list.map { fresh ->
            previous[fresh.configId]?.let { old ->
                fresh.copy(latencyMs = old.latencyMs, probe = old.probe, method = old.method)
            } ?: fresh
        }
    }

    fun update(configId: String, transform: (ServerStatus) -> ServerStatus) {
        _servers.update { list -> list.map { if (it.configId == configId) transform(it) else it } }
    }

    fun setActive(configId: String?) {
        _active.value = configId
    }

    fun setNotice(message: String?) {
        _notice.value = message
    }

    fun setTraffic(totals: TrafficTotals?) {
        _traffic.value = totals
    }
}
