package cm.bouendji.vpn.ui

import android.os.Build
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import cm.bouendji.vpn.AppContainer
import cm.bouendji.vpn.brand.BrandTokens
import cm.bouendji.vpn.net.ApiClient
import cm.bouendji.vpn.net.ApiCodes
import cm.bouendji.vpn.net.ApiException
import cm.bouendji.vpn.offline.OfflineBundle
import cm.bouendji.vpn.sync.BundleSync
import cm.bouendji.vpn.util.IsoTime
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/** Préférence d'apparence, gardée sur l'appareil. */
enum class Appearance { AUTO, LIGHT, DARK }

/** Ce que l'accueil doit dire quand le tunnel n'est pas en cause. */
enum class AccessIssue { NONE, NO_PLAN, EXPIRED, DEVICE_INACTIVE, REVOKED }

/**
 * État de l'interface et actions, à durée de vie du processus (il survit à une
 * rotation, il est porté par [AppContainer] via [cm.bouendji.vpn.VpnApplication]).
 *
 * Toutes les écritures réseau suivent la même règle que le dashboard : on
 * désactive, on appelle, on relit, puis on annonce — aucune mise à jour
 * optimiste de l'argent, des appareils ou des droits.
 */
class AppModel(private val container: AppContainer) {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private val store get() = container.secureStore

    var ready by mutableStateOf(false); private set
    var signedIn by mutableStateOf(false); private set
    var account by mutableStateOf<ApiClient.MeResponse?>(null); private set
    var devices by mutableStateOf<List<ApiClient.DeviceDto>>(emptyList()); private set
    var plans by mutableStateOf<List<ApiClient.PlanDto>>(emptyList()); private set
    var plansLoaded by mutableStateOf(false); private set
    var order by mutableStateOf<ApiClient.OrderDto?>(null); private set
    var usableConfigs by mutableStateOf(0); private set
    var issue by mutableStateOf(AccessIssue.NONE); private set
    /** D61 : le serveur n'a servi aucune configuration ; la liste locale est gardée. */
    var serverEmpty by mutableStateOf(false); private set
    var offline by mutableStateOf(false); private set
    var lastRefreshMs by mutableStateOf(0L); private set

    var busy by mutableStateOf(false); private set
    var authError by mutableStateOf<String?>(null); private set
    var fieldErrors by mutableStateOf<Map<String, String>>(emptyMap()); private set
    var notice by mutableStateOf<String?>(null)
    var planError by mutableStateOf<String?>(null); private set

    var appearance by mutableStateOf(Appearance.AUTO); private set
    var reduceMotion by mutableStateOf(false); private set

    private var pollJob: Job? = null

    /* ------------------------------------------------------------- démarrage */

    fun start() {
        if (ready) return
        scope.launch {
            withContext(Dispatchers.IO) {
                appearance = store.getString("ui.appearance")?.let { runCatching { Appearance.valueOf(it) }.getOrNull() } ?: Appearance.AUTO
                reduceMotion = store.getString("ui.reduceMotion") == "1"
                signedIn = runCatching { container.api.hasSession() }.getOrDefault(false)
                usableConfigs = container.vault.usableCount()
            }
            ready = true
            refresh()
        }
    }

    /* ------------------------------------------------------------ préférences */

    fun setAppearance(value: Appearance) {
        appearance = value
        scope.launch(Dispatchers.IO) { store.putString("ui.appearance", value.name) }
    }

    fun setReduceMotion(value: Boolean) {
        reduceMotion = value
        scope.launch(Dispatchers.IO) { store.putString("ui.reduceMotion", if (value) "1" else "0") }
    }

    /* --------------------------------------------------------------- lecture */

    /** Catalogue, compte, appareils, bundle. Appelé au démarrage et au retour dans l'app. */
    fun refresh(reconcileOrder: Boolean = false) {
        scope.launch {
            busy = true
            try {
                withContext(Dispatchers.IO) { loadAll(reconcileOrder) }
                offline = false
            } catch (error: Throwable) {
                handleGlobal(error)
            } finally {
                busy = false
                lastRefreshMs = System.currentTimeMillis()
            }
        }
    }

