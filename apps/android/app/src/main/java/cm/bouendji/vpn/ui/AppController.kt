package cm.bouendji.vpn.ui

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import cm.bouendji.vpn.AppContainer
import cm.bouendji.vpn.brand.BrandTokens
import cm.bouendji.vpn.config.SingBoxConfig
import cm.bouendji.vpn.net.ApiClient
import cm.bouendji.vpn.net.ApiException
import cm.bouendji.vpn.net.BundleFetch
import cm.bouendji.vpn.offline.ImportInbox
import cm.bouendji.vpn.offline.OfflineBundle
import cm.bouendji.vpn.vpn.ProbeMethod
import cm.bouendji.vpn.vpn.ProbeState
import cm.bouendji.vpn.vpn.ServerBus
import cm.bouendji.vpn.vpn.ServerStatus
import cm.bouendji.vpn.vpn.TunnelState
import cm.bouendji.vpn.vpn.TunnelStateBus
import cm.bouendji.vpn.vpn.VpnTunnelService
import kotlinx.serialization.Serializable
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit
import kotlinx.coroutines.withContext
import java.net.InetSocketAddress
import java.net.Socket

/** Les écrans du prototype lelexxl2a2 (`data-screen`), moins le code d'accès (D40). */
enum class Screen { SPLASH, ONBOARDING, AUTH, VPN_AUTH, HOME, SERVERS, PLANS, ORDER, ORDER_DONE, PROFILE, SETTINGS, SUBSCRIPTION, DEVICES, INVITE, HELP }

val TABS = listOf(Screen.HOME, Screen.SERVERS, Screen.PLANS, Screen.PROFILE)

enum class Appearance(val label: String) { AUTO("Système"), LIGHT("Clair"), DARK("Sombre") }

/** Ce que l'interface demande au système (consentement, navigateur, partage…). */
interface Platform {
    fun needsVpnConsent(): Boolean
    fun toggleTunnel()
    fun openUrl(url: String)
    fun openVpnSettings()
    fun requestNotifications()
    fun share(text: String)
    fun copy(label: String, text: String)
    /** Sélecteur de fichiers Android, pour un fichier de secours `.bvpn`. */
    fun pickOfflineFile()
}

/** Formulaire d'inscription du prototype : pays, nom, prénoms, WhatsApp, plus e-mail et mot de passe. */
@Serializable
data class AuthForm(
    val register: Boolean = true,
    val countryIndex: Int = 0,
    val fullName: String = "",
    val phone: String = "",
    val password: String = "",
    val referral: String = "",
    val lastName: String = "",
    val firstNames: String = "",
    val email: String = "",
) {
    val effectiveName: String get() = fullName.ifBlank { "$firstNames $lastName".trim() }
}

/** Pays proposés à l'inscription (prototype `COUNTRIES`), indicatif compris. */
val COUNTRIES = listOf(
    "Cameroun" to "237", "Côte d'Ivoire" to "225", "Sénégal" to "221", "Gabon" to "241", "Congo" to "242",
    "RD Congo" to "243", "Tchad" to "235", "Centrafrique" to "236", "Guinée équatoriale" to "240", "Bénin" to "229",
    "Togo" to "228", "Burkina Faso" to "226", "Mali" to "223", "Niger" to "227", "Guinée" to "224",
    "Nigeria" to "234", "France" to "33", "Belgique" to "32", "Suisse" to "41", "Canada" to "1", "États-Unis" to "1",
)

