package cm.bouendji.vpn.ui

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import cm.bouendji.vpn.AppContainer
import cm.bouendji.vpn.BuildConfig
import cm.bouendji.vpn.brand.BrandTokens
import cm.bouendji.vpn.config.SingBoxConfig
import cm.bouendji.vpn.net.ApiClient
import cm.bouendji.vpn.net.ApiCodes
import cm.bouendji.vpn.net.ApiException
import cm.bouendji.vpn.net.BundleFetch
import cm.bouendji.vpn.offline.ImportInbox
import cm.bouendji.vpn.offline.OfflineBundle
import cm.bouendji.vpn.ui.screens.minutesLabel
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
import kotlinx.coroutines.withTimeoutOrNull
import cm.bouendji.vpn.net.DeepLinkBus
import kotlinx.coroutines.sync.withPermit
import kotlinx.coroutines.withContext
import java.net.InetSocketAddress
import java.net.Socket

/** Les écrans du prototype lelexxl2a2 (`data-screen`), moins le code d'accès (D40). */
enum class Screen { SPLASH, ONBOARDING, AUTH, VPN_AUTH, HOME, SERVERS, PLANS, ORDER, ORDER_DONE, PROFILE, SETTINGS, SUBSCRIPTION, DEVICES, INVITE, HELP }

/** Racines de navigation. Solo (thème Ligne) n'a pas d'onglets : seul l'Accueil est une racine. */
val TABS: List<Screen> =
    if (BrandTokens.theme == BrandTokens.Theme.LIGNE) listOf(Screen.HOME)
    else listOf(Screen.HOME, Screen.SERVERS, Screen.PLANS, Screen.PROFILE)

