package cm.bouendji.vpn.vpn

import cm.bouendji.vpn.crypto.SecureStore
import cm.bouendji.vpn.net.ApiClient
import java.time.LocalDate

/**
 * Usage du jour et rapports de sonde, envoyés par `POST /v1/me/telemetry`.
 *
 * - `usage` est un **total du jour** : le serveur garde le maximum (`GREATEST`),
 *   un envoi rejoué ne double rien ; le compteur repart à zéro au changement de
 *   date du téléphone.
 * - les rapports de sonde alimentent le témoin différentiel (D63) ; 20 par lot
 *   au plus (D64), 200 en attente au plus.
 */
class UsageMeter(private val store: SecureStore) {

    private var lastUp = -1L
    private var lastDown = -1L
    private val pending = ArrayDeque<ApiClient.ConfigReportDto>()

    @Synchronized
    fun onTotals(totals: TrafficTotals, elapsedSeconds: Int) {
        rollDay()
        // Les compteurs de sing-box repartent de zéro à chaque démarrage du moteur.
        val deltaUp = if (lastUp < 0 || totals.uploadBytes < lastUp) totals.uploadBytes else totals.uploadBytes - lastUp
        val deltaDown = if (lastDown < 0 || totals.downloadBytes < lastDown) totals.downloadBytes else totals.downloadBytes - lastDown
        lastUp = totals.uploadBytes
        lastDown = totals.downloadBytes
        put(KEY_UP, get(KEY_UP) + deltaUp)
        put(KEY_DOWN, get(KEY_DOWN) + deltaDown)
        put(KEY_SECONDS, get(KEY_SECONDS) + elapsedSeconds)
    }

    /** Nouvelle session moteur : les compteurs cumulés repartent de zéro. */
    @Synchronized
    fun resetSession() {
        lastUp = -1L
        lastDown = -1L
    }

    @Synchronized
    fun report(configId: String, ok: Boolean, latencyMs: Int?) {
        if (pending.size >= MAX_PENDING) pending.removeFirst()
        pending.addLast(ApiClient.ConfigReportDto(configId, ok, if (ok) latencyMs else null))
    }

    @Synchronized
    fun today(): ApiClient.UsageDto {
        rollDay()
        return ApiClient.UsageDto(
            day = store.getString(KEY_DAY) ?: LocalDate.now().toString(),
            bytesUp = get(KEY_UP),
            bytesDown = get(KEY_DOWN),
            seconds = get(KEY_SECONDS).coerceAtMost(86_400).toInt(),
        )
    }

    /** Envoie l'usage et un lot de rapports ; un échec réseau remet le lot en file. */
    suspend fun flush(api: ApiClient, activeConfigId: String? = null) {
        val usage = today()
        val batch = synchronized(this) { List(minOf(pending.size, BATCH)) { pending.removeFirst() } }
        val result = runCatching { api.telemetry(usage, batch, activeConfigId) }
        if (result.isFailure) synchronized(this) { batch.asReversed().forEach { pending.addFirst(it) } }
    }

    private fun rollDay() {
        val today = LocalDate.now().toString()
        if (store.getString(KEY_DAY) != today) {
            store.putString(KEY_DAY, today)
            put(KEY_UP, 0); put(KEY_DOWN, 0); put(KEY_SECONDS, 0)
        }
    }

    private fun get(key: String): Long = store.getString(key)?.toLongOrNull() ?: 0L

    private fun put(key: String, value: Long) {
        store.putString(key, value.toString())
    }

    companion object {
        private const val KEY_DAY = "usage.day"
        private const val KEY_UP = "usage.up"
        private const val KEY_DOWN = "usage.down"
        private const val KEY_SECONDS = "usage.seconds"

        private const val MAX_PENDING = 200
        private const val BATCH = 20
    }
}
