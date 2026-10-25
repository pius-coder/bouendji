package cm.bouendji.vpn.vpn

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.net.VpnService
import android.os.Build
import android.os.ParcelFileDescriptor
import android.util.Log
import cm.bouendji.vpn.BuildConfig
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import cm.bouendji.vpn.AppContainer
import cm.bouendji.vpn.VpnApplication
import cm.bouendji.vpn.brand.BrandTokens
import cm.bouendji.vpn.config.SingBoxConfig
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.sync.withPermit
import kotlinx.coroutines.withContext
import kotlin.coroutines.coroutineContext

/**
 * Le service VPN.
 *
 * Règles tenues ici, et vérifiables en le lisant :
 *
 * 1. **Notification permanente obligatoire.** Le service passe en avant-plan
 *    avant de tenter quoi que ce soit ; s'il ne peut pas établir le tunnel, il
 *    s'arrête et le dit au lieu de rester « connecté » à vide.
 * 2. **La configuration ne touche jamais le disque en clair.** Elle est lue
 *    chiffrée depuis [cm.bouendji.vpn.offline.ConfigVault], construite en
 *    mémoire par [SingBoxConfig], passée au moteur, puis oubliée.
 * 3. **Aucun état mensonger.** L'état publié est celui du moteur, pas celui
 *    qu'on espère : un moteur absent donne « aucune connexion disponible ».
 * 4. **Reconnexion préventive** à `max_session_seconds - 60` (D25), pas à la
 *    coupure : la valeur vient du bundle, jamais d'une constante ici.
 * 5. **Pas de résurrection silencieuse.** `START_NOT_STICKY` : si Android tue
 *    le service, il ne le relance pas sans que l'utilisateur l'ait demandé.
 *    Le « toujours actif » est un réglage système, pas une astuce de service.
 * 6. **Un seul propriétaire du cycle de vie.** Démarrer, reconnecter, démonter
 *    et expirer passent par [lifecycle]. Un démontage publie `STOPPED` seulement
 *    une fois le moteur arrêté et le TUN fermé. Un appui pendant qu'un tunnel
 *    tourne ne lance jamais un second tunnel.
 *
 * Ce qui n'est **pas** dans ce lot : le consentement (`VpnService.prepare`) est
 * déclenché par l'UI, les statistiques de débit, le récepteur de démarrage.
 */
class VpnTunnelService : VpnService() {

    companion object {
        const val ACTION_START = "cm.bouendji.vpn.action.START"
        const val ACTION_STOP = "cm.bouendji.vpn.action.STOP"
        const val ACTION_RECONNECT = "cm.bouendji.vpn.action.RECONNECT"
        const val ACTION_SELECT = "cm.bouendji.vpn.action.SELECT"
        const val ACTION_PROBE = "cm.bouendji.vpn.action.PROBE"
        const val EXTRA_CONFIG_ID = "configId"

        /** Préférence de sortie (D18) : `configId`, ou [ServerBus.AUTO]. */
        const val PREF_SERVER = "vpn.preferredServer"

        /** Protection DNS (réglage) : "0" la coupe, toute autre valeur la garde. */
        const val PREF_DNS_PROTECTION = "vpn.dnsProtection"

        /** failover-client : sonde courte, deux échecs avant bascule, 4 tests en parallèle. */
        private const val PROBE_INTERVAL_MS = 30_000L
        private const val PROBE_TIMEOUT_MS = 5_000
        private const val PARALLEL_PROBES = 4
        private val BACKOFF_MS = longArrayOf(30_000L, 120_000L, 600_000L)

        /** Télémétrie chaque minute de tunnel (une seconde par tour) : le Profil reste à jour. */
        private const val TELEMETRY_EVERY_TICKS = 60

        private const val CHANNEL_ID = "vpn-state"
        private const val NOTIFICATION_ID = 4101

        /** Une seule source pour l'adresse TUN : le service la pose, le moteur la lit. */
        const val TUN_ADDRESS = "172.19.0.1"
        const val TUN_PREFIX_LENGTH = 30
        const val TUN_MTU = 1500

        private val DNS_SERVERS = listOf("1.1.1.1", "1.0.0.1")

        /**
         * Démarre le tunnel. À appeler après un `VpnService.prepare()` accepté :
         * sans consentement, le service s'arrête proprement.
         */
        fun start(context: Context) {
            ContextCompat.startForegroundService(
                context,
                Intent(context, VpnTunnelService::class.java).setAction(ACTION_START),
            )
        }

        fun stop(context: Context) {
            context.startService(
                Intent(context, VpnTunnelService::class.java).setAction(ACTION_STOP),
            )
        }

        /** Choix d'un serveur pendant que le tunnel tourne ; sinon seule la préférence compte. */
        fun select(context: Context, configId: String) {
            context.startService(
                Intent(context, VpnTunnelService::class.java).setAction(ACTION_SELECT).putExtra(EXTRA_CONFIG_ID, configId),
            )
        }

        /** Mesure de toutes les sorties à travers le tunnel. */
        fun probe(context: Context) {
            context.startService(Intent(context, VpnTunnelService::class.java).setAction(ACTION_PROBE))
        }

        /** `null` = consentement déjà donné ; sinon l'Intent à lancer avec `startActivityForResult`. */
        fun consentIntent(context: Context): Intent? = VpnService.prepare(context)
    }

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    /**
     * Verrou du cycle de vie : démarrer, reconnecter, démonter et expirer passent
     * tous par lui. Deux appuis rapprochés s'enchaînent au lieu de se disputer le
     * moteur et le TUN.
     */
    private val lifecycle = Mutex()