/** Solo : un fil unique (Fil, compte, forfait, connexion), pas de barre d'onglets. */
val IS_LIGNE: Boolean get() = BrandTokens.theme == BrandTokens.Theme.LIGNE

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
        // Un onglet a vidé la pile. Sans compte, le seul retour utile est
        // l'écran de connexion : sinon le bouton « Retour » ne faisait rien
        // (forfaits ouverts depuis l'écran d'inscription = impasse).
        if (!signedIn && screen != Screen.AUTH && screen != Screen.ONBOARDING) {
            forward = false
            screen = Screen.AUTH
            return true
        }
        if (signedIn && screen != Screen.HOME) {
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
    /** Contacts d'exploitation de la marque, saisis dans le dashboard. */
    var support by mutableStateOf<ApiClient.SupportDto?>(null); private set
    /** Dernière version publiée, si elle est plus récente que l'APK installé. */
    var update by mutableStateOf<ApiClient.CatalogAppDto?>(null); private set
    var updateBusy by mutableStateOf(false); private set
    /** Message d'exploitation publié par l'administrateur. */
    var announcement by mutableStateOf<ApiClient.AnnouncementDto?>(null); private set
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

    /**
     * Ouvre le meilleur canal configuré par l'administrateur, avec un message
     * prérempli : marque, version, code d'appareil et motif. Si rien n'est
     * configuré, on le dit — on ne retombe jamais sur le `mailto:` de la
     * plateforme injecté au build.
     */
    fun openSupport(detail: String? = null) {
        val s = support
        val code = runCatching { container.deviceAuth.deviceId()?.take(8)?.uppercase() }.getOrNull()
        val message = buildString {
            append("Bonjour, je suis sur ").append(BrandTokens.appName).append(" v").append(BrandTokens.appVersion)
            if (!code.isNullOrBlank()) append(" · appareil ").append(code)
            if (!detail.isNullOrBlank()) append(" · ").append(detail)
        }
        val text = runCatching { java.net.URLEncoder.encode(message, "UTF-8") }.getOrDefault("")
        val url = s?.whatsapp?.takeIf { it.isNotBlank() }?.let { "https://wa.me/$it?text=$text" }
            ?: s?.whatsappUrl?.takeIf { it.isNotBlank() }?.let { if (it.contains('?')) "$it&text=$text" else "$it?text=$text" }
            ?: s?.call?.takeIf { it.isNotBlank() }
            ?: s?.email?.takeIf { it.isNotBlank() }?.let { "mailto:$it?body=$text" }
        if (url.isNullOrBlank()) {
            showToast("Aucun contact configuré par ton administrateur.")
            return
        }
        platform.openUrl(url)
    }

    /** Groupe ou canal de la communauté (distinct du support 1:1). */
    fun openCommunityGroup() {
        val url = support?.groupUrl?.takeIf { it.isNotBlank() }
            ?: BrandTokens.communityWhatsappUrl.takeIf { it.isNotBlank() }
        if (url.isNullOrBlank()) {
            showToast("Aucun groupe configuré.")
            return
        }
        platform.openUrl(url)
    }

    fun dismissUpdate() {
        update = null
    }

    /**
     * Télécharge l'APK publié, vérifie l'empreinte et la signature, puis ouvre
     * l'installateur Android. Un APK d'un autre signataire est refusé.
     */
    fun installUpdate() {
        val target = update ?: return
        if (updateBusy) return
        updateBusy = true
        scope.launch {
            val result = container.updateManager.downloadAndInstall(
                cm.bouendji.vpn.net.UpdateManager.Target(
                    versionCode = target.latestVersionCode,
                    versionName = target.latestVersionName,
                    url = target.updateUrl.orEmpty(),
                    sha256 = target.updateSha256,
                ),
            )
            updateBusy = false
            when (result) {
                is cm.bouendji.vpn.net.UpdateManager.Result.Started ->
                    showToast("Téléchargé. Confirme l'installation dans Android.")
                is cm.bouendji.vpn.net.UpdateManager.Result.Failed -> showToast(result.message)
            }
        }
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
                val cachedQuota = store.getString(KEY_CACHED_QUOTA)
                if (cachedQuota != null) {
                    runCatching {
                        container.api.json.decodeFromString(ApiClient.EntitlementDto.serializer(), cachedQuota)
                    }.getOrNull()?.let { quota = it }
                }
                val cachedSupport = store.getString(KEY_CACHED_SUPPORT)
                if (cachedSupport != null) {
                    runCatching {
                        container.api.json.decodeFromString(ApiClient.SupportDto.serializer(), cachedSupport)
                    }.getOrNull()?.let { support = it }
                }
                Pair(store.getString(KEY_ONBOARDED) == "1", runCatching { container.api.hasSession() }.getOrDefault(false) || me != null)
            }
            signedIn = restored.second
            // Réconciliation : un état « connecté » qui survit à la mort du
            // service est un mensonge. Le service vit dans ce processus ; s'il
            // n'est pas vivant, l'état retombe à STOPPED.
            if (TunnelStateBus.state.value != TunnelState.STOPPED && !VpnTunnelService.alive) {
                TunnelStateBus.publish(TunnelState.STOPPED, "Session précédente terminée.")
            }
            // Fichier de secours reçu avant ou pendant le lancement : traité dès qu'il arrive.
            scope.launch { ImportInbox.pending.collect { if (it != null) importOffline() } }
            // Retour de paiement (Fapshi). Le Channel garde l'événement même
            // s'il arrive avant ce collecteur (démarrage à froid).
            scope.launch { DeepLinkBus.paymentReturn.collect { orderId -> handlePaymentReturn(orderId) } }
            syncServersFromVault()
            // Le splash reste visible le temps d'une respiration, comme le prototype.
            refreshAll()
            delay(1_100)
            screen = when {
                !restored.first -> Screen.ONBOARDING
                !signedIn -> Screen.AUTH
                IS_LIGNE && !accessActive -> Screen.PLANS
                else -> Screen.HOME
            }
            if (screen == Screen.HOME && autoConnect && accessActive && hasConfiguration && !platform.needsVpnConsent() &&
                TunnelStateBus.state.value == TunnelState.STOPPED
            ) {
                platform.toggleTunnel()
            }
        }
    }

    fun finishOnboarding() {
        scope.launch(Dispatchers.IO) { store.putString(KEY_ONBOARDED, "1") }
        screen = when {
            !signedIn -> Screen.AUTH
            IS_LIGNE && !accessActive -> Screen.PLANS
            else -> Screen.HOME
        }
    }

    /**
     * Retour de paiement. Le deep link ne prouve rien : n'importe quelle
     * application peut l'émettre. On ne dit « activé » que si le serveur
     * confirme la commande, et on privilégie la commande en attente.
     */
    private suspend fun handlePaymentReturn(orderId: String?) {
        val target = orderId?.takeIf { it.isNotBlank() }
            ?: order?.orderId
            ?: store.getString(KEY_PENDING_ORDER)?.takeIf { it.isNotBlank() }
        if (target == null) {
            showToast("Retour de paiement reçu. Ouvre ton forfait pour vérifier.")
            refreshAll()
            return
        }
        val fresh = runCatching { withContext(Dispatchers.IO) { container.api.order(target, true) } }.getOrNull()
        if (fresh == null) {
            showToast("Paiement reçu, vérification impossible pour l'instant.")
            refreshAll()
            return
        }
        order = fresh
        when {
            fresh.activationStatus == "active" -> {
                withContext(Dispatchers.IO) { store.putString(KEY_PENDING_ORDER, "") }
                refreshAll(refreshOrder = true)
                showToast("Paiement vérifié : accès activé.")
                go(Screen.HOME)
            }
            fresh.status == "paid" -> {
                refreshAll(refreshOrder = true)
                showToast("Paiement reçu, activation en cours.")
                go(Screen.ORDER_DONE)
            }
            else -> {
                showToast("Paiement pas encore confirmé.")
                go(Screen.ORDER_DONE)
            }
        }
    }

    /** Reprend une commande laissée en attente (app tuée après le paiement). */
    private suspend fun resumePendingOrder() {
        val id = store.getString(KEY_PENDING_ORDER)?.takeIf { it.isNotBlank() } ?: return
        val fresh = runCatching { container.api.order(id, true) }.getOrNull() ?: return
        order = fresh
        when {
            fresh.activationStatus == "active" -> {
                store.putString(KEY_PENDING_ORDER, "")
                refreshPrivate()
            }
            fresh.status in setOf("failed", "expired", "cancelled") -> store.putString(KEY_PENDING_ORDER, "")
            else -> Unit
        }
    }

    fun refreshAll(refreshOrder: Boolean = false) {
        scope.launch {
            busy = true
            syncing = true
            try {
                // Budget large : cinq appels séquentiels sur un réseau mobile
                // camerounais ne tiennent pas en 4 s. Le splash ne l'attend
                // plus (boot() ne fait plus `join()`), donc allonger ici ne
                // bloque pas l'interface.
                withTimeoutOrNull(30_000L) {
                    runCatching {
                        withContext(Dispatchers.IO) {
                            syncPendingRegistration()
                            runCatching {
                                val catalog = container.api.plans(BrandTokens.appId)
                                val fetchedPlans = catalog.items
                                // Contacts saisis par l'administrateur : ils
                                // remplacent le mailto: injecté au build.
                                support = catalog.support
                                store.putString(
                                    KEY_CACHED_SUPPORT,
                                    container.api.json.encodeToString(ApiClient.SupportDto.serializer(), catalog.support),
                                )
                                val latest = catalog.app
                                if (latest.latestVersionCode > BuildConfig.VERSION_CODE && !latest.updateUrl.isNullOrBlank()) {
                                    val firstSeen = update?.latestVersionCode != latest.latestVersionCode
                                    update = latest
                                    if (firstSeen) container.updateManager.notifyAvailable(latest.latestVersionName)
                                } else {
                                    update = null
                                }
                                announcement = catalog.announcement
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
                            if (signedIn) {
                                refreshPrivate()
                                resumePendingOrder()
                            }
                            if (refreshOrder) order = order?.let { container.api.order(it.orderId, true) }
                            if (order?.activationStatus == "active") refreshPrivate()
                        }
                    }.onFailure { failure ->
                        // `runCatching` avale l'annulation : sans ce relais,
                        // un timeout ressemble à une panne réseau.
                        if (failure is kotlinx.coroutines.CancellationException) throw failure
                        if (failure is ApiException && failure.status == 401 && signedIn && store.getString(KEY_PENDING_REGISTRATION).isNullOrBlank()) {
                            signedIn = false
                            screen = Screen.AUTH
                        } else if (!(failure is ApiException && (failure.isDeviceRevoked || failure.needsSubscription))) {
                            error = friendly(failure)
                        }
                    }
                }
            } finally {
                busy = false
                syncing = false
            }
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

    private suspend fun refreshPrivate(): Boolean {
        var bundleOk = false
        val api = container.api
        reportConsumedBundles()
        val freshMe = runCatching { api.me() }.getOrNull()
        if (freshMe != null) {
            me = freshMe
            store.putString(KEY_CACHED_ME, container.api.json.encodeToString(ApiClient.MeResponse.serializer(), freshMe))
            // Fin des droits : le service s'en sert pour distinguer « abonnement
            // expiré » (à dire) de « nœuds expirés » (à rafraîchir), D67.
            store.putString(VpnTunnelService.PREF_RIGHTS_END, freshMe.entitlement.endsAt.orEmpty())
        }
        runCatching { devices = api.devices().items }
        val freshQuota = runCatching { api.subscription().entitlement }.getOrNull()
        if (freshQuota != null) {
            quota = freshQuota
            runCatching {
                store.putString(KEY_CACHED_QUOTA, container.api.json.encodeToString(ApiClient.EntitlementDto.serializer(), freshQuota))
            }
        }
        if (me?.entitlement?.active == true) {
            when (val bundle = runCatching { api.fetchBundle() }.getOrNull()) {
                is BundleFetch.Fresh -> {
                    val current = container.vault.read()
                    val usable = bundle.payload.configs.isNotEmpty()
                    val fresher = current == null || bundle.payload.revision >= current.revision
                    // L'ETag n'avance qu'après une écriture réussie : sinon un
                    // bundle vide ou un échec de coffre bloque le client en 304.
                    if (usable && fresher && container.vault.save(bundle.payload)) {
                        api.rememberBundleEtag(bundle.etag)
                        bundleOk = true
                    }
                }
                BundleFetch.NotModified -> bundleOk = true
                null -> Unit
            }
        }
        hasConfiguration = !container.vault.isEmpty()
        syncServersFromVault()
        return bundleOk
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
            form.password.isBlank() -> "Saisis un mot de passe."
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
                // Solo : lire l'entitlement frais avant de choisir l'écran, sinon un
                // compte déjà abonné passait par Forfaits (me encore nul à ce stade).
                if (IS_LIGNE) runCatching { withContext(Dispatchers.IO) { refreshPrivate() } }
                screen = when {
                    // Solo : le forfait se choisit avant l'accueil (spec design-solo §2.4).
                    IS_LIGNE && me?.entitlement?.active != true -> Screen.PLANS
                    platform.needsVpnConsent() -> Screen.VPN_AUTH
                    else -> Screen.HOME
                }
                refreshAll()
            }.onFailure { ex ->
                if (form.register && (ex is java.io.IOException || (ex is ApiException && ex.isNetwork))) {
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
                        entitlement = ApiClient.EntitlementDto(active = false),
                        device = ApiClient.DeviceDto(id = "offline-device", name = "Android Device", status = "active"),
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
                container.api.forgetBundleEtag()
                // Sans ces purges, un redémarrage après déconnexion réaffichait
                // le nom, le forfait, le quota et les appareils du compte
                // précédent (boot() déduit `signedIn` de `me != null`).
                store.remove(KEY_CACHED_ME)
                store.remove(KEY_CACHED_QUOTA)
                store.remove(KEY_PENDING_REGISTRATION)
                store.remove(KEY_PENDING_ORDER)
                store.remove(VpnTunnelService.PREF_RIGHTS_END)
            }
            signedIn = false; me = null; devices = emptyList(); stats = null; referral = null; order = null
            quota = null
            hasConfiguration = false
            ServerBus.setServers(emptyList())
            ServerBus.setNotice(null)
            stack.clear()
            screen = Screen.AUTH
            busy = false
        }
    }

    /* ------------------------------------------------------------- commande */

    fun startOrder() {
        if (busy) return
        val plan = selectedPlan ?: return
        if (!signedIn) { go(Screen.AUTH); return }
        scope.launch {
            busy = true; error = null
            // Une plage n'est envoyée que si ce forfait la propose (sinon 400 côté serveur).
            val window = nightWindow?.takeIf { w -> plan.nightOptions.any { it.window == w } }
            val choice = customChoice(plan)
            val created = runCatching { withContext(Dispatchers.IO) { container.api.createOrder(plan.id, plan.revision, window, choice) } }
                .onFailure { error = friendly(it) }
                .getOrNull()
            if (created == null) {
                busy = false
                return@launch
            }
            // Persistée avant l'ouverture du navigateur : si le processus meurt
            // pendant le paiement, la commande reste vérifiable au redémarrage.
            withContext(Dispatchers.IO) { store.putString(KEY_PENDING_ORDER, created.orderId) }
            order = created
            go(Screen.ORDER_DONE)
            created.checkout?.url?.let(platform::openUrl)
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
                            withContext(Dispatchers.IO) { store.putString(KEY_PENDING_ORDER, "") }
                            withContext(Dispatchers.IO) { runCatching { refreshPrivate() } }
                            showToast("Accès activé.")
                        }
                        fresh.status == "paid" -> showToast("Paiement reçu, activation en cours.")
                        fresh.status == "failed" -> {
                            withContext(Dispatchers.IO) { store.putString(KEY_PENDING_ORDER, "") }
                            error = "Le paiement a échoué. Tu peux réessayer."
                        }
                        fresh.status == "expired" -> {
                            withContext(Dispatchers.IO) { store.putString(KEY_PENDING_ORDER, "") }
                            error = "Le lien de paiement a expiré. Recommence la commande."
                        }
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

    /* ------------------------------------------------------- coupon (104) */

    /** Saisie du code, écran Forfaits. Jamais persistée. */
    var couponCode by mutableStateOf("")
    var couponBusy by mutableStateOf(false); private set
    var couponError by mutableStateOf<String?>(null); private set
    var couponDone by mutableStateOf<String?>(null); private set

    fun redeemCoupon() {
        if (couponBusy) return
        if (!signedIn) { go(Screen.AUTH); return }
        val code = couponCode.trim()
        if (code.isEmpty()) { couponError = "Saisis le code reçu."; couponDone = null; return }
        scope.launch {
            couponBusy = true; couponError = null; couponDone = null
            runCatching { withContext(Dispatchers.IO) { container.api.redeemCoupon(code) } }
                .onSuccess { redeemed ->
                    couponCode = ""
                    couponDone = "Coupon validé : ${redeemed.coupon.label}, ${minutesLabel(redeemed.coupon.durationMinutes)} d'accès illimité."
                    // Droits et configuration relus par le chemin habituel (bundle compris).
                    withContext(Dispatchers.IO) { runCatching { refreshPrivate() } }
                    showToast("Coupon validé.")
                }
                .onFailure { couponError = couponMessage(it) }
            couponBusy = false
        }
    }

    /** Raisons renvoyées par `POST /v1/me/coupons/redeem` (`details.reason`). */
    fun couponMessage(error: Throwable): String {
        if (error !is ApiException) return friendly(error)
        return when (error.details["reason"]) {
            "COUPON_INVALID" -> "Code invalide. Vérifie la saisie."
            "COUPON_USED" -> "Ce code a déjà été utilisé."
            "COUPON_EXPIRED" -> "Ce code a expiré. Demande un nouveau coupon."
            "COUPON_REVOKED" -> "Ce code a été annulé."
            "COUPON_DEVICE_USED" -> "Cet appareil a déjà utilisé un coupon."
            "COUPON_ACTIVE" -> "Un coupon est déjà actif sur ton compte. Réessaie quand il sera terminé."
            "PAID_PLAN_ACTIVE" -> "Tu as déjà un forfait actif ou prévu : le coupon n'est utilisable qu'une fois ton forfait terminé."
            else -> when {
                error.status == 429 -> "Trop d'essais. Réessaie dans quelques minutes."
                error.code == ApiCodes.VALIDATION_FAILED -> "Code invalide. Vérifie la saisie."
                else -> friendly(error)
            }
        }
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
            val updated = runCatching { withContext(Dispatchers.IO) { refreshPrivate() } }
                .onFailure { error = friendly(it) }
                .getOrDefault(false)
            showToast(if (updated) "Liste des serveurs mise à jour." else "Liste inchangée : vérifie ta connexion.")
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
            try {
                val nodes = withContext(Dispatchers.IO) { container.vault.read()?.let { SingBoxConfig.nodesOf(it) }.orEmpty() }
                if (nodes.isEmpty()) {
                    showToast(if (accessActive) "Aucun serveur reçu pour l'instant." else "Active un forfait pour recevoir les serveurs.")
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
            } finally {
                directTesting = false
                // Une annulation (rotation, sortie d'écran) laissait des lignes
                // en TESTING pour toujours : le bouton « Tester » restait
                // désactivé jusqu'au redémarrage du processus.
                ServerBus.servers.value
                    .filter { it.probe == ProbeState.TESTING }
                    .forEach { stale -> ServerBus.update(stale.configId) { it.copy(probe = ProbeState.UNKNOWN) } }
            }
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
        const val KEY_CACHED_QUOTA = "cache.quota"
        const val KEY_CACHED_SUPPORT = "cache.support"
        const val KEY_PENDING_REGISTRATION = "offline.pending_reg"
        const val KEY_PENDING_ORDER = "order.pending"
    }
}
