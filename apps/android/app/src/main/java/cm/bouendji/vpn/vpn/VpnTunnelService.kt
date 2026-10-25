package cm.bouendji.vpn.vpn

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.net.VpnService
import android.os.Build
import android.os.ParcelFileDescriptor
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import cm.bouendji.vpn.AppContainer
import cm.bouendji.vpn.MainActivity
import cm.bouendji.vpn.R
import cm.bouendji.vpn.VpnApplication
import cm.bouendji.vpn.access.ExpiryPolicy
import cm.bouendji.vpn.access.ExpiryVerdict
import cm.bouendji.vpn.brand.BrandTokens
import cm.bouendji.vpn.config.BundlePayload
import cm.bouendji.vpn.config.SingBoxConfig
import cm.bouendji.vpn.config.parseInstant
import cm.bouendji.vpn.sync.BundleSync
import cm.bouendji.vpn.telemetry.TelemetryQueue
import cm.bouendji.vpn.util.IsoTime
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/**
 * Le service VPN.
 *
 * Ce qu'il tient, et où le vérifier en le lisant :
 *
 * 1. **Avant-plan d'abord** (`startForegroundService` impose 5 s), puis la
 *    connexion ; un échec arrête le service et dit pourquoi.
 * 2. **La configuration ne touche jamais le disque en clair** : coffre chiffré
 *    → JSON en mémoire → moteur.
 * 3. **D25** : reconnexion préventive à `maxSessionSeconds − 60`.
 * 4. **D67, deux échéances** : la première configuration qui meurt déclenche un
 *    nouveau tirage, sans vider le coffre ; seule une fin de droits prouvée
 *    produit « abonnement expiré ».
 * 5. **D70** : boucle de mesure à travers le tunnel (60 s, puis 30 s → 2 min →
 *    10 min quand rien ne répond), bascule forcée après 2 échecs de la sortie
 *    active, rapports en file (D64).
 * 6. **D61** : aucune sortie ne répond → bandeau (`LinkInfo.degraded`), pas de
 *    coupure ; reprise automatique (D19).
 * 7. `START_NOT_STICKY` : Android ne relance pas le service sans demande ; le
 *    « VPN permanent » est un réglage système, qui démarre ce service lui-même.
 */
class VpnTunnelService : VpnService() {

    companion object {
        const val ACTION_START = "cm.bouendji.vpn.action.START"
        const val ACTION_STOP = "cm.bouendji.vpn.action.STOP"
        const val ACTION_RECONNECT = "cm.bouendji.vpn.action.RECONNECT"

        private const val TAG = "VpnTunnel"
        private const val CHANNEL_ID = "vpn-state"
        private const val NOTIFICATION_ID = 4101

        /** Une seule source pour l'adresse TUN : le service la pose, le moteur la lit. */
        const val TUN_ADDRESS = "172.19.0.1"
        const val TUN_PREFIX_LENGTH = 30
        const val TUN_MTU = 1500

        private val DNS_SERVERS = listOf("1.1.1.1", "1.0.0.1")

        /** D19 : reprise automatique quand plus rien n'est servi. */
        private val RETRY_MS = longArrayOf(30_000, 120_000, 600_000)

        fun start(context: Context) {
            ContextCompat.startForegroundService(context, Intent(context, VpnTunnelService::class.java).setAction(ACTION_START))
        }

        fun stop(context: Context) {
            context.startService(Intent(context, VpnTunnelService::class.java).setAction(ACTION_STOP))
        }

        /** `null` = consentement déjà donné ; sinon l'Intent système à lancer. */
        fun consentIntent(context: Context): Intent? = VpnService.prepare(context)
    }

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val lifecycle = Mutex()

    private var tun: ParcelFileDescriptor? = null
    private var plan: SingBoxConfig.TunnelPlan? = null
    private var labels: Map<String, String> = emptyMap()
    private var connectedSince = 0L
    private var retryRound = 0

    private var connectJob: Job? = null
    private var reconnectJob: Job? = null
    private var softExpiryJob: Job? = null
    private var hardExpiryJob: Job? = null
    private var monitorJob: Job? = null
    private var retryJob: Job? = null

    private val container: AppContainer
        get() = (application as VpnApplication).container

    /* ------------------------------------------------------------- cycle de vie */