    private suspend fun loadAll(reconcileOrder: Boolean) {
        val api = container.api
        runCatching { plans = api.plans(BrandTokens.appId).items; plansLoaded = true }
            .onFailure { if (it is ApiException && !it.isNetwork) planError = it.message else throw it }
        if (!signedIn) return

        val me = api.me()
        account = me
        container.access.remember(me.entitlement.active, IsoTime.parseMs(me.entitlement.endsAt))
        devices = runCatching { api.devices().items }.getOrDefault(devices)

        if (order == null || reconcileOrder) {
            val latest = runCatching { api.orders(1).items.firstOrNull() }.getOrNull()
            order = when {
                order != null && reconcileOrder -> runCatching { api.order(order!!.orderId, refresh = true) }.getOrDefault(order)
                latest != null && (latest.status == "created" || latest.status == "pending" || latest.activationStatus == "pending") ->
                    if (reconcileOrder) runCatching { api.order(latest.orderId, refresh = true) }.getOrDefault(latest) else latest
                else -> null
            }
        }

        issue = when {
            me.device.status == "revoked" -> AccessIssue.REVOKED
            // Des droits ont existé sur cet appareil : ils ont pris fin.
            !me.entitlement.active && container.access.rightsEndsAtMs() != null -> AccessIssue.EXPIRED
            !me.entitlement.active -> AccessIssue.NO_PLAN
            // Quota atteint à la connexion : l'appareil reste `enrolled` (auth.ts:521).
            me.device.status != "active" -> AccessIssue.DEVICE_INACTIVE
            else -> AccessIssue.NONE
        }

        if (me.entitlement.active && me.device.status == "active") syncBundle()
        container.flushPending()
        if (order?.activationStatus == "active") order = null
    }

    private suspend fun syncBundle() {
        when (val outcome = container.bundleSync.sync()) {
            is BundleSync.Outcome.Updated -> serverEmpty = false
            BundleSync.Outcome.NotModified -> serverEmpty = false
            is BundleSync.Outcome.EmptyKeptLocal -> serverEmpty = true
            BundleSync.Outcome.RightsEnded -> issue = AccessIssue.EXPIRED
            BundleSync.Outcome.Revoked -> issue = AccessIssue.REVOKED
            is BundleSync.Outcome.Failed -> if (outcome.error !is ApiException) offline = true
        }
        usableConfigs = container.vault.usableCount()
    }

    private fun handleGlobal(error: Throwable) {
        when {
            error is ApiException && error.isDeviceRevoked -> issue = AccessIssue.REVOKED
            error is ApiException && error.code == ApiCodes.UNAUTHENTICATED -> {
                signedIn = false
                account = null
            }
            error is ApiException && error.isNetwork -> offline = true
            error is IllegalStateException -> notice = "Cette version n'est pas reliée à un service. Installez la version fournie par votre fournisseur."
            else -> notice = friendly(error)
        }
    }

    /* ------------------------------------------------------------ compte */

    fun authenticate(register: Boolean, name: String, email: String, phone: String, password: String, onDone: () -> Unit) {
        scope.launch {
            busy = true
            authError = null
            fieldErrors = emptyMap()
            try {
                withContext(Dispatchers.IO) {
                    val api = container.api
                    if (container.deviceAuth.deviceToken() == null || !container.deviceKeys.hasIdentity()) {
                        api.enroll(deviceName(), BrandTokens.appVersion)
                    }
                    if (register) {
                        api.register(BrandTokens.appId, email.trim(), password, name.trim(), phone.trim(), BrandTokens.defaultLocale)
                    } else {
                        api.login(email.trim(), password)
                    }
                }
                signedIn = true
                onDone()
                refresh()
            } catch (error: Throwable) {
                if (error is ApiException && error.code == ApiCodes.VALIDATION_FAILED && error.details.isNotEmpty()) {
                    fieldErrors = error.details
                    authError = "Vérifiez les champs indiqués."
                } else {
                    authError = when {
                        error is ApiException && error.code == ApiCodes.INVALID_CREDENTIALS -> "Adresse e-mail ou mot de passe incorrect."
                        error is ApiException && error.code == ApiCodes.RATE_LIMITED ->
                            "Trop de tentatives. Réessayez dans ${error.retryAfterSeconds ?: 60} secondes."
                        else -> friendly(error)
                    }
                }
            } finally {
                busy = false
            }
        }
    }

    fun logout() {
        scope.launch {
            busy = true
            withContext(Dispatchers.IO) {
                runCatching { container.api.logout() }
                container.forgetAccount()
            }
            signedIn = false
            account = null
            devices = emptyList()
            order = null
            usableConfigs = 0
            issue = AccessIssue.NONE
            busy = false
        }
    }

    fun revokeDevice(device: ApiClient.DeviceDto) = write("Appareil révoqué.") {
        container.api.revokeDevice(device.id)
        devices = container.api.devices().items
    }

    fun activateThisDevice() = write("Cet appareil est maintenant actif.") {
        container.api.activateCurrentDevice()
        loadAll(false)
    }

    /** Appareil révoqué : nouvelle identité, puis reconnexion par l'utilisateur. */
    fun resetDevice() {
        scope.launch {
            withContext(Dispatchers.IO) { container.resetDevice() }
            signedIn = false
            account = null
            devices = emptyList()
            issue = AccessIssue.NONE
            usableConfigs = 0
            notice = "Cet appareil a été réinitialisé. Reconnectez-vous pour le réenregistrer."
        }
    }