    /** Un arrêt a été demandé : la supervision ne publie plus rien tant qu'aucun tunnel ne repart. */
    @Volatile private var stopRequested = false

    /** Identifiant de la session en cours ; un rappel du moteur d'une session close est ignoré. */
    @Volatile private var sessionId = 0L

    private var tun: ParcelFileDescriptor? = null
    private var reconnectJob: Job? = null
    private var expiryJob: Job? = null
    private var connectJob: Job? = null
    private var supervisorJob: Job? = null
    private var trafficJob: Job? = null
    private val meter by lazy { UsageMeter(container.secureStore) }
    @Volatile private var lastPlan: SingBoxConfig.TunnelPlan? = null
    private var connectedSince: Long = 0L

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
                requestStop(detail = null)
                return START_NOT_STICKY
            }

            ACTION_SELECT -> {
                val configId = intent.getStringExtra(EXTRA_CONFIG_ID) ?: ServerBus.AUTO
                container.secureStore.putString(PREF_SERVER, configId)
                val plan = lastPlan
                if (plan == null) stopIfIdle() else scope.launch { selectNow(plan, configId) }
                return START_NOT_STICKY
            }

            ACTION_PROBE -> {
                val plan = lastPlan
                if (plan == null) stopIfIdle() else scope.launch { probeAll(plan); refreshActive(plan) }
                return START_NOT_STICKY
            }

            ACTION_RECONNECT -> {
                // Avant-plan d'abord : l'appel doit suivre dans les 5 s, même pour un arrêt.
                promoteToForeground(TunnelState.RECONNECTING, "Reconnexion…")
                if (lastPlan == null) requestStop(detail = "Aucune configuration à reconnecter.") else launchConnect(restart = true)
                return START_NOT_STICKY
            }

            else -> {
                // Avant-plan d'abord : `startForegroundService` impose de
                // promouvoir ou d'arrêter dans les 5 s.
                if (tunnelRunning()) {
                    // Un tunnel tourne déjà : l'appui est fusionné, jamais un second tunnel.
                    // Sur « Aucun serveur » le tunnel est monté sans sortie et le bouton
                    // affiche « en marche » : il coupe.
                    val current = TunnelStateBus.state.value
                    promoteToForeground(current, TunnelStateBus.detail.value)
                    if (current == TunnelState.NO_CONNECTION) requestStop(detail = null)
                    return START_NOT_STICKY
                }

                promoteToForeground(TunnelState.CONNECTING, "Préparation du tunnel…")

                // `prepare()` non nul = consentement absent ou retiré.
                if (VpnService.prepare(this) != null) {
                    requestStop(detail = "Consentement VPN requis.")
                    return START_NOT_STICKY
                }
                launchConnect(restart = false)
                return START_NOT_STICKY
            }
        }
    }

    /** Appelé quand une autre application VPN prend la main : le tunnel meurt. */
    override fun onRevoke() {
        publish(TunnelState.STOPPED, "Un autre VPN a pris la main : tunnel arrêté.")
        requestStop(detail = null, keepState = true)
    }

    override fun onDestroy() {
        reconnectJob?.cancel()
        expiryJob?.cancel()
        connectJob?.cancel()
        closeTun()
        scope.cancel()
        super.onDestroy()
    }

    /* ------------------------------------------------------------------ connexion */

    /** Vrai tant qu'un tunnel existe ou se monte, et qu'aucun arrêt n'est demandé. */
    private fun tunnelRunning(): Boolean =
        !stopRequested && (connectJob?.isActive == true || lastPlan != null)

    /** Vrai tant qu'un tunnel est monté et qu'aucun arrêt n'est demandé. */
    private fun live(): Boolean = !stopRequested && lastPlan != null

    /**
     * Lance un démarrage, ou un redémarrage, sous verrou. Le démarrage précédent
     * encore en vol est annulé. Un redémarrage arrête d'abord le moteur et le TUN.
     */
    private fun launchConnect(restart: Boolean) {
        stopRequested = false
        connectJob?.cancel()
        connectJob = scope.launch {
            lifecycle.withLock {
                if (restart) {
                    supervisorJob?.cancel()
                    trafficJob?.cancel()
                    runCatching { container.tunnelEngine.stop() }
                    closeTun()
                }
                connectInternal()
            }
        }
    }

    /** Corps d'un démarrage. À appeler uniquement sous [lifecycle]. */
    private suspend fun connectInternal() {
        val engine = container.tunnelEngine
        if (!engine.isAvailable()) {
            // Honnêteté : pas de moteur, pas de tunnel, pas de « connecté ».
            teardown(detail = "Moteur sing-box indisponible dans cette version.", keepState = false)
            return
        }

        val payload = container.vault.read()
        if (payload == null) {
            teardown(detail = "Aucune configuration enregistrée : connectez-vous ou importez un bundle.", keepState = false)
            return
        }

        val plan = SingBoxConfig.build(
            payload = payload,
            tun = SingBoxConfig.TunOptions(
                address = "$TUN_ADDRESS/$TUN_PREFIX_LENGTH",
                mtu = TUN_MTU,
            ),
            preferredConfigId = preferredConfigId(),
            dnsProtection = container.secureStore.getString(PREF_DNS_PROTECTION) != "0",
        )
        if (plan == null) {
            container.vault.clear()
            teardown(detail = "Aucun serveur utilisable : toutes les configurations ont expiré.", keepState = false)
            return
        }
        if (plan.expiresAtMs <= System.currentTimeMillis()) {
            container.vault.clear()
            publish(TunnelState.SUBSCRIPTION_EXPIRED, "Abonnement expiré : aucune sortie valide.")
            teardown(detail = null, keepState = true)
            return
        }

        lastPlan = plan
        // Aucun TUN précédent ne doit survivre à ce démarrage : il serait orphelin.
        closeTun()

        val descriptor = establishTun()
        if (descriptor == null) {
            teardown(detail = "Android n'a pas accordé l'interface tunnel.", keepState = false)
            return
        }
        tun = descriptor

        sessionId++
        val session = sessionId
        val result = engine.start(
            TunnelRequest(
                configJson = plan.json,
                tun = descriptor,
                protect = { fd -> protect(fd) },
                onFatal = { reason ->
                    if (BuildConfig.DEBUG) Log.w("VpnTunnel", "fatal: " + scrub(reason))
                    // Moteur abandonné : le tunnel est coupé, l'état le dit (motif, pas « nouvel essai »).
                    if (session == sessionId) requestStop(detail = reason)
                },
                clashApiPort = plan.clashApiPort,
                clashApiSecret = plan.clashApiSecret,
            ),
        )

        if (result.isFailure) {
            teardown(detail = result.exceptionOrNull()?.message ?: "Le moteur a refusé de démarrer.", keepState = false)
            return
        }

        if (!coroutineContext.isActive) {
            // Arrêt demandé pendant le démarrage : le moteur vient de monter, on le coupe ici.
            runCatching { container.tunnelEngine.stop() }
            closeTun()
            return
        }

        connectedSince = System.currentTimeMillis()
        ServerBus.setServers(plan.nodes.map { ServerStatus(it.configId, it.tag, it.label, it.region) })
        // Le tunnel est monté, pas encore prouvé : « connecté » attend une sonde réussie.
        publish(TunnelState.CONNECTING, "Vérification de la connexion…")
        startSupervisor(plan)
        scheduleReconnect(plan.reconnectAfterSeconds)
        scheduleExpiry(plan.expiresAtMs)
    }

    /* ------------------------------------------------------------ arrêt */

    /**
     * Arrêt demandé (bouton, consentement retiré, moteur mort, expiration). Les
     * tâches du tunnel sont annulées tout de suite. Le démontage passe après le
     * verrou : un démarrage en cours s'interrompt avant d'être démonté.
     */
    private fun requestStop(detail: String?, keepState: Boolean = false) {
        stopRequested = true
        reconnectJob?.cancel()
        expiryJob?.cancel()
        connectJob?.cancel()
        supervisorJob?.cancel()
        trafficJob?.cancel()
        scope.launch { lifecycle.withLock { teardown(detail, keepState) } }
    }

    /**
     * Démontage ordonné, sous verrou : moteur, puis TUN, puis état publié, puis
     * arrêt du service. Non annulable : il va au bout même si la tâche qui l'a
     * lancé vient d'être annulée.
     */
    private suspend fun teardown(detail: String?, keepState: Boolean) = withContext(NonCancellable) {
        // Debug seulement : le motif d'arrêt, jamais la configuration (UUID et liens masqués).
        if (BuildConfig.DEBUG && detail != null) Log.w("VpnTunnel", scrub(detail))
        sessionId++
        reconnectJob?.cancel()
        expiryJob?.cancel()
        supervisorJob?.cancel()
        trafficJob?.cancel()
        if (lastPlan != null) {
            val api = runCatching { container.api }.getOrNull()
            if (api != null) CoroutineScope(Dispatchers.IO).launch { meter.flush(api) }
        }
        ServerBus.setActive(null)
        ServerBus.setTraffic(null)
        ServerBus.setNotice(null)
        // Moteur d'abord, TUN ensuite : le TUN ne disparaît pas sous un moteur vivant.
        runCatching { container.tunnelEngine.stop() }
        closeTun()
        lastPlan = null
        connectedSince = 0L

        if (!keepState) publish(TunnelState.STOPPED, detail)

        ServiceCompat.stopForeground(this@VpnTunnelService, ServiceCompat.STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    /* ------------------------------------------------------------ supervision */

    private fun preferredConfigId(): String? =
        container.secureStore.getString(PREF_SERVER)?.takeIf { it.isNotEmpty() && it != ServerBus.AUTO }

    private fun stopIfIdle() {
        if (lastPlan == null && tun == null) stopSelf()
    }

    private fun startSupervisor(plan: SingBoxConfig.TunnelPlan) {
        supervisorJob?.cancel()
        supervisorJob = scope.launch { supervise(plan) }
        trafficJob?.cancel()
        meter.resetSession()
        trafficJob = scope.launch {
            var ticks = 0
            while (isActive) {
                container.tunnelEngine.trafficTotals().onSuccess {
                    ServerBus.setTraffic(it)
                    // Le temps en ligne ne compte que lorsque le trafic passe vraiment.
                    meter.onTotals(it, if (TunnelStateBus.state.value == TunnelState.CONNECTED) 1 else 0)
                }
                ticks++
                if (ticks % TELEMETRY_EVERY_TICKS == 0) meter.flush(container.api)
                delay(1_000)
            }
        }
    }

    /**
     * failover-client : on teste le trafic **à travers** le tunnel, pas le
     * réseau. Deux échecs consécutifs déclenchent la bascule ; plus rien ne
     * répond → bandeau « aucun serveur » (D61) et reprise 30 s → 2 min → 10 min.
     */
    private suspend fun supervise(plan: SingBoxConfig.TunnelPlan) {
        var healthy = if (probeSelector()) {
            onHealthy(plan, notice = null)
            true
        } else {
            failover(plan)
        }
        probeAll(plan)

        var failures = 0
        var backoff = 0
        while (coroutineContext.isActive) {
            if (!healthy) {
                delay(BACKOFF_MS[minOf(backoff, BACKOFF_MS.lastIndex)])
                backoff++
                healthy = failover(plan)
                if (healthy) backoff = 0
                continue
            }
            delay(PROBE_INTERVAL_MS)
            if (probeSelector()) {
                failures = 0
                refreshActive(plan)
                continue
            }
            failures++
            if (failures >= 2) {
                failures = 0
                healthy = failover(plan)
            }
        }
    }

    private suspend fun probeSelector(): Boolean =
        container.tunnelEngine.measureDelayMs(SingBoxConfig.SELECTOR_TAG, timeoutMs = PROBE_TIMEOUT_MS).isSuccess

    /** Mesure chaque sortie à travers le tunnel, 4 à la fois, et publie le résultat. */
    private suspend fun probeAll(plan: SingBoxConfig.TunnelPlan): List<Pair<SingBoxConfig.PlanNode, Int?>> = coroutineScope {
        val gate = Semaphore(PARALLEL_PROBES)
        plan.nodes.map { node ->
            async {
                gate.withPermit {
                    ServerBus.update(node.configId) { it.copy(probe = ProbeState.TESTING) }
                    val delayMs = container.tunnelEngine.measureDelayMs(node.tag, timeoutMs = PROBE_TIMEOUT_MS).getOrNull()
                    meter.report(node.configId, delayMs != null, delayMs)
                    ServerBus.update(node.configId) {
                        it.copy(
                            latencyMs = delayMs,
                            probe = if (delayMs != null) ProbeState.OK else ProbeState.FAILED,
                            method = ProbeMethod.TUNNEL,
                        )
                    }
                    node to delayMs
                }
            }
        }.awaitAll()
    }

    /**
     * Teste tout, garde la meilleure latence mesurée, déplace le selector.
     * Rend `false` quand aucune sortie ne répond : le tunnel reste monté
     * (reprise automatique), et l'état le dit.
     */
    private suspend fun failover(plan: SingBoxConfig.TunnelPlan): Boolean {
        if (!live()) return false
        publish(TunnelState.RECONNECTING, "Recherche d'un serveur qui répond…")
        val best = probeAll(plan)
            .mapNotNull { (node, delayMs) -> delayMs?.let { node to it } }
            .minByOrNull { it.second }
            ?.first
        if (!live()) return false
        if (best == null) {
            ServerBus.setActive(null)
            ServerBus.setNotice("Aucun serveur disponible pour le moment. Nouvel essai automatique.")
            publish(TunnelState.NO_CONNECTION, "Aucun serveur disponible. Nouvel essai automatique…")
            return false
        }
        container.tunnelEngine.selectOutbound(best.tag)
        val preferred = preferredConfigId()
        val overridden = preferred != null && preferred != best.configId
        onHealthy(
            plan,
            notice = if (overridden) "Votre choix ne répondait plus — bascule automatique vers ${best.label}." else null,
        )
        return true
    }

    /** Choix manuel (D18) : appliqué tout de suite, vérifié, et rattrapé par la bascule s'il échoue. */
    private suspend fun selectNow(plan: SingBoxConfig.TunnelPlan, configId: String) {
        if (!live()) return
        val tag = if (configId == ServerBus.AUTO) {
            if (plan.nodes.size >= 2) SingBoxConfig.AUTO_TAG else plan.nodes.first().tag
        } else {
            plan.nodes.firstOrNull { it.configId == configId }?.tag ?: return
        }
        container.tunnelEngine.selectOutbound(tag)
        if (probeSelector()) onHealthy(plan, notice = null) else failover(plan)
    }

    private fun onHealthy(plan: SingBoxConfig.TunnelPlan, notice: String?) {
        if (!live()) return
        ServerBus.setNotice(notice)
        scope.launch { refreshActive(plan) }
        publish(TunnelState.CONNECTED, null)
    }

    /** Quelle sortie porte le trafic : celle du selector, ou celle que l'urltest a retenue. */
    private suspend fun refreshActive(plan: SingBoxConfig.TunnelPlan) {
        val engine = container.tunnelEngine
        var tag = engine.currentOutbound(SingBoxConfig.SELECTOR_TAG).getOrNull()
        if (tag == SingBoxConfig.AUTO_TAG) tag = engine.currentOutbound(SingBoxConfig.AUTO_TAG).getOrNull()
        ServerBus.setActive(plan.nodes.firstOrNull { it.tag == tag }?.configId)
    }

    /* ---------------------------------------------------------------------- TUN */

    private fun establishTun(): ParcelFileDescriptor? {
        val builder = Builder()
            .setSession(BrandTokens.appName)
            .setMtu(TUN_MTU)
            .addAddress(TUN_ADDRESS, TUN_PREFIX_LENGTH)
            .addRoute("0.0.0.0", 0)
            .setBlocking(false)

        for (server in DNS_SERVERS) {
            runCatching { builder.addDnsServer(server) }
        }

        return runCatching { builder.establish() }.getOrNull()
    }

    private fun closeTun() {
        runCatching { tun?.close() }
        tun = null
    }

    /* --------------------------------------------------------------- planification */

    /** D25 : se reconnecter avant la coupure, avec 60 s de marge. */
    private fun scheduleReconnect(afterSeconds: Int) {
        reconnectJob?.cancel()
        reconnectJob = scope.launch {
            delay(afterSeconds.coerceAtLeast(60) * 1_000L)
            if (!isActive) return@launch
            promoteToForeground(TunnelState.RECONNECTING, "Renouvellement préventif de la session…")
            launchConnect(restart = true)
        }
    }

    /**
     * À l'expiration du bundle, le tunnel ne doit plus être présenté comme
     * protégé. On coupe et on dit pourquoi : c'est vérifiable côté serveur
     * (les UUID meurent à la même heure) et honnête côté utilisateur.
     */
    private fun scheduleExpiry(expiresAtMs: Long) {
        expiryJob?.cancel()
        val wait = expiresAtMs - System.currentTimeMillis()
        if (wait <= 0) {
            publish(TunnelState.SUBSCRIPTION_EXPIRED, "Abonnement expiré.")
            requestStop(detail = null, keepState = true)
            return
        }
        expiryJob = scope.launch {
            delay(wait)
            if (!isActive) return@launch
            container.vault.clear()
            publish(TunnelState.SUBSCRIPTION_EXPIRED, "Abonnement expiré : reconnexion impossible.")
            requestStop(detail = null, keepState = true)
        }
    }

    /* ------------------------------------------------------------ notification */

    private fun createChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = getSystemService(NotificationManager::class.java) ?: return
        if (manager.getNotificationChannel(CHANNEL_ID) != null) return
        val channel = NotificationChannel(
            CHANNEL_ID,
            "${BrandTokens.appName} — état du tunnel",
            // IMPORTANCE_LOW : la notification est permanente, pas une alerte.
            NotificationManager.IMPORTANCE_LOW,
        ).apply {
            description = "État de la connexion, durée de la session en cours."
            setShowBadge(false)
        }
        manager.createNotificationChannel(channel)
    }

    private fun promoteToForeground(state: TunnelState, detail: String?) {
        publish(state, detail)
        val notification = buildNotification(state, detail)
        if (Build.VERSION.SDK_INT >= 34) {
            ServiceCompat.startForeground(
                this,
                NOTIFICATION_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE,
            )
        } else {
            @Suppress("DEPRECATION")
            startForeground(NOTIFICATION_ID, notification)
        }
    }

    private fun buildNotification(state: TunnelState, detail: String?): Notification {
        val text = detail ?: label(state)
        val builder = NotificationCompat.Builder(this, CHANNEL_ID)
            // Icône système en attendant l'icône de marque : aucune image n'est
            // produite dans ce lot.
            .setSmallIcon(android.R.drawable.ic_lock_lock)
            .setContentTitle(BrandTokens.appName)
            .setContentText(text)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setShowWhen(state == TunnelState.CONNECTED)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setPriority(NotificationCompat.PRIORITY_LOW)

        if (state == TunnelState.CONNECTED && connectedSince > 0) {
            // La durée vit dans la notification, pas à côté du bouton.
            builder.setWhen(connectedSince).setUsesChronometer(true)
        }

        return builder.build()
    }

    private fun publish(state: TunnelState, detail: String?) {
        TunnelStateBus.publish(state, detail)
        val manager = getSystemService(NotificationManager::class.java) ?: return
        if (state == TunnelState.STOPPED) {
            // Un état arrêté ne laisse pas de notification : la disparition de
            // l'icône est elle-même une information honnête.
            runCatching { manager.cancel(NOTIFICATION_ID) }
            return
        }
        runCatching { manager.notify(NOTIFICATION_ID, buildNotification(state, detail)) }
    }

    private fun label(state: TunnelState): String = when (state) {
        TunnelState.STOPPED -> "Arrêté"
        TunnelState.CONNECTING -> "Connexion…"
        TunnelState.CONNECTED -> "Connecté"
        TunnelState.RECONNECTING -> "Reconnexion…"
        TunnelState.NO_CONNECTION -> "Aucune connexion disponible"
        TunnelState.SUBSCRIPTION_EXPIRED -> "Abonnement expiré"
        TunnelState.DEVICE_REVOKED -> "Appareil révoqué"
    }

    private fun scrub(text: String): String = text
        .replace(Regex("vless://\\S+"), "vless://…")
        .replace(Regex("[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"), "<uuid>")
}
