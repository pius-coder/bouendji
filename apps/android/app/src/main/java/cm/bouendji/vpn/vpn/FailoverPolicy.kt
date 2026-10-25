package cm.bouendji.vpn.vpn

/**
 * Décision de bascule à partir des mesures à travers le tunnel (D60, D70).
 *
 * La bascule courante reste celle de sing-box (`urltest`) ; cette politique
 * n'intervient que quand la sortie **effectivement active** échoue deux fois
 * de suite (D70) : elle force alors le selector vers la meilleure sortie qui
 * répond. Sans aucune sortie qui répond, elle le dit (bandeau D61), et la
 * mesure suivante attend plus longtemps : 30 s → 2 min → 10 min.
 *
 * Classe pure : aucune horloge, aucun moteur. Testée par `FailoverPolicyTest`.
 */
class FailoverPolicy(
    private val tags: List<String>,
    private val threshold: Int = 2,
) {

    companion object {
        const val NORMAL_INTERVAL_MS = 60_000L
        val DEGRADED_INTERVALS_MS = longArrayOf(30_000, 120_000, 600_000)
    }

    sealed interface Decision {
        data object Keep : Decision
        data class Switch(val toTag: String) : Decision
        data object AllDown : Decision
    }

    private val consecutiveFailures = HashMap<String, Int>()
    private var degradedRounds = 0

    fun failures(tag: String): Int = consecutiveFailures[tag] ?: 0

    /**
     * @param active sortie réellement utilisée (résolue à travers `proxy` puis
     *   `auto`), ou `null` si le moteur ne l'a pas dite.
     * @param latencies latence mesurée par sortie, `null` = échec.
     */
    fun onRound(active: String?, latencies: Map<String, Int?>): Decision {
        for ((tag, latency) in latencies) {
            consecutiveFailures[tag] = if (latency == null) failures(tag) + 1 else 0
        }
        val healthy = latencies.filterValues { it != null }
        if (healthy.isEmpty() && latencies.isNotEmpty()) {
            degradedRounds++
            return Decision.AllDown
        }
        degradedRounds = 0
        if (active == null || active !in tags) return Decision.Keep
        if (failures(active) < threshold) return Decision.Keep
        val best = healthy.minByOrNull { it.value!! }?.key ?: return Decision.AllDown
        return if (best == active) Decision.Keep else Decision.Switch(best)
    }

    /** Délai avant la prochaine mesure. */
    fun nextIntervalMs(): Long =
        if (degradedRounds == 0) NORMAL_INTERVAL_MS
        else DEGRADED_INTERVALS_MS[(degradedRounds - 1).coerceAtMost(DEGRADED_INTERVALS_MS.size - 1)]
}