class AppController(
    private val container: AppContainer,
    private val scope: CoroutineScope,
    val platform: Platform,
) {
    private val store = container.secureStore

    /* ------------------------------------------------------------ navigation */

    var screen by mutableStateOf(Screen.SPLASH)
        private set
    private val stack = mutableStateListOf<Screen>()
    var forward by mutableStateOf(true)
        private set

    fun go(next: Screen) {
        if (next == screen) return
        forward = true
        if (next in TABS) stack.clear() else stack.add(screen)
        screen = next
        onEnter(next)
    }

    /** `true` si l'écran a été dépilé ; `false` = laisser Android fermer l'app. */
    fun back(): Boolean {
        if (sheet != null) { sheet = null; return true }
        val previous = stack.removeLastOrNull()
        if (previous != null) {
            forward = false
            screen = previous
            return true
        }
        if (screen != Screen.HOME && signedIn) {
            forward = false
            screen = Screen.HOME
            return true
        }
        return false
    }

    private fun onEnter(target: Screen) {
        when (target) {
            Screen.PROFILE -> if (signedIn) loadStats()
            Screen.INVITE -> loadReferral()
            Screen.SERVERS -> refreshServers()
            Screen.PLANS -> if (plans.isEmpty()) loadPlans()
            else -> Unit
        }
    }

    /* ---------------------------------------------------------------- état */

    var signedIn by mutableStateOf(false); private set
    var me by mutableStateOf<ApiClient.MeResponse?>(null); private set
    var devices by mutableStateOf<List<ApiClient.DeviceDto>>(emptyList()); private set
    var stats by mutableStateOf<ApiClient.StatsDto?>(null); private set
    var referral by mutableStateOf<ApiClient.ReferralDto?>(null); private set
    var plans by mutableStateOf<List<ApiClient.PlanDto>>(emptyList()); private set
    var selectedPlanId by mutableStateOf<String?>(null)
    var order by mutableStateOf<ApiClient.OrderDto?>(null); private set
    /** Droits avec quota (consommé, restant, état) : `GET /v1/me/subscription`. */
    var quota by mutableStateOf<ApiClient.EntitlementDto?>(null); private set
    var hasConfiguration by mutableStateOf(false); private set

    var busy by mutableStateOf(false); private set
    var syncing by mutableStateOf(false); private set
    var error by mutableStateOf<String?>(null)
    var toast by mutableStateOf<String?>(null); private set
    var authForm by mutableStateOf(AuthForm())

    /** Feuille ouverte : sélecteur d'apparence, pays, renouvellement… */
    var sheet by mutableStateOf<String?>(null)

    /** Résultat du dernier import de fichier de secours, montré dans la feuille « import ». */
    var importMessage by mutableStateOf<String?>(null); private set
    var importOk by mutableStateOf(false); private set

    var appearance by mutableStateOf(Appearance.AUTO); private set
    var reduceMotion by mutableStateOf(false); private set
    var autoConnect by mutableStateOf(false); private set
    var dnsProtection by mutableStateOf(true); private set
    var favorites by mutableStateOf<Set<String>>(emptySet()); private set
    var preferredServer by mutableStateOf(ServerBus.AUTO); private set
    var directTesting by mutableStateOf(false); private set

    val selectedPlan: ApiClient.PlanDto? get() = plans.firstOrNull { it.id == selectedPlanId } ?: plans.firstOrNull()

    /* D127 : choix de l'offre sur mesure (curseurs) et plage de nuit facultative. */
    var customGb by mutableStateOf(0)
    var customDays by mutableStateOf(0)
    var nightWindow by mutableStateOf<String?>(null)

    /** Choix sur mesure ramené dans les bornes de l'offre (0 = pas encore réglé). */
    fun customChoice(plan: ApiClient.PlanDto): ApiClient.CustomChoiceDto? {
        val terms = plan.custom ?: return null
        val gb = customGb.coerceIn(terms.minGb, terms.maxGb)
        val steps = (gb - terms.minGb) / terms.stepGb
        return ApiClient.CustomChoiceDto(gb = terms.minGb + steps * terms.stepGb, days = customDays.coerceIn(terms.minDays, terms.maxDays))
    }

    /** Montant affiché avant la commande ; le serveur refait le calcul et fait foi. */
    fun estimateXaf(plan: ApiClient.PlanDto): Int {
        if (plan.isUnlimited) return plan.priceXaf
        val night = plan.nightOptions.firstOrNull { it.window == nightWindow }?.priceXaf ?: 0
        val choice = customChoice(plan)
        val base = if (choice != null) plan.custom!!.priceXaf(choice.gb, choice.days) else plan.priceXaf
        return base + night
    }

    /** Accès actif = forfait payé et en cours ; sinon l'interrupteur mène aux forfaits. */
    val accessActive: Boolean get() = me?.entitlement?.active == true
    val deviceRevoked: Boolean get() = me?.device?.status == "revoked"

    fun showToast(message: String) {
        toast = message
        scope.launch {
            delay(2_400)
            if (toast == message) toast = null
        }
    }

    fun friendly(error: Throwable): String = when (error) {
        is ApiException -> error.details.values.firstOrNull() ?: error.message
        is IllegalStateException -> "Cette version n'est pas encore reliée au service."
        else -> "Connexion au service impossible. Vérifie ton réseau et réessaie."
    }

    /* ------------------------------------------------------------- démarrage */

    fun boot() {
        scope.launch {
            val restored = withContext(Dispatchers.IO) {
                appearance = runCatching { Appearance.valueOf(store.getString(KEY_APPEARANCE) ?: "AUTO") }.getOrDefault(Appearance.AUTO)
                reduceMotion = store.getString(KEY_REDUCE_MOTION) == "1"
                autoConnect = store.getString(KEY_AUTO_CONNECT) == "1"
                dnsProtection = store.getString(VpnTunnelService.PREF_DNS_PROTECTION) != "0"
                favorites = store.getString(KEY_FAVORITES).orEmpty().split(',').filter { it.isNotBlank() }.toSet()
                preferredServer = store.getString(VpnTunnelService.PREF_SERVER) ?: ServerBus.AUTO
                val cachedMe = store.getString(KEY_CACHED_ME)
                if (cachedMe != null) {
                    runCatching {
                        container.api.json.decodeFromString(ApiClient.MeResponse.serializer(), cachedMe)
                    }.getOrNull()?.let { me = it }
                }
                val cachedPlans = store.getString(KEY_CACHED_PLANS)
                if (cachedPlans != null) {
                    runCatching {
                        container.api.json.decodeFromString(
                            kotlinx.serialization.builtins.ListSerializer(ApiClient.PlanDto.serializer()),
                            cachedPlans
                        )
                    }.getOrNull()?.let { plans = it }
                }
                Pair(store.getString(KEY_ONBOARDED) == "1", runCatching { container.api.hasSession() }.getOrDefault(false) || me != null)
            }
            signedIn = restored.second
            // Fichier de secours reçu avant ou pendant le lancement : traité dès qu'il arrive.
            scope.launch { ImportInbox.pending.collect { if (it != null) importOffline() } }
            syncServersFromVault()
            // Le splash reste visible le temps d'une respiration, comme le prototype.
            val refresh = scope.launch { refreshAll() }
            delay(1_100)
            screen = when {
                !restored.first -> Screen.ONBOARDING
                !signedIn -> Screen.AUTH
                else -> Screen.HOME
            }
            refresh.join()
            if (screen == Screen.HOME && autoConnect && accessActive && hasConfiguration && !platform.needsVpnConsent() &&
                TunnelStateBus.state.value == TunnelState.STOPPED
            ) {
                platform.toggleTunnel()
            }
        }
    }

    fun finishOnboarding() {
        scope.launch(Dispatchers.IO) { store.putString(KEY_ONBOARDED, "1") }
        screen = if (signedIn) Screen.HOME else Screen.AUTH
    }

    fun refreshAll(refreshOrder: Boolean = false) {
        scope.launch {
            busy = true
            syncing = true
            runCatching {
                withContext(Dispatchers.IO) {
                    syncPendingRegistration()
                    runCatching {
                        val fetchedPlans = container.api.plans(BrandTokens.appId).items
                        if (fetchedPlans.isNotEmpty()) {
                            plans = fetchedPlans
                            store.putString(
                                KEY_CACHED_PLANS,
                                container.api.json.encodeToString(
                                    kotlinx.serialization.builtins.ListSerializer(ApiClient.PlanDto.serializer()),
                                    fetchedPlans
                                )
                            )
                        }
                    }
                    if (selectedPlanId == null) selectedPlanId = plans.firstOrNull { it.featured }?.id ?: plans.firstOrNull()?.id
                    if (signedIn) refreshPrivate()
                    if (refreshOrder) order = order?.let { container.api.order(it.orderId, true) }
                    if (order?.activationStatus == "active") refreshPrivate()
                }
            }.onFailure { failure ->
                if (failure is ApiException && failure.status == 401 && signedIn && store.getString(KEY_PENDING_REGISTRATION) == null) {
                    signedIn = false
                    screen = Screen.AUTH
                } else if (!(failure is ApiException && (failure.isDeviceRevoked || failure.needsSubscription))) {
                    error = friendly(failure)
                }
            }
            busy = false
            syncing = false
        }
    }

    private suspend fun syncPendingRegistration() {
        val pendingJson = store.getString(KEY_PENDING_REGISTRATION)?.takeIf { it.isNotBlank() } ?: return
        val form = runCatching {
            container.api.json.decodeFromString(AuthForm.serializer(), pendingJson)
        }.getOrNull() ?: return
        val (_, dial) = COUNTRIES[form.countryIndex.coerceIn(COUNTRIES.indices)]
        val phone = "+$dial" + form.phone.filter(Char::isDigit).trimStart('0')
        val api = container.api
        if (container.deviceAuth.deviceToken() == null) api.enroll(android.os.Build.MODEL, BrandTokens.appVersion)
        api.register(
            appId = BrandTokens.appId,
            password = form.password,
            name = form.effectiveName,
            phone = phone,
            locale = BrandTokens.defaultLocale,
            referralCode = form.referral,
        )
        store.putString(KEY_PENDING_REGISTRATION, "")
        showToast("Compte synchronisé avec succès !")
    }

    private suspend fun refreshPrivate() {
        val api = container.api
        reportConsumedBundles()
        val freshMe = runCatching { api.me() }.getOrNull()
        if (freshMe != null) {
            me = freshMe
            store.putString(KEY_CACHED_ME, container.api.json.encodeToString(ApiClient.MeResponse.serializer(), freshMe))
        }
        runCatching { devices = api.devices().items }
        quota = runCatching { api.subscription().entitlement }.getOrNull()
        if (me?.entitlement?.active == true) {
            when (val bundle = runCatching { api.fetchBundle() }.getOrNull()) {
                is BundleFetch.Fresh -> {
                    if (bundle.payload.configs.isNotEmpty()) container.vault.save(bundle.payload)
                }
                BundleFetch.NotModified -> Unit
                null -> Unit
            }
        }
        hasConfiguration = !container.vault.isEmpty()
        syncServersFromVault()
    }

    private fun loadPlans() = scope.launch {
        runCatching { withContext(Dispatchers.IO) { container.api.plans(BrandTokens.appId).items } }
            .onSuccess { plans = it; if (selectedPlanId == null) selectedPlanId = it.firstOrNull { p -> p.featured }?.id ?: it.firstOrNull()?.id }
    }

    private fun loadStats() = scope.launch {
        runCatching { withContext(Dispatchers.IO) { container.api.stats() } }.onSuccess { stats = it }
        runCatching { withContext(Dispatchers.IO) { container.api.me() } }.onSuccess { me = it }
    }

    private fun loadReferral() = scope.launch {
        runCatching { withContext(Dispatchers.IO) { container.api.referral() } }
            .onSuccess { referral = it }
            .onFailure { error = friendly(it) }
    }

    /* ---------------------------------------------------------- authentification */

    fun authenticate() {
        val form = authForm
        val (_, dial) = COUNTRIES[form.countryIndex.coerceIn(COUNTRIES.indices)]
        val name = form.effectiveName
        val phone = "+$dial" + form.phone.filter(Char::isDigit).trimStart('0')

        error = when {
            form.register && name.isBlank() -> "Indique ton nom."
            form.phone.filter(Char::isDigit).length < 6 -> "Numéro de téléphone incomplet."
            form.password.length < 8 -> "Huit caractères minimum pour le mot de passe."
            else -> null
        }
        if (error != null) return

        scope.launch {
            busy = true
            syncing = true
            runCatching {
                withContext(Dispatchers.IO) {
                    val api = container.api
                    if (container.deviceAuth.deviceToken() == null) {
                        api.enroll(android.os.Build.MODEL, BrandTokens.appVersion)
                    }
                    if (form.register) {
                        api.register(
                            appId = BrandTokens.appId,
                            password = form.password,
                            name = name,
                            phone = phone,
                            locale = BrandTokens.defaultLocale,
                            referralCode = form.referral,
                        )
                    } else {
                        api.login(BrandTokens.appId, phone, form.password)
                    }
                }
            }.onSuccess {
                signedIn = true
                if (form.register) sheet = "welcome"
                authForm = authForm.copy(password = "")
                stack.clear()
                screen = if (platform.needsVpnConsent()) Screen.VPN_AUTH else Screen.HOME
                refreshAll()
            }.onFailure { ex ->
                if (form.register && (ex is java.io.IOException || ex !is ApiException)) {
                    val offlineUser = ApiClient.UserDto(
                        id = "local-" + java.util.UUID.randomUUID().toString().take(8),
                        email = "${phone.filter(Char::isDigit)}@${BrandTokens.appId}.bouendji.internal",
                        name = name,
                        phone = phone,
                        locale = BrandTokens.defaultLocale,
                    )
                    val offlineMe = ApiClient.MeResponse(
                        user = offlineUser,
                        community = ApiClient.CommunityDto(id = "offline", name = BrandTokens.appName, slug = BrandTokens.appName.lowercase()),
                        entitlement = ApiClient.EntitlementDto(active = false, state = "none", expiresAt = null, endpointTier = "free-labs"),
                        roles = emptyList(),
                    )
                    me = offlineMe
                    signedIn = true
                    scope.launch(Dispatchers.IO) {
                        store.putString(KEY_CACHED_ME, container.api.json.encodeToString(ApiClient.MeResponse.serializer(), offlineMe))
                        store.putString(KEY_PENDING_REGISTRATION, container.api.json.encodeToString(AuthForm.serializer(), form))
                    }
                    authForm = authForm.copy(password = "")
                    stack.clear()
                    screen = Screen.HOME
                    showToast("Compte créé en local. Synchronisation automatique dès connexion.")
                } else {
                    error = friendly(ex)
                }
            }
            busy = false
            syncing = false
        }
    }

    fun logout() {
        scope.launch {
            busy = true
            if (TunnelStateBus.state.value != TunnelState.STOPPED) platform.toggleTunnel()
            withContext(Dispatchers.IO) {
                runCatching { container.api.logout() }
                container.vault.clear()
            }
            signedIn = false; me = null; devices = emptyList(); stats = null; referral = null; order = null
            hasConfiguration = false
            ServerBus.setServers(emptyList())
            stack.clear()
            screen = Screen.AUTH
            busy = false
        }
    }

    /* ------------------------------------------------------------- commande */

    fun startOrder() {
        val plan = selectedPlan ?: return
        if (!signedIn) { go(Screen.AUTH); return }
        scope.launch {
            busy = true; error = null
            // Une plage n'est envoyée que si ce forfait la propose (sinon 400 côté serveur).
            val window = nightWindow?.takeIf { w -> plan.nightOptions.any { it.window == w } }
            val choice = customChoice(plan)
            runCatching { withContext(Dispatchers.IO) { container.api.createOrder(plan.id, plan.revision, window, choice) } }
                .onSuccess { created ->
                    order = created
                    go(Screen.ORDER_DONE)
                    created.checkout?.url?.let(platform::openUrl)
                }
                .onFailure { error = friendly(it) }
            busy = false
        }
    }

    fun checkOrder() {
        val current = order ?: return
        scope.launch {
            busy = true; error = null
            runCatching { withContext(Dispatchers.IO) { container.api.order(current.orderId, true) } }
                .onSuccess { fresh ->
                    order = fresh
                    when {
                        fresh.activationStatus == "active" -> {
                            withContext(Dispatchers.IO) { runCatching { refreshPrivate() } }
                            showToast("Accès activé.")
                        }
                        fresh.status == "paid" -> showToast("Paiement reçu, activation en cours.")
                        fresh.status == "failed" -> error = "Le paiement a échoué. Tu peux réessayer."
                        fresh.status == "expired" -> error = "Le lien de paiement a expiré. Recommence la commande."
                        else -> showToast("Paiement pas encore confirmé.")
                    }
                }
                .onFailure { error = friendly(it) }
            busy = false
        }
    }

    fun reopenCheckout() {
        order?.checkout?.url?.let(platform::openUrl)
    }

    /* ------------------------------------------------------------- appareils */

    fun revoke(device: ApiClient.DeviceDto) {
        scope.launch {
            busy = true
            runCatching { withContext(Dispatchers.IO) { container.api.revokeDevice(device.id); devices = container.api.devices().items } }
                .onSuccess { showToast("Appareil retiré.") }
                .onFailure { error = friendly(it) }
            busy = false
        }
    }

    /* -------------------------------------------------------------- serveurs */

    /** Hors tunnel, la liste vient du coffre : mêmes tags que le moteur (`nodesOf`). */
    fun syncServersFromVault() {
        if (TunnelStateBus.state.value != TunnelState.STOPPED && ServerBus.servers.value.isNotEmpty()) return
        scope.launch {
            val nodes = withContext(Dispatchers.IO) {
                container.vault.read()?.let { SingBoxConfig.nodesOf(it) }.orEmpty()
            }
            ServerBus.setServers(nodes.map { ServerStatus(it.configId, it.tag, it.label, it.region, startsAt = it.startsAt, endpointTier = it.endpointTier) })
        }
    }

    /**
     * Tire la liste à jour depuis le serveur (bundle), puis l'affiche. Sans
     * compte actif, on se contente du coffre local.
     */
    fun refreshServers() {
        if (!signedIn) { syncServersFromVault(); return }
        scope.launch {
            busy = true; error = null
            runCatching { withContext(Dispatchers.IO) { refreshPrivate() } }
                .onSuccess { showToast("Liste des serveurs mise à jour.") }
                .onFailure { error = friendly(it) }
            busy = false
        }
    }

    /** D18 : le choix est une préférence ; le service bascule s'il ne répond plus. */
    fun selectServer(configId: String) {
        preferredServer = configId
        scope.launch(Dispatchers.IO) { store.putString(VpnTunnelService.PREF_SERVER, configId) }
        if (TunnelStateBus.state.value != TunnelState.STOPPED) platform.let { selectInService(configId) }
        val name = ServerBus.servers.value.firstOrNull { it.configId == configId }?.label
        showToast(if (configId == ServerBus.AUTO) "Choix automatique du serveur le plus rapide." else "Serveur choisi : ${name ?: "—"}")
    }

    var selectInService: (String) -> Unit = {}
    var probeInService: () -> Unit = {}

    /**
     * Tunnel actif : mesure HTTP **à travers** chaque sortie (service). Tunnel
     * coupé : temps d'établissement TCP direct vers chaque nœud — indiqué comme
     * tel, ce n'est pas la même mesure.
     */
    fun testLatency() {
        if (TunnelStateBus.state.value == TunnelState.CONNECTED || TunnelStateBus.state.value == TunnelState.NO_CONNECTION) {
            probeInService()
            return
        }
        if (directTesting) return
        scope.launch {
            directTesting = true
            val nodes = withContext(Dispatchers.IO) { container.vault.read()?.let { SingBoxConfig.nodesOf(it) }.orEmpty() }
            if (nodes.isEmpty()) {
                showToast(if (accessActive) "Aucun serveur reçu pour l'instant." else "Active un forfait pour recevoir les serveurs.")
                directTesting = false
                return@launch
            }
            withContext(Dispatchers.IO) {
                coroutineScope {
                    val gate = Semaphore(4)
                    nodes.map { node ->
                        async {
                            gate.withPermit {
                                ServerBus.update(node.configId) { it.copy(probe = ProbeState.TESTING) }
                                val ms = tcpConnectMs(node.host, node.port)
                                ServerBus.update(node.configId) {
                                    it.copy(latencyMs = ms, probe = if (ms != null) ProbeState.OK else ProbeState.FAILED, method = ProbeMethod.DIRECT)
                                }
                            }
                        }
                    }.awaitAll()
                }
            }
            directTesting = false
        }
    }

    private fun tcpConnectMs(host: String, port: Int): Int? = runCatching {
        Socket().use { socket ->
            val start = System.nanoTime()
            socket.connect(InetSocketAddress(host, port), 4_000)
            ((System.nanoTime() - start) / 1_000_000).toInt()
        }
    }.getOrNull()

    fun toggleFavorite(configId: String) {
        favorites = if (configId in favorites) favorites - configId else favorites + configId
        val snapshot = favorites.joinToString(",")
        scope.launch(Dispatchers.IO) { store.putString(KEY_FAVORITES, snapshot) }
    }

    /* -------------------------------------------------------------- réglages */

    fun updateAppearance(value: Appearance) {
        appearance = value
        scope.launch(Dispatchers.IO) { store.putString(KEY_APPEARANCE, value.name) }
    }

    fun updateReduceMotion(value: Boolean) {
        reduceMotion = value
        scope.launch(Dispatchers.IO) { store.putString(KEY_REDUCE_MOTION, if (value) "1" else "0") }
    }

    fun updateAutoConnect(value: Boolean) {
        autoConnect = value
        scope.launch(Dispatchers.IO) { store.putString(KEY_AUTO_CONNECT, if (value) "1" else "0") }
    }

    /** Pris en compte à la prochaine connexion : la configuration du moteur est figée pendant une session. */
    fun updateDnsProtection(value: Boolean) {
        dnsProtection = value
        scope.launch(Dispatchers.IO) { store.putString(VpnTunnelService.PREF_DNS_PROTECTION, if (value) "1" else "0") }
        if (TunnelStateBus.state.value != TunnelState.STOPPED) showToast("Appliqué à la prochaine connexion.")
    }

    /* ------------------------------------------------- fichier de secours */

    /**
     * Import d'un `.bvpn` (offline-bundle) : vérifié, déchiffré et écrit par
     * [cm.bouendji.vpn.offline.OfflineBundle] ; ici seulement le résultat, dit
     * clairement, et le signalement de consommation au serveur.
     */
    fun importOffline() {
        val bytes = ImportInbox.take() ?: return
        scope.launch {
            val result = withContext(Dispatchers.IO) { container.offlineBundle.import(bytes) }
            when (result) {
                is OfflineBundle.Import.Accepted -> {
                    importOk = true
                    val count = result.payload.configs.size
                    importMessage = "$count serveur${if (count > 1) "s" else ""} ajouté${if (count > 1) "s" else ""}. Tu peux te connecter."
                    hasConfiguration = true
                    withContext(Dispatchers.IO) {
                        val queued = store.getString(KEY_CONSUMED_TO_REPORT).orEmpty().split(',').filter { it.isNotBlank() }
                        store.putString(KEY_CONSUMED_TO_REPORT, (queued + result.bundleId).distinct().takeLast(16).joinToString(","))
                    }
                    ServerBus.setServers(emptyList())
                    syncServersFromVault()
                    scope.launch(Dispatchers.IO) { runCatching { reportConsumedBundles() } }
                }
                is OfflineBundle.Import.Refused -> {
                    importOk = false
                    importMessage = result.message
                }
            }
            sheet = "import"
        }
    }

    /** Signale les fichiers importés hors ligne ; ce qui échoue reste en file. */
    private suspend fun reportConsumedBundles() {
        val queued = store.getString(KEY_CONSUMED_TO_REPORT).orEmpty().split(',').filter { it.isNotBlank() }
        if (queued.isEmpty()) return
        val left = queued.filter { id -> runCatching { container.api.markOfflineConsumed(id) }.isFailure }
        store.putString(KEY_CONSUMED_TO_REPORT, left.joinToString(","))
    }

    private companion object {
        const val KEY_CONSUMED_TO_REPORT = "offline.toReport"
        const val KEY_APPEARANCE = "ui.appearance"
        const val KEY_REDUCE_MOTION = "ui.reduceMotion"
        const val KEY_AUTO_CONNECT = "ui.autoConnect"
        const val KEY_FAVORITES = "ui.favorites"
        const val KEY_ONBOARDED = "ui.onboarded"
        const val KEY_CACHED_ME = "cache.me"
        const val KEY_CACHED_PLANS = "cache.plans"
        const val KEY_PENDING_REGISTRATION = "offline.pending_reg"
    }
}