    override fun onCreate() {
        super.onCreate()
        createChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_STOP -> {
                shutdown(detail = null)
                return START_NOT_STICKY
            }
            ACTION_RECONNECT -> {
                promoteToForeground(TunnelState.RECONNECTING, "Reconnexion…")
                launchConnect()
            }
            else -> {
                // ACTION_START, ou démarrage par le système (« VPN permanent »).
                promoteToForeground(TunnelState.CONNECTING, "Préparation du tunnel…")
                if (VpnService.prepare(this) != null) {
                    shutdown(detail = "Autorisation VPN requise.")
                    return START_NOT_STICKY
                }
                launchConnect()
            }
        }
        return START_NOT_STICKY
    }

    override fun onRevoke() {
        publish(TunnelState.STOPPED, "Un autre VPN a pris la main : tunnel arrêté.")
        shutdown(detail = null, keepState = true)
    }

    override fun onDestroy() {
        cancelJobs()
        closeTun()
        scope.cancel()
        super.onDestroy()
    }

    /* ------------------------------------------------------------------ connexion */

    private fun launchConnect() {
        connectJob?.cancel()
        connectJob = scope.launch { lifecycle.withLock { connectInternal() } }
    }

    private suspend fun connectInternal() {
        val engine = container.tunnelEngine
        if (!engine.isAvailable()) {
            shutdown(detail = "Le moteur VPN n'a pas pu être chargé sur cet appareil.")
            return
        }

        // Liste locale d'abord ; un tirage seulement si elle est vide ou morte.
        var payload = container.vault.read()
        var built = payload?.let(::buildPlan)
        if (built == null) {
            syncQuietly()
            payload = container.vault.read()
            built = payload?.let(::buildPlan)
        }
        if (payload == null) {
            shutdown(detail = "Aucun accès enregistré : connectez-vous et activez un forfait.")
            return
        }
        if (built == null) {
            onNothingUsable()
            return
        }

        stopEngine()
        closeTun()
        val descriptor = establishTun()
        if (descriptor == null) {
            shutdown(detail = "Android n'a pas accordé l'interface VPN.")
            return
        }
        tun = descriptor

        val result = engine.start(
            TunnelRequest(
                configJson = built.json,
                tun = descriptor,
                protect = { fd -> protect(fd) },
                onFatal = { reason ->
                    publish(TunnelState.NO_CONNECTION, reason)
                    scheduleRetry()
                },
                clashApiPort = built.clashApiPort,
                clashApiSecret = built.clashApiSecret,
            ),
        )
        if (result.isFailure) {
            closeTun()
            Log.w(TAG, "démarrage du moteur refusé : ${result.exceptionOrNull()?.javaClass?.simpleName}")
            shutdown(detail = "Le moteur VPN a refusé de démarrer.")
            return
        }

        plan = built
        labels = labelsFor(payload, built)
        retryRound = 0
        connectedSince = System.currentTimeMillis()
        publish(TunnelState.CONNECTED, null)
        TunnelStateBus.publishLink(TunnelStateBus.LinkInfo(connectedSinceMs = connectedSince))

        scheduleReconnect(built.reconnectAfterSeconds)
        scheduleSoftExpiry(built.nextConfigExpiryMs)
        scheduleHardExpiry(built.bundleExpiresAtMs)
        startMonitor(built)
    }

    private fun buildPlan(payload: BundlePayload): SingBoxConfig.TunnelPlan? = SingBoxConfig.build(
        payload = payload,
        tun = SingBoxConfig.TunOptions(address = "$TUN_ADDRESS/$TUN_PREFIX_LENGTH", mtu = TUN_MTU),
    )

    private fun labelsFor(payload: BundlePayload, built: SingBoxConfig.TunnelPlan): Map<String, String> {
        val byId = payload.configs.associate { it.id to it.label }
        return built.nodeTags.zip(built.configIds).associate { (tag, id) -> tag to (byId[id] ?: tag) }
    }

    /** Plus aucune configuration valide localement : droits finis, ou nœuds morts ? */
    private fun onNothingUsable() {
        val verdict = ExpiryPolicy.atBundleExpiry(
            nowMs = System.currentTimeMillis(),
            rightsEndsAtMs = container.access.rightsEndsAtMs(),
            endedByServer = container.access.rightsEndedByServer(),
        )
        if (verdict == ExpiryVerdict.RIGHTS_ENDED) {
            container.vault.clear()
            publish(TunnelState.SUBSCRIPTION_EXPIRED, "Votre accès a expiré.")
            shutdown(detail = null, keepState = true)
        } else {
            stopEngine()
            closeTun()
            publish(TunnelState.NO_CONNECTION, "Aucun serveur disponible pour le moment. Nouvel essai automatique.")
            scheduleRetry()
        }
    }

    /** D19 : reprise avec backoff, le service reste au premier plan et le dit. */
    private fun scheduleRetry() {
        retryJob?.cancel()
        val wait = RETRY_MS[retryRound.coerceAtMost(RETRY_MS.size - 1)]
        retryRound++
        retryJob = scope.launch {
            delay(wait)
            if (!isActive) return@launch
            promoteToForeground(TunnelState.RECONNECTING, "Nouvel essai de connexion…")
            lifecycle.withLock { connectInternal() }
        }
    }

    /** Tirage du bundle ; ne lève jamais, ne vide le coffre que sur preuve. */
    private suspend fun syncQuietly(): BundleSync.Outcome? {
        if (runCatching { container.api.hasSession() }.getOrDefault(false).not()) return null
        val outcome = runCatching { container.bundleSync.sync() }.getOrNull() ?: return null
        when (outcome) {
            BundleSync.Outcome.Revoked -> {
                publish(TunnelState.DEVICE_REVOKED, "Cet appareil a été révoqué.")
                shutdown(detail = null, keepState = true)
            }
            BundleSync.Outcome.RightsEnded -> {
                publish(TunnelState.SUBSCRIPTION_EXPIRED, "Votre accès a expiré.")
                shutdown(detail = null, keepState = true)
            }
            else -> Unit
        }
        return outcome
    }

    /** Reconstruit le tunnel si le serveur a changé la liste servie. */
    private suspend fun refreshAndReload() {
        val outcome = syncQuietly()
        if (outcome is BundleSync.Outcome.Updated && outcome.changed) {
            promoteToForeground(TunnelState.RECONNECTING, "Nouvelle liste de serveurs…")
            lifecycle.withLock { connectInternal() }
            return
        }
        // Rien de neuf : on replanifie sur la prochaine configuration encore vivante.
        val next = container.vault.read()?.configs
            ?.mapNotNull { parseInstant(it.expiresAt) }
            ?.filter { it > System.currentTimeMillis() }
            ?.minOrNull()
        if (next == null) {
            lifecycle.withLock { onNothingUsable() }
        } else {
            scheduleSoftExpiry(next)
        }
    }

    /* ---------------------------------------------------------------------- TUN */

    private fun establishTun(): ParcelFileDescriptor? {
        val builder = Builder()
            .setSession(BrandTokens.appName)
            .setMtu(TUN_MTU)
            .addAddress(TUN_ADDRESS, TUN_PREFIX_LENGTH)
            .addRoute("0.0.0.0", 0)
            .setBlocking(false)
        for (server in DNS_SERVERS) runCatching { builder.addDnsServer(server) }
        // Le trafic de l'application elle-même (API, renouvellement du bundle)
        // ne passe pas par le tunnel : sinon un tunnel mort empêcherait de
        // récupérer la liste qui le réparerait.
        runCatching { builder.addDisallowedApplication(packageName) }
        return runCatching { builder.establish() }.getOrNull()
    }

    private fun closeTun() {
        runCatching { tun?.close() }
        tun = null
    }

    /* --------------------------------------------------------------- planification */

    private fun scheduleReconnect(afterSeconds: Int) {
        reconnectJob?.cancel()
        reconnectJob = scope.launch {
            delay(afterSeconds.coerceAtLeast(60) * 1_000L)
            if (!isActive) return@launch
            promoteToForeground(TunnelState.RECONNECTING, "Renouvellement préventif de la session…")
            lifecycle.withLock { connectInternal() }
        }
    }

    private fun scheduleSoftExpiry(atMs: Long) {
        softExpiryJob?.cancel()
        softExpiryJob = scope.launch {
            delay((atMs - System.currentTimeMillis()).coerceAtLeast(1_000))
            if (isActive) refreshAndReload()
        }
    }

    private fun scheduleHardExpiry(atMs: Long) {
        hardExpiryJob?.cancel()
        hardExpiryJob = scope.launch {
            delay((atMs - System.currentTimeMillis()).coerceAtLeast(1_000))
            if (!isActive) return@launch
            syncQuietly()
            lifecycle.withLock {
                val payload = container.vault.read()
                if (payload?.let(::buildPlan) == null) onNothingUsable() else connectInternal()
            }
        }
    }

    /* ------------------------------------------------------------ mesure (D70) */

    private fun startMonitor(current: SingBoxConfig.TunnelPlan) {
        monitorJob?.cancel()
        val policy = FailoverPolicy(current.nodeTags)
        val tagToConfig = current.nodeTags.zip(current.configIds).toMap()
        monitorJob = scope.launch {
            var lastUp = 0L
            var lastDown = 0L
            var lastTick = System.currentTimeMillis()
            // Première mesure rapide : l'accueil affiche une latence réelle tôt.
            delay(5_000)
            while (isActive) {
                val engine = container.tunnelEngine
                val active = engine.activeOutbound().getOrNull()
                val latencies = current.nodeTags.associateWith { tag -> engine.measureDelayMs(tag).getOrNull() }
                for ((tag, latency) in latencies) {
                    val configId = tagToConfig[tag] ?: continue
                    container.telemetry.add(TelemetryQueue.Report(configId, latency != null, latency))
                }

                var shown = active
                when (val decision = policy.onRound(active, latencies)) {
                    is FailoverPolicy.Decision.Switch -> {
                        if (engine.selectOutbound(decision.toTag).isSuccess) shown = decision.toTag
                    }
                    // Hors de la boucle : une reconstruction annule la boucle elle-même.
                    FailoverPolicy.Decision.AllDown -> scope.launch { refreshAndReload() }
                    FailoverPolicy.Decision.Keep -> Unit
                }
                TunnelStateBus.publishLink(
                    TunnelStateBus.LinkInfo(
                        latencyMs = shown?.let { latencies[it] },
                        exitLabel = shown?.let { labels[it] },
                        degraded = latencies.isNotEmpty() && latencies.values.all { it == null },
                        connectedSinceMs = connectedSince,
                    ),
                )

                // Consommation comptée par le moteur (D52, source `device`).
                val now = System.currentTimeMillis()
                engine.trafficTotals().getOrNull()?.let { (up, down) ->
                    // Compteurs remis à zéro par un redémarrage du moteur : on repart du total.
                    val dUp = if (up >= lastUp) up - lastUp else up
                    val dDown = if (down >= lastDown) down - lastDown else down
                    container.telemetry.addUsage(IsoTime.localDay(now), dUp, dDown, (now - lastTick) / 1_000)
                    lastUp = up
                    lastDown = down
                }
                lastTick = now
                container.flushPending()

                delay(policy.nextIntervalMs())
            }
        }
    }

    /* ------------------------------------------------------------------ arrêt */

    private fun cancelJobs() {
        for (job in listOf(reconnectJob, softExpiryJob, hardExpiryJob, monitorJob, retryJob)) job?.cancel()
    }

    private fun stopEngine() {
        monitorJob?.cancel()
        CoroutineScope(Dispatchers.IO).launch { runCatching { container.tunnelEngine.stop() } }
    }

    private fun shutdown(detail: String?, keepState: Boolean = false) {
        cancelJobs()
        connectJob?.cancel()
        stopEngine()
        closeTun()
        plan = null
        connectedSince = 0L
        if (!keepState) publish(TunnelState.STOPPED, detail)
        // Dernière chance d'envoyer les rapports d'échec avant de s'éteindre.
        CoroutineScope(Dispatchers.IO).launch { runCatching { container.flushPending() } }
        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    /* ------------------------------------------------------------ notification */

    private fun createChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = getSystemService(NotificationManager::class.java) ?: return
        if (manager.getNotificationChannel(CHANNEL_ID) != null) return
        val channel = NotificationChannel(CHANNEL_ID, "État de la connexion", NotificationManager.IMPORTANCE_LOW).apply {
            description = "Notification permanente tant que le VPN est actif."
            setShowBadge(false)
        }
        manager.createNotificationChannel(channel)
    }

    private fun promoteToForeground(state: TunnelState, detail: String?) {
        publish(state, detail)
        val notification = buildNotification(state, detail)
        if (Build.VERSION.SDK_INT >= 34) {
            ServiceCompat.startForeground(this, NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
    }

    private fun buildNotification(state: TunnelState, detail: String?): Notification {
        val open = PendingIntent.getActivity(
            this, 0,
            Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val stop = PendingIntent.getService(
            this, 1,
            Intent(this, VpnTunnelService::class.java).setAction(ACTION_STOP),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val builder = NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_tunnel)
            .setContentTitle(BrandTokens.appName)
            .setContentText(detail ?: label(state))
            .setContentIntent(open)
            .addAction(0, "Déconnecter", stop)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setShowWhen(state == TunnelState.CONNECTED)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setPriority(NotificationCompat.PRIORITY_LOW)
        if (state == TunnelState.CONNECTED && connectedSince > 0) {
            builder.setWhen(connectedSince).setUsesChronometer(true)
        }
        return builder.build()
    }

    private fun publish(state: TunnelState, detail: String?) {
        TunnelStateBus.publish(state, detail)
        val manager = getSystemService(NotificationManager::class.java) ?: return
        if (state == TunnelState.STOPPED) {
            runCatching { manager.cancel(NOTIFICATION_ID) }
            return
        }
        runCatching { manager.notify(NOTIFICATION_ID, buildNotification(state, detail)) }
    }

    private fun label(state: TunnelState): String = when (state) {
        TunnelState.STOPPED -> "Déconnecté"
        TunnelState.CONNECTING -> "Connexion…"
        TunnelState.CONNECTED -> "Connecté"
        TunnelState.RECONNECTING -> "Reconnexion…"
        TunnelState.NO_CONNECTION -> "Aucun serveur disponible"
        TunnelState.SUBSCRIPTION_EXPIRED -> "Accès expiré"
        TunnelState.DEVICE_REVOKED -> "Appareil révoqué"
    }
}
