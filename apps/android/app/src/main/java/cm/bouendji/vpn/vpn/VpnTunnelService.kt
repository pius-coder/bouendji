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
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

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
 *
 * Ce qui n'est **pas** dans ce lot : le consentement (`VpnService.prepare`) est
 * déclenché par l'UI, les statistiques de débit, le récepteur de démarrage, et
 * la bascule automatique (vague failover).
 */
class VpnTunnelService : VpnService() {

    companion object {
        const val ACTION_START = "cm.bouendji.vpn.action.START"
        const val ACTION_STOP = "cm.bouendji.vpn.action.STOP"
        const val ACTION_RECONNECT = "cm.bouendji.vpn.action.RECONNECT"

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

        /** `null` = consentement déjà donné ; sinon l'Intent à lancer avec `startActivityForResult`. */
        fun consentIntent(context: Context): Intent? = VpnService.prepare(context)
    }

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    private var tun: ParcelFileDescriptor? = null
    private var reconnectJob: Job? = null
    private var expiryJob: Job? = null
    private var connectJob: Job? = null
    private var lastPlan: SingBoxConfig.TunnelPlan? = null
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
                shutdown(detail = null)
                return START_NOT_STICKY
            }

            ACTION_RECONNECT -> {
                // On passe en avant-plan d'abord : si l'intent arrive par
                // `startForegroundService`, l'appel doit suivre dans les 5 s,
                // même pour finir en arrêt immédiat.
                promoteToForeground(TunnelState.RECONNECTING, "Reconnexion…")
                if (lastPlan == null) {
                    shutdown(detail = "Aucune configuration à reconnecter.")
                } else {
                    reconnect()
                }
                return START_NOT_STICKY
            }

            else -> {
                // Avant-plan d'abord : `startForegroundService` impose de
                // promouvoir ou d'arrêter dans les 5 s, y compris quand il n'y
                // a pas de consentement VPN et que le service va s'éteindre.
                promoteToForeground(TunnelState.CONNECTING, "Préparation du tunnel…")

                // `prepare()` non nul = consentement absent ou retiré.
                if (VpnService.prepare(this) != null) {
                    shutdown(detail = "Consentement VPN requis.")
                    return START_NOT_STICKY
                }
                connect()
                return START_NOT_STICKY
            }
        }
    }

    /** Appelé quand une autre application VPN prend la main : le tunnel meurt. */
    override fun onRevoke() {
        publish(TunnelState.STOPPED, "Un autre VPN a pris la main : tunnel arrêté.")
        shutdown(detail = null, keepState = true)
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

    private fun connect() {
        connectJob?.cancel()
        connectJob = scope.launch { connectInternal() }
    }

    private suspend fun connectInternal() {
        val engine = container.tunnelEngine
        if (!engine.isAvailable()) {
            // Honnêteté : pas de moteur, pas de tunnel, pas de « connecté ».
            shutdown(detail = "Moteur sing-box indisponible dans cette version.")
            return
        }

        val payload = container.vault.read()
        if (payload == null) {
            shutdown(detail = "Aucune configuration enregistrée : connectez-vous ou importez un bundle.")
            return
        }

        val plan = SingBoxConfig.build(
            payload = payload,
            tun = SingBoxConfig.TunOptions(
                address = "$TUN_ADDRESS/$TUN_PREFIX_LENGTH",
                mtu = TUN_MTU,
            ),
        )
        if (plan == null) {
            container.vault.clear()
            publish(TunnelState.NO_CONNECTION, "Toutes les configurations ont expiré.")
            shutdown(detail = null, keepState = true)
            return
        }
        if (plan.expiresAtMs <= System.currentTimeMillis()) {
            container.vault.clear()
            publish(TunnelState.SUBSCRIPTION_EXPIRED, "Abonnement expiré : aucune sortie valide.")
            shutdown(detail = null, keepState = true)
            return
        }

        lastPlan = plan

        val descriptor = establishTun()
        if (descriptor == null) {
            shutdown(detail = "Android n'a pas accordé l'interface tunnel.")
            return
        }
        tun = descriptor

        val result = engine.start(
            TunnelRequest(
                configJson = plan.json,
                tun = descriptor,
                protect = { fd -> protect(fd) },
                onFatal = { reason ->
                    // Le moteur abandonne : on ne laisse pas la notification
                    // annoncer un tunnel mort.
                    publish(TunnelState.NO_CONNECTION, reason)
                    shutdown(detail = null, keepState = true)
                },
                clashApiPort = plan.clashApiPort,
                clashApiSecret = plan.clashApiSecret,
            ),
        )

        if (result.isFailure) {
            closeTun()
            shutdown(detail = result.exceptionOrNull()?.message ?: "Le moteur a refusé de démarrer.")
            return
        }

        connectedSince = System.currentTimeMillis()
        publish(TunnelState.CONNECTED, null)
        scheduleReconnect(plan.reconnectAfterSeconds)
        scheduleExpiry(plan.expiresAtMs)
    }

    /**
     * Reconstruit le tunnel avec la configuration courante. Utilisé par la
     * reconnexion préventive et plus tard par la bascule quand le selector ne
     * suffit pas.
     */
    private fun reconnect() {
        connectJob?.cancel()
        connectJob = scope.launch {
            runCatching { container.tunnelEngine.stop() }
            closeTun()
            connectInternal()
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
            runCatching { container.tunnelEngine.stop() }
            closeTun()
            connect()
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
            shutdown(detail = null, keepState = true)
            return
        }
        expiryJob = scope.launch {
            delay(wait)
            if (!isActive) return@launch
            container.vault.clear()
            publish(TunnelState.SUBSCRIPTION_EXPIRED, "Abonnement expiré : reconnexion impossible.")
            shutdown(detail = null, keepState = true)
        }
    }

    /* ------------------------------------------------------------------ arrêt */

    private fun shutdown(detail: String?, keepState: Boolean = false) {
        reconnectJob?.cancel()
        expiryJob?.cancel()
        connectJob?.cancel()
        stopEngineAsync()
        closeTun()
        lastPlan = null
        connectedSince = 0L

        if (!keepState) publish(TunnelState.STOPPED, detail)

        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    /**
     * Arrêt du moteur hors du scope du service : `shutdown` est appelée depuis
     * `onRevoke`, où le scope est sur le point d'être annulé. Un scope dédié
     * garantit que `stop()` va au bout ; il meurt avec la coroutine.
     */
    private fun stopEngineAsync() {
        CoroutineScope(Dispatchers.IO).launch {
            runCatching { container.tunnelEngine.stop() }
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
}
