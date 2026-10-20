package cm.bouendji.vpn.ui

import android.content.Context
import android.os.Build
import cm.bouendji.vpn.AppContainer
import cm.bouendji.vpn.R
import cm.bouendji.vpn.brand.BrandTokens
import cm.bouendji.vpn.config.parseInstant
import cm.bouendji.vpn.crypto.DeviceKeys
import cm.bouendji.vpn.net.ApiClient
import cm.bouendji.vpn.net.ApiException
import cm.bouendji.vpn.net.BundleFetch
import cm.bouendji.vpn.vpn.TunnelState
import cm.bouendji.vpn.vpn.TunnelStateBus
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * Les **quatre** états de la commande principale.
 *
 * Ils sont volontairement moins nombreux que les sept états du socle
 * ([TunnelState]) : la commande ne raconte que ce qu'elle peut faire. Les états
 * « aucune connexion », « abonnement expiré » et « appareil révoqué » ne sont
 * pas des variantes du bouton — ils remplacent l'écran (voir `HomeScreen`),
 * parce qu'appuyer dessus ne changerait rien.
 */
sealed interface ControlState {
    /** Arrêté, rien n'est établi. */
    data object Idle : ControlState

    /** Négociation en cours. */
    data object Connecting : ControlState

    /** Le tunnel porte du trafic. */
    data object Connected : ControlState

    /** Bascule ou reconnexion : le tunnel a existé, il revient. */
    data object Degraded : ControlState
}

/** Ce qui empêche de se connecter, s'il y a quelque chose. */
sealed interface Availability {
    data object Ready : Availability

    /** [reasonRes] est un identifiant de ressource (`R.string…`). */
    data class Blocked(val reasonRes: Int, val detail: String? = null) : Availability
}

/**
 * Une sortie telle que l'utilisateur a le droit de la voir : un nom, une
 * région, une échéance. Jamais l'URI, jamais l'UUID, jamais le tag interne.
 */
data class NodeSummary(
    val label: String,
    val region: String,
    val expiresAtMs: Long,
)

sealed interface AccountState {
    data object Unknown : AccountState
    data object SignedOut : AccountState
    data object Loading : AccountState
    data class Ready(val me: ApiClient.MeResponse) : AccountState
    data class Failed(val message: String) : AccountState
}

sealed interface PlansState {
    data object Unknown : PlansState
    data object SignedOut : PlansState
    data object Loading : PlansState
    data class Ready(val subscription: ApiClient.SubscriptionResponse) : PlansState
    data class Failed(val message: String) : PlansState
}

enum class Busy {
    ACCOUNT,
    ACCESS,
}

/**
 * État de l'interface — un seul objet, créé par l'activité.
 *
 * Il consomme le socle (`TunnelStateBus`, `AppContainer`, `ApiClient`) sans le
 * modifier. Toutes les propriétés exposées sont des `StateFlow`, donc
 * `collectAsState()` est légitime partout.
 *
 * Aucune donnée sensible ne transite ici : ni URI, ni UUID, ni jeton. Les
 * erreurs réseau sont traduites en phrases, pas recopiées en JSON.
 */
