package cm.bouendji.vpn.telemetry

import cm.bouendji.vpn.util.KeyValueStore
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

/**
 * File locale de télémétrie — producteur de `POST /v1/me/telemetry` (D64, D70).
 *
 * Règles reprises de la décision D64 et du schéma serveur (`routes/telemetry.ts`) :
 *
 * - **lots de 20** rapports au plus (`MAX_REPORTS = 20`, l.34) ;
 * - **réinjection plafonnée à 200** : au-delà, les plus anciens sont jetés ;
 * - **4xx (≠ 408/429) = lot abandonné** : le serveur l'a refusé, le rejouer ne
 *   changerait rien ;
 * - **réseau / 5xx / 408 / 429 = reprise avec backoff** 30 s → 2 min → 10 min ;
 * - `usage` est un **total du jour** (le serveur fait `GREATEST`), donc un lot
 *   rejoué ne double rien.
 *
 * Persistée dans un [KeyValueStore] : un redémarrage du service ne perd pas
 * les rapports d'échec, qui sont précisément ceux dont le verdict a besoin.
 */
class TelemetryQueue(
    private val store: KeyValueStore,
    private val clock: () -> Long = System::currentTimeMillis,
) {

    companion object {
        const val BATCH = 20
        const val CAP = 200
        val BACKOFF_MS = longArrayOf(30_000, 120_000, 600_000)

        private const val KEY = "telemetry.queue.v1"
        private val JSON = Json { ignoreUnknownKeys = true; encodeDefaults = true; explicitNulls = false }
    }

    @Serializable
    data class Report(val configId: String, val ok: Boolean, val latencyMs: Int? = null)

    /** Total du jour, en octets et secondes, compté par le moteur (D52, source `device`). */
    @Serializable
    data class Usage(val day: String, val bytesUp: Long, val bytesDown: Long, val seconds: Long)

    @Serializable
    data class Batch(val usage: Usage? = null, val reports: List<Report>? = null)

    enum class SendResult { ACCEPTED, REJECTED, RETRY }

    @Serializable
    private data class State(
        val reports: List<Report> = emptyList(),
        val usage: List<Usage> = emptyList(),
        /** Jours dont le total envoyé est déjà à jour. */
        val sentUsage: List<Usage> = emptyList(),
        val failures: Int = 0,
        val nextAttemptAtMs: Long = 0,
    )

    private val lock = Any()

    private fun load(): State =
        store.getString(KEY)?.let { runCatching { JSON.decodeFromString(State.serializer(), it) }.getOrNull() } ?: State()

    private fun save(state: State) {
        store.putString(KEY, JSON.encodeToString(State.serializer(), state))
    }

    fun size(): Int = synchronized(lock) { load().reports.size }

    fun nextAttemptAtMs(): Long = synchronized(lock) { load().nextAttemptAtMs }

    fun add(report: Report) = synchronized(lock) {
        val state = load()
        save(state.copy(reports = (state.reports + report).takeLast(CAP)))
    }

    /**
     * Ajoute une consommation au total du jour [day]. Seuls deux jours sont
     * gardés : le serveur refuse au-delà de ±1 jour (`assertDayInWindow`).
     */
    fun addUsage(day: String, upDelta: Long, downDelta: Long, secondsDelta: Long) = synchronized(lock) {
        if (upDelta <= 0 && downDelta <= 0 && secondsDelta <= 0) return@synchronized
        val state = load()
        val current = state.usage.firstOrNull { it.day == day } ?: Usage(day, 0, 0, 0)
        val updated = current.copy(
            bytesUp = current.bytesUp + upDelta.coerceAtLeast(0),
            bytesDown = current.bytesDown + downDelta.coerceAtLeast(0),
            // Borne serveur : 25 h par jour (`MAX_SECONDS`).
            seconds = (current.seconds + secondsDelta.coerceAtLeast(0)).coerceAtMost(25 * 3_600),
        )
        val days = (state.usage.filter { it.day != day } + updated).sortedBy { it.day }.takeLast(2)
        save(state.copy(usage = days))
    }

    /** Prochain lot à envoyer, ou `null` si rien n'a changé. Ne modifie pas la file. */
    fun peekBatch(): Batch? = synchronized(lock) {
        val state = load()
        val reports = state.reports.take(BATCH)
        val usage = state.usage.firstOrNull { it !in state.sentUsage }
        if (reports.isEmpty() && usage == null) null else Batch(usage, reports.ifEmpty { null })
    }

    /**
     * Vide la file par lots tant que le serveur accepte. S'arrête au premier
     * échec réessayable et programme le backoff.
     *
     * @return nombre de lots acceptés.
     */
    suspend fun flush(send: suspend (Batch) -> SendResult): Int {
        if (clock() < nextAttemptAtMs()) return 0
        var accepted = 0
        while (true) {
            val batch = peekBatch() ?: break
            when (send(batch)) {
                SendResult.ACCEPTED, SendResult.REJECTED -> {
                    if (settle(batch)) accepted++
                }
                SendResult.RETRY -> {
                    backoff()
                    break
                }
            }
        }
        return accepted
    }

    /** Retire le lot envoyé (accepté ou refusé définitivement) et remet le backoff à zéro. */
    private fun settle(batch: Batch): Boolean = synchronized(lock) {
        val state = load()
        val sent = batch.reports.orEmpty()
        val remaining = if (state.reports.take(sent.size) == sent) state.reports.drop(sent.size) else state.reports - sent.toSet()
        val sentUsage = if (batch.usage != null) (state.sentUsage.filter { it.day != batch.usage.day } + batch.usage).takeLast(2) else state.sentUsage
        save(state.copy(reports = remaining, sentUsage = sentUsage, failures = 0, nextAttemptAtMs = 0))
        true
    }

    private fun backoff() = synchronized(lock) {
        val state = load()
        val delay = BACKOFF_MS[state.failures.coerceAtMost(BACKOFF_MS.size - 1)]
        save(state.copy(failures = state.failures + 1, nextAttemptAtMs = clock() + delay))
    }

    /** Classement d'une réponse HTTP selon D64. `status == 0` : pas de réponse (réseau). */
    fun classify(status: Int): SendResult = when {
        status in 200..299 -> SendResult.ACCEPTED
        status == 0 || status == 408 || status == 429 || status >= 500 -> SendResult.RETRY
        status in 400..499 -> SendResult.REJECTED
        else -> SendResult.RETRY
    }

    fun clear() = synchronized(lock) { store.remove(KEY) }
}
