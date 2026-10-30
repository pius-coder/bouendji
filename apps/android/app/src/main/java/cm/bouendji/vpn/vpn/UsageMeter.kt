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
 *
 * ## Pourquoi le cumul vit en mémoire
 *
 * La version précédente écrivait trois valeurs chiffrées (`AES-GCM` + `commit`)
 * **à chaque seconde** : 10 800 fsync/heure, pour un total qui n'est envoyé
 * qu'une fois par minute. Le cumul est maintenant tenu en mémoire et écrit par
 * lots ([persist]), au plus toutes les 15 s et à l'arrêt du tunnel.
 */
class UsageMeter(private val store: SecureStore) {

    private var lastUp = -1L
    private var lastDown = -1L
    private var accUp = 0L
    private var accDown = 0L
    private var accSeconds = 0L
    private var day: String? = null
    private val pending = ArrayDeque<ApiClient.ConfigReportDto>()

    @Synchronized
    fun onTotals(totals: TrafficTotals, elapsedSeconds: Int) {
        rollDay()
        // Les compteurs de sing-box repartent de zéro à chaque démarrage du moteur.
        val deltaUp = if (lastUp < 0 || totals.uploadBytes < lastUp) totals.uploadBytes else totals.uploadBytes - lastUp
        val deltaDown = if (lastDown < 0 || totals.downloadBytes < lastDown) totals.downloadBytes else totals.downloadBytes - lastDown
        lastUp = totals.uploadBytes
        lastDown = totals.downloadBytes
        accUp += deltaUp
        accDown += deltaDown
        accSeconds += elapsedSeconds
    }

    /** Écrit le cumul en mémoire. Jamais appelé depuis la boucle par seconde. */
    @Synchronized
    fun persist() {
        if (accUp == 0L && accDown == 0L && accSeconds == 0L) return
        put(KEY_UP, get(KEY_UP) + accUp)
        put(KEY_DOWN, get(KEY_DOWN) + accDown)
        put(KEY_SECONDS, get(KEY_SECONDS) + accSeconds)
        accUp = 0L
        accDown = 0L
        accSeconds = 0L
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
            day = day ?: LocalDate.now().toString(),
            bytesUp = get(KEY_UP) + accUp,
            bytesDown = get(KEY_DOWN) + accDown,
            seconds = (get(KEY_SECONDS) + accSeconds).coerceAtMost(86_400).toInt(),
        )
    }

    /** Envoie l'usage et un lot de rapports ; un échec réseau remet le lot en file. */
    suspend fun flush(api: ApiClient, activeConfigId: String? = null) {
        persist()
        val usage = today()
        val batch = synchronized(this) { List(minOf(pending.size, BATCH)) { pending.removeFirst() } }
        val result = runCatching { api.telemetry(usage, batch, activeConfigId) }
        if (result.isFailure) synchronized(this) { batch.asReversed().forEach { pending.addFirst(it) } }
    }

    private fun rollDay() {
        val today = LocalDate.now().toString()
        if (day == today) return
        if (day == null) {
            day = store.getString(KEY_DAY)
            if (day == today) return
        }
        day = today
        accUp = 0L
        accDown = 0L
        accSeconds = 0L
        store.putString(KEY_DAY, today)
        put(KEY_UP, 0)
        put(KEY_DOWN, 0)
        put(KEY_SECONDS, 0)
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