    /* ------------------------------------------------------------ achat */

    fun choosePlan(plan: ApiClient.PlanDto, openCheckout: (String) -> Unit) {
        scope.launch {
            busy = true
            planError = null
            try {
                val created = withContext(Dispatchers.IO) { container.api.createOrder(plan.id, plan.revision) }
                order = created
                created.checkout?.url?.let(openCheckout)
                startPolling()
            } catch (error: Throwable) {
                planError = if (error is ApiException && error.code == ApiCodes.CONFLICT) {
                    // Prix ou durée modifiés entre l'affichage et la commande.
                    runCatching { withContext(Dispatchers.IO) { plans = container.api.plans(BrandTokens.appId).items } }
                    "Ce forfait vient d'être modifié. Vérifiez le nouveau prix puis réessayez."
                } else {
                    friendly(error)
                }
            } finally {
                busy = false
            }
        }
    }

    /** Retour du navigateur de paiement : réconciliation explicite (`?refresh=1`). */
    fun checkOrder() {
        val current = order ?: return
        scope.launch {
            busy = true
            try {
                val updated = withContext(Dispatchers.IO) { container.api.order(current.orderId, refresh = true) }
                order = updated
                if (updated.activationStatus == "active") {
                    notice = "Paiement confirmé. Votre accès est actif."
                    withContext(Dispatchers.IO) { loadAll(false) }
                } else if (updated.status == "pending" || updated.status == "created") {
                    startPolling()
                }
            } catch (error: Throwable) {
                planError = friendly(error)
            } finally {
                busy = false
            }
        }
    }

    fun dismissOrder() {
        pollJob?.cancel()
        order = null
    }

    /** Suivi sans appel fournisseur, au rythme demandé par le serveur (`pollAfterSeconds`). */
    private fun startPolling() {
        pollJob?.cancel()
        pollJob = scope.launch {
            repeat(40) {
                val current = order ?: return@launch
                if (current.status !in setOf("created", "pending") && current.activationStatus != "pending") return@launch
                delay(current.pollAfterSeconds.coerceIn(5, 60) * 1_000L)
                val updated = runCatching { withContext(Dispatchers.IO) { container.api.order(current.orderId) } }.getOrNull() ?: return@repeat
                order = updated
                if (updated.activationStatus == "active") {
                    notice = "Paiement confirmé. Votre accès est actif."
                    runCatching { withContext(Dispatchers.IO) { loadAll(false) } }
                    return@launch
                }
            }
        }
    }

    /* --------------------------------------------------------- hors-ligne */

    fun importOffline(bytes: ByteArray?) {
        if (bytes == null) {
            notice = "Impossible de lire ce fichier."
            return
        }
        scope.launch {
            busy = true
            val result = withContext(Dispatchers.IO) { container.offlineBundle.import(bytes) }
            notice = when (result) {
                is OfflineBundle.Import.Accepted -> {
                    usableConfigs = container.vault.usableCount()
                    withContext(Dispatchers.IO) { container.flushPending() }
                    "Fichier importé : ${result.payload.configs.size} accès disponible(s)."
                }
                is OfflineBundle.Import.Refused -> result.message
            }
            busy = false
        }
    }

    fun clearAccessData() {
        scope.launch {
            withContext(Dispatchers.IO) { container.vault.clear() }
            usableConfigs = 0
            notice = "Les accès enregistrés sur cet appareil ont été effacés."
        }
    }

    /* ------------------------------------------------------------- outils */

    private fun write(success: String, block: suspend () -> Unit) {
        scope.launch {
            busy = true
            try {
                withContext(Dispatchers.IO) { block() }
                notice = success
            } catch (error: Throwable) {
                notice = friendly(error)
            } finally {
                busy = false
            }
        }
    }

    fun keyProtection(): String = when (container.deviceKeys.agreementMode()) {
        cm.bouendji.vpn.crypto.DeviceKeys.AgreementMode.KEYSTORE -> "Keystore matériel"
        cm.bouendji.vpn.crypto.DeviceKeys.AgreementMode.WRAPPED -> "Chiffrée par le Keystore"
        null -> "Pas encore créée"
    }

    private fun deviceName(): String {
        val model = listOf(Build.MANUFACTURER, Build.MODEL).filter { !it.isNullOrBlank() }.distinct().joinToString(" ")
        return model.ifBlank { "Android" }.take(64).padEnd(2, ' ')
    }

    companion object {
        fun friendly(error: Throwable): String = when {
            error is ApiException && error.isNetwork -> "Le service est injoignable. Vérifiez votre connexion puis réessayez."
            error is ApiException && error.status >= 500 -> "Le service rencontre un problème. Réessayez dans un instant."
            error is ApiException -> error.message
            else -> "Une erreur inattendue s'est produite. Réessayez."
        }
    }
}