class AppState(
    private val container: AppContainer,
    private val prefs: UiPrefs,
    private val scope: CoroutineScope,
    context: Context,
) {

    private val appContext: Context = context.applicationContext

    /* ------------------------------------------------------------- tunnel */

    val tunnel: StateFlow<TunnelState> = TunnelStateBus.state
    val tunnelDetail: StateFlow<String?> = TunnelStateBus.detail

    private val _control = MutableStateFlow<ControlState>(ControlState.Idle)
    val control: StateFlow<ControlState> = _control.asStateFlow()

    private val _availability = MutableStateFlow<Availability>(Availability.Ready)
    val availability: StateFlow<Availability> = _availability.asStateFlow()

    private val _sessionSeconds = MutableStateFlow(0L)
    val sessionSeconds: StateFlow<Long> = _sessionSeconds.asStateFlow()

    /** Intervalle avant renouvellement préventif, tel que le bundle le fixe (D25). */
    private val _cycleSeconds = MutableStateFlow(0L)
    val cycleSeconds: StateFlow<Long> = _cycleSeconds.asStateFlow()

    /* -------------------------------------------------------------- accès */

    private val _nodes = MutableStateFlow<List<NodeSummary>>(emptyList())
    val nodes: StateFlow<List<NodeSummary>> = _nodes.asStateFlow()

    /* ------------------------------------------------------------ compte */

    private val _account = MutableStateFlow<AccountState>(AccountState.Unknown)
    val account: StateFlow<AccountState> = _account.asStateFlow()

    private val _plans = MutableStateFlow<PlansState>(PlansState.Unknown)
    val plans: StateFlow<PlansState> = _plans.asStateFlow()

    private val _authError = MutableStateFlow<String?>(null)
    val authError: StateFlow<String?> = _authError.asStateFlow()

    private val _busy = MutableStateFlow<Busy?>(null)
    val busy: StateFlow<Busy?> = _busy.asStateFlow()

    private val _notice = MutableStateFlow<String?>(null)
    val notice: StateFlow<String?> = _notice.asStateFlow()

    /* ------------------------------------------------------- préférences */

    val appearance = MutableStateFlow(prefs.appearance)
    val reduceMotion = MutableStateFlow(prefs.reduceMotion)

    private var sessionStart: Long = 0L

    init {
        sessionStart = prefs.sessionStartedAt
        if (!TunnelStateBus.state.value.let { it == TunnelState.CONNECTED || it == TunnelState.RECONNECTING }) {
            sessionStart = 0L
            prefs.sessionStartedAt = 0L
        }

        // Les motifs bon marché sont connus sans entrée/sortie : on les applique
        // avant la première frame, pour que la commande ne s'affiche jamais
        // « prête » dans un build qui ne peut pas se connecter.
        _availability.value = cheapAvailability()

        scope.launch {
            // Un seul point de vérité : le bus du service. On n'invente aucun état.
            TunnelStateBus.state.collect { state -> onTunnelState(state) }
        }
        scope.launch {
            while (true) {
                delay(1_000L)
                val start = sessionStart
                _sessionSeconds.value =
                    if (start <= 0L) 0L else ((System.currentTimeMillis() - start) / 1_000L).coerceAtLeast(0L)
            }
        }

        refreshAvailability()
        refreshAccessSummary()
        refreshAccount(force = false)
    }

    /* ---------------------------------------------------------- actions UI */

    fun setAppearance(value: Appearance) {
        prefs.appearance = value
        appearance.value = value
    }

    fun setReduceMotion(value: Boolean) {
        prefs.reduceMotion = value
        reduceMotion.value = value
    }

    fun dismissNotice() {
        _notice.value = null
    }

    fun dismissAuthError() {
        _authError.value = null
    }

    /** Recalcule ce qui bloque la connexion et la liste des sorties. */
    fun refreshAll() {
        refreshAvailability()
        refreshAccessSummary()
        refreshAccount(force = false)
    }

    /* ------------------------------------------------------------ connexion */

    private fun onTunnelState(state: TunnelState) {
        _control.value = when (state) {
            TunnelState.STOPPED -> ControlState.Idle
            TunnelState.CONNECTING -> ControlState.Connecting
            TunnelState.CONNECTED -> ControlState.Connected
            TunnelState.RECONNECTING -> ControlState.Degraded
            // Ces trois états remplacent l'écran : la commande retombe au repos.
            TunnelState.NO_CONNECTION,
            TunnelState.SUBSCRIPTION_EXPIRED,
            TunnelState.DEVICE_REVOKED,
            -> ControlState.Idle
        }

        when (state) {
            TunnelState.CONNECTED, TunnelState.RECONNECTING -> ensureSessionStart()
            TunnelState.STOPPED,
            TunnelState.NO_CONNECTION,
            TunnelState.SUBSCRIPTION_EXPIRED,
            TunnelState.DEVICE_REVOKED,
            -> clearSessionStart()

            TunnelState.CONNECTING -> Unit
        }
    }

    private fun ensureSessionStart() {
        if (sessionStart > 0L) return
        sessionStart = System.currentTimeMillis()
        prefs.sessionStartedAt = sessionStart
        _sessionSeconds.value = 0L
    }

    private fun clearSessionStart() {
        sessionStart = 0L
        prefs.sessionStartedAt = 0L
        _sessionSeconds.value = 0L
    }

    /* ---------------------------------------------------------- disponibilité */

    /** Ce qui bloque sans toucher au stockage chiffré (marque, moteur, appareil). */
    private fun cheapAvailability(): Availability = when {
        !BrandTokens.isValid() -> Availability.Blocked(R.string.unavailable_reason_brand)
        !container.tunnelEngine.isAvailable() -> Availability.Blocked(R.string.unavailable_reason_engine)
        !DeviceKeys.supportsAgreement() -> Availability.Blocked(R.string.unavailable_reason_android)
        else -> Availability.Ready
    }

    fun refreshAvailability() {
        scope.launch {
            val cheap = cheapAvailability()
            val blocked = if (cheap is Availability.Blocked) {
                cheap
            } else {
                val payload = withContext(Dispatchers.IO) { container.vault.read() }
                if (payload == null || payload.configs.isEmpty()) {
                    Availability.Blocked(R.string.unavailable_reason_empty)
                } else {
                    Availability.Ready
                }
            }
            _availability.value = blocked
        }
    }

    fun refreshAccessSummary() {
        scope.launch {
            val payload = withContext(Dispatchers.IO) { container.vault.read() }
            val now = System.currentTimeMillis()
            val nodes = payload?.configs.orEmpty()
                .mapIndexedNotNull { index, config ->
                    val expiry = parseInstant(config.expiresAt) ?: return@mapIndexedNotNull null
                    if (expiry <= now) return@mapIndexedNotNull null
                    NodeSummary(
                        label = config.label.ifBlank { "Sortie ${index + 1}" },
                        region = config.region,
                        expiresAtMs = expiry,
                    )
                }
                .sortedBy { it.expiresAtMs }
            _nodes.value = nodes

            // Le bundle donne la durée de session ; la marge de 60 s et le
            // plancher de 120 s sont ceux de `TunnelPlan.reconnectAfterSeconds`
            // (D25). On prend le **minimum** des sorties utilisables, comme le
            // moteur : annoncer un renouvellement plus tardif serait un mensonge.
            val floor = payload?.configs.orEmpty()
                .filter { (parseInstant(it.expiresAt) ?: 0L) > now }
                .minOfOrNull { it.maxSessionSeconds.coerceAtLeast(120) }
            _cycleSeconds.value = if (floor == null) 0L
            else (floor.toLong() - 60L).coerceAtLeast(60L)
        }
    }

    /* --------------------------------------------------------------- compte */

    fun refreshAccount(force: Boolean = false) {
        if (!force && _account.value is AccountState.Ready) return
        scope.launch {
            val api = runCatching { container.api }.getOrNull()
            if (api == null) {
                _account.value = AccountState.Failed(res(R.string.notice_brand_invalid))
                return@launch
            }
            if (!withContext(Dispatchers.IO) { api.hasSession() }) {
                _account.value = AccountState.SignedOut
                return@launch
            }
            _account.value = AccountState.Loading
            _account.value = try {
                AccountState.Ready(withContext(Dispatchers.IO) { api.me() })
            } catch (error: Throwable) {
                if (error is ApiException && error.status == 401) {
                    AccountState.SignedOut
                } else {
                    AccountState.Failed(messageFor(error))
                }
            }
        }
    }

    /**
     * Connexion. L'enrôlement précède la session : le serveur exige une preuve
     * d'appareil sur `/v1/auth/login`, et cette preuve n'existe qu'après
     * `/v1/devices/enroll`.
     */
    fun signIn(email: String, password: String) {
        if (_busy.value != null) return
        _authError.value = null
        scope.launch {
            _busy.value = Busy.ACCOUNT
            try {
                withContext(Dispatchers.IO) {
                    val api = container.api
                    if (container.deviceAuth.deviceToken() == null) {
                        val name = Build.MODEL?.takeIf { it.isNotBlank() } ?: "Android"
                        api.enroll(deviceName = name, appVersion = BrandTokens.appVersion)
                    }
                    api.login(email.trim(), password)
                }
                _notice.value = res(R.string.notice_login_ok)
                refreshAccount(force = true)
                refreshAccessSummary()
            } catch (error: Throwable) {
                _authError.value = messageFor(error)
            } finally {
                _busy.value = null
            }
        }
    }

    fun signOut() {
        if (_busy.value != null) return
        scope.launch {
            _busy.value = Busy.ACCOUNT
            try {
                withContext(Dispatchers.IO) { runCatching { container.api.logout() } }
                _account.value = AccountState.SignedOut
                _plans.value = PlansState.SignedOut
                _notice.value = res(R.string.notice_logout_ok)
            } finally {
                _busy.value = null
            }
        }
    }

    fun activateCurrentDevice() {
        if (_busy.value != null) return
        scope.launch {
            _busy.value = Busy.ACCOUNT
            try {
                withContext(Dispatchers.IO) { container.api.activateCurrentDevice() }
                _notice.value = res(R.string.notice_activated)
                refreshAccount(force = true)
            } catch (error: Throwable) {
                _notice.value = messageFor(error)
            } finally {
                _busy.value = null
            }
        }
    }

    /* --------------------------------------------------------------- accès */

    /**
     * Tirage des accès. `If-None-Match` évite de retélécharger un contenu
     * identique ; un 304 n'est pas une erreur, c'est « rien n'a changé ».
     */
    fun refreshAccess() {
        if (_busy.value != null) return
        scope.launch {
            _busy.value = Busy.ACCESS
            try {
                val api = runCatching { container.api }.getOrNull()
                if (api == null) {
                    _notice.value = res(R.string.notice_brand_invalid)
                    return@launch
                }
                if (!withContext(Dispatchers.IO) { api.hasSession() }) {
                    _notice.value = res(R.string.notice_no_session)
                    return@launch
                }
                when (val fetch = withContext(Dispatchers.IO) { api.fetchBundle() }) {
                    is BundleFetch.NotModified -> _notice.value = res(R.string.notice_bundle_unchanged)
                    is BundleFetch.Fresh -> {
                        val saved = withContext(Dispatchers.IO) { container.vault.save(fetch.payload) }
                        if (saved) {
                            _notice.value = res(R.string.notice_bundle_updated)
                            refreshAccessSummary()
                            refreshAvailability()
                        } else {
                            _notice.value = res(R.string.notice_unknown)
                        }
                    }
                }
            } catch (error: Throwable) {
                _notice.value = messageFor(error)
            } finally {
                _busy.value = null
            }
        }
    }

    fun clearAccess() {
        scope.launch {
            withContext(Dispatchers.IO) { container.vault.clear() }
            _notice.value = res(R.string.notice_cleared)
            refreshAccessSummary()
            refreshAvailability()
        }
    }

    /* ------------------------------------------------------------- forfaits */

    fun refreshPlans(force: Boolean = false) {
        if (!force && (_plans.value is PlansState.Ready || _plans.value is PlansState.SignedOut)) return
        scope.launch {
            val api = runCatching { container.api }.getOrNull()
            if (api == null) {
                _plans.value = PlansState.Failed(res(R.string.notice_brand_invalid))
                return@launch
            }
            if (!withContext(Dispatchers.IO) { api.hasSession() }) {
                _plans.value = PlansState.SignedOut
                return@launch
            }
            _plans.value = PlansState.Loading
            _plans.value = try {
                PlansState.Ready(withContext(Dispatchers.IO) { api.subscription() })
            } catch (error: Throwable) {
                if (error is ApiException && error.status == 401) {
                    PlansState.SignedOut
                } else {
                    PlansState.Failed(messageFor(error))
                }
            }
        }
    }

    /* ------------------------------------------------------------- messages */

    private fun res(id: Int): String = appContext.getString(id)

    private fun messageFor(error: Throwable): String = when {
        error is ApiException && error.isNetwork -> res(R.string.notice_network)
        error is ApiException -> error.message.ifBlank { res(R.string.notice_unknown) }
        // BrandTokens.requireValid() lève IllegalStateException avec un message
        // technique : on ne l'affiche pas, on dit ce qui manque au build.
        error is IllegalStateException -> res(R.string.notice_brand_invalid)
        else -> res(R.string.notice_unknown)
    }
}
