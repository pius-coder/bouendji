package cm.bouendji.vpn.ui

import android.os.Build
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import cm.bouendji.vpn.AppContainer
import cm.bouendji.vpn.brand.BrandTokens
import cm.bouendji.vpn.net.ApiClient
import cm.bouendji.vpn.net.ApiException
import cm.bouendji.vpn.net.BundleFetch
import cm.bouendji.vpn.ui.theme.Identity
import cm.bouendji.vpn.ui.theme.identityFor
import cm.bouendji.vpn.vpn.TunnelState
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.text.NumberFormat
import java.util.Locale

private enum class Destination { HOME, PLANS, ACCOUNT, SETTINGS, HELP }
private enum class Appearance { AUTO, LIGHT, DARK }
private enum class Blocked { NONE, OFFLINE, EXPIRED, REVOKED }

/** Parcours mobile complet de l'identite Halo v2. */
@Composable
fun VpnApp(
    container: AppContainer,
    tunnelState: TunnelState,
    tunnelDetail: String?,
    engineAvailable: Boolean,
    initialHasConfiguration: Boolean,
    systemDark: Boolean,
    onTunnelToggle: () -> Unit,
    onOpenSupport: () -> Unit,
    onOpenUrl: (String) -> Unit,
    onOpenVpnSettings: () -> Unit,
    onRequestNotifications: () -> Unit,
    onSystemBars: (Boolean) -> Unit,
) {
    val store = container.secureStore
    var destinationName by rememberSaveable { mutableStateOf(Destination.HOME.name) }
    val destination = runCatching { Destination.valueOf(destinationName) }.getOrDefault(Destination.HOME)
    var appearanceName by rememberSaveable { mutableStateOf(Appearance.DARK.name) }
    val appearance = runCatching { Appearance.valueOf(appearanceName) }.getOrDefault(Appearance.AUTO)
    val dark = when (appearance) { Appearance.AUTO -> systemDark; Appearance.LIGHT -> false; Appearance.DARK -> true }
    val identity = remember(dark) { identityFor(BrandTokens.theme, dark) }
    var reduceMotion by rememberSaveable { mutableStateOf(false) }

    var signedIn by remember { mutableStateOf(false) }
    var account by remember { mutableStateOf<ApiClient.MeResponse?>(null) }
    var devices by remember { mutableStateOf<List<ApiClient.DeviceDto>>(emptyList()) }
    var plans by remember { mutableStateOf<List<ApiClient.PlanDto>>(emptyList()) }
    var order by remember { mutableStateOf<ApiClient.OrderDto?>(null) }
    var hasConfiguration by remember { mutableStateOf(initialHasConfiguration) }
    var busy by remember { mutableStateOf(false) }
    var message by remember { mutableStateOf<String?>(null) }
    var blocked by remember { mutableStateOf(Blocked.NONE) }
    val scope = rememberCoroutineScope()

    fun navigate(next: Destination) { destinationName = next.name }
    fun friendly(error: Throwable): String = when (error) {
        is ApiException -> error.message
        is IllegalStateException -> "Cette version n’est pas encore reliée au service. Installez une version configurée."
        else -> "Impossible de charger les données. Vérifiez votre connexion et réessayez."
    }
    suspend fun refreshPrivate() {
        val api = container.api
        val me = api.me()
        account = me
        devices = api.devices().items
        blocked = when {
            me.device.status == "revoked" -> Blocked.REVOKED
            !me.entitlement.active -> Blocked.EXPIRED
            else -> Blocked.NONE
        }
        if (me.entitlement.active) {
            when (val bundle = api.fetchBundle()) {
                is BundleFetch.Fresh -> {
                    container.vault.save(bundle.payload)
                    hasConfiguration = bundle.payload.configs.isNotEmpty()
                }
                BundleFetch.NotModified -> hasConfiguration = !container.vault.isEmpty()
            }
        }
    }
    fun refreshAll(refreshOrder: Boolean = false) {
        scope.launch {
            busy = true; message = null
            runCatching {
                withContext(Dispatchers.IO) {
                    plans = container.api.plans(BrandTokens.appId).items
                    if (signedIn) refreshPrivate()
                    if (refreshOrder) order = order?.let { container.api.order(it.orderId, true) }
                    if (order?.activationStatus == "active") refreshPrivate()
                }
            }.onFailure { error ->
                if (error is ApiException && error.isDeviceRevoked) blocked = Blocked.REVOKED
                else if (error is ApiException && error.needsSubscription) blocked = Blocked.EXPIRED
                else message = friendly(error)
            }
            busy = false
        }
    }

    LaunchedEffect(dark) { onSystemBars(dark) }
    LaunchedEffect(Unit) {
        val restored = withContext(Dispatchers.IO) {
            Triple(
                store.getString("ui.appearance") ?: Appearance.DARK.name,
                store.getString("ui.reduceMotion") == "1",
                runCatching { container.api.hasSession() }.getOrDefault(false),
            )
        }
        appearanceName = restored.first
        reduceMotion = restored.second
        signedIn = restored.third
        refreshAll()
    }
    LaunchedEffect(tunnelState) {
        blocked = when (tunnelState) {
            TunnelState.NO_CONNECTION -> Blocked.OFFLINE
            TunnelState.SUBSCRIPTION_EXPIRED -> Blocked.EXPIRED
            TunnelState.DEVICE_REVOKED -> Blocked.REVOKED
            else -> blocked.takeIf { it != Blocked.OFFLINE } ?: Blocked.NONE
        }
    }

    MaterialTheme {
        Box(Modifier.fillMaxSize().background(identity.palette.canvas)) {
            IdentityBackdrop(identity, Modifier.fillMaxSize())

            if (blocked != Blocked.NONE) {
                BlockedScreen(
                    identity = identity,
                    blocked = blocked,
                    onPlans = { blocked = Blocked.NONE; navigate(Destination.PLANS) },
                    onRetry = { blocked = Blocked.NONE; refreshAll(true) },
                    onSupport = onOpenSupport,
                )
            } else {
                Column(Modifier.fillMaxSize()) {
                    HaloTopBar(
                        identity = identity,
                        destination = destination,
                        onBack = { navigate(Destination.HOME) },
                        onDestination = ::navigate,
                        onNotifications = onRequestNotifications,
                    )
                    Box(Modifier.weight(1f)) {
                        when (destination) {
                            Destination.HOME -> HomePage(
                                identity, tunnelState, tunnelDetail, engineAvailable,
                                hasConfiguration, account, reduceMotion, onTunnelToggle,
                                onPlans = { navigate(Destination.PLANS) },
                            )
                            Destination.PLANS -> PlansPage(
                                identity, plans, signedIn, order, busy, message,
                                onAccount = { navigate(Destination.ACCOUNT) },
                                onChoose = { plan ->
                                    scope.launch {
                                        busy = true; message = null
                                        runCatching { withContext(Dispatchers.IO) { container.api.createOrder(plan.id, plan.revision) } }
                                            .onSuccess { created -> order = created; created.checkout?.url?.let(onOpenUrl) }
                                            .onFailure { message = friendly(it) }
                                        busy = false
                                    }
                                },
                                onOpen = { order?.checkout?.url?.let(onOpenUrl) },
                                onRefresh = { refreshAll(true) },
                            )
                            Destination.ACCOUNT -> AccountPage(
                                identity, signedIn, account, devices, busy, message,
                                onAuthenticate = { register, name, email, password ->
                                    scope.launch {
                                        busy = true; message = null
                                        runCatching {
                                            withContext(Dispatchers.IO) {
                                                val api = container.api
                                                if (container.deviceAuth.deviceToken() == null) {
                                                    api.enroll(Build.MODEL, BrandTokens.appVersion)
                                                }
                                                if (register) api.register(BrandTokens.appId, email.trim(), password, name.trim(), BrandTokens.defaultLocale)
                                                else api.login(email.trim(), password)
                                                signedIn = true
                                                refreshPrivate()
                                            }
                                        }.onFailure { message = friendly(it) }
                                        busy = false
                                    }
                                },
                                onLogout = {
                                    scope.launch {
                                        busy = true
                                        withContext(Dispatchers.IO) { runCatching { container.api.logout() }; container.vault.clear() }
                                        signedIn = false; account = null; devices = emptyList(); hasConfiguration = false; busy = false
                                    }
                                },
                                onRevoke = { device ->
                                    scope.launch {
                                        busy = true; message = null
                                        runCatching { withContext(Dispatchers.IO) { container.api.revokeDevice(device.id); devices = container.api.devices().items } }
                                            .onFailure { message = friendly(it) }
                                        busy = false
                                    }
                                },
                            )
                            Destination.SETTINGS -> SettingsPage(
                                identity, appearance, reduceMotion, container.tunnelEngine.name, engineAvailable,
                                onAppearance = {
                                    appearanceName = it.name
                                    scope.launch(Dispatchers.IO) { store.putString("ui.appearance", it.name) }
                                },
                                onReduceMotion = {
                                    reduceMotion = it
                                    scope.launch(Dispatchers.IO) { store.putString("ui.reduceMotion", if (it) "1" else "0") }
                                },
                                onNotifications = onRequestNotifications,
                                onVpnSettings = onOpenVpnSettings,
                                onClear = {
                                    scope.launch(Dispatchers.IO) { container.vault.clear() }
                                    hasConfiguration = false
                                    message = "Les données d’accès de cet appareil ont été effacées."
                                },
                            )
                            Destination.HELP -> HelpPage(identity, onOpenSupport)
                        }
                        if (busy) CircularProgressIndicator(
                            color = identity.palette.accent,
                            modifier = Modifier.align(Alignment.TopCenter).padding(top = 8.dp).size(24.dp),
                        )
                    }
                    if (destination in listOf(Destination.HOME, Destination.PLANS, Destination.ACCOUNT)) {
                        HaloBottomBar(identity, destination, ::navigate)
                    }
                }
            }
        }
    }
}

@Composable
private fun HaloTopBar(
    identity: Identity,
    destination: Destination,
    onBack: () -> Unit,
    onDestination: (Destination) -> Unit,
    onNotifications: () -> Unit,
) {
    Row(
        Modifier.fillMaxWidth().statusBarsPadding().height(52.dp).padding(horizontal = 18.dp, vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        if (destination == Destination.HOME) HaloAvatar(identity) { onDestination(Destination.ACCOUNT) }
        else RoundIcon(identity, Glyph.BACK, "Retour", onClick = onBack)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            RoundIcon(identity, Glyph.SUPPORT, "Assistance") { onDestination(Destination.HELP) }
            RoundIcon(identity, Glyph.BELL, "Notifications", badge = true, onClick = onNotifications)
            RoundIcon(identity, Glyph.SLIDERS, "Réglages") { onDestination(Destination.SETTINGS) }
        }
    }
}

@Composable
private fun HaloAvatar(identity: Identity, onClick: () -> Unit) {
    Box(
        Modifier.size(44.dp).clip(CircleShape)
            .background(Brush.linearGradient(listOf(Color(0xFF1C2F52), Color(0xFF0E1A2E))))
            .border(1.dp, Color.White.copy(alpha = .14f), CircleShape).clickable(onClick = onClick)
            .semantics { contentDescription = "Profil"; role = Role.Button },
        contentAlignment = Alignment.Center,
    ) { Text("H", color = Color(0xFF9CC8FF), fontSize = 15.sp, fontWeight = FontWeight.SemiBold) }
}

@Composable
private fun RoundIcon(identity: Identity, glyph: Glyph, label: String, badge: Boolean = false, onClick: () -> Unit) {
    Box(
        Modifier.size(44.dp).clip(CircleShape)
            .background(Brush.verticalGradient(listOf(Color(0xB81C263A), Color(0x8C0E1420))))
            .border(1.dp, Color.White.copy(alpha = .14f), CircleShape).clickable(onClick = onClick)
            .semantics { contentDescription = label; role = Role.Button },
        contentAlignment = Alignment.Center,
    ) {
        GlyphIcon(glyph, Color(0xFFDBE7FF), Modifier.size(21.dp))
        if (badge) Box(
            Modifier.align(Alignment.TopEnd).padding(top = 9.dp, end = 9.dp).size(8.dp)
                .background(Color(0xFFFF375F), CircleShape).border(2.dp, Color.White, CircleShape),
        )
    }
}

@Composable
private fun HaloBottomBar(identity: Identity, current: Destination, onDestination: (Destination) -> Unit) {
    Row(
        Modifier.fillMaxWidth().navigationBarsPadding().padding(horizontal = 16.dp, vertical = 8.dp)
            .height(62.dp).clip(RoundedCornerShape(23.dp)).background(Color(0xB8121A2A))
            .border(1.dp, Color.White.copy(alpha = .12f), RoundedCornerShape(23.dp)).padding(5.dp),
    ) {
        NavItem(identity, Glyph.SHIELD, "Connexion", current == Destination.HOME, Modifier.weight(1f)) { onDestination(Destination.HOME) }
        NavItem(identity, Glyph.CARD, "Abonnement", current == Destination.PLANS, Modifier.weight(1f)) { onDestination(Destination.PLANS) }
        NavItem(identity, Glyph.USER, "Compte", current == Destination.ACCOUNT, Modifier.weight(1f)) { onDestination(Destination.ACCOUNT) }
    }
}

@Composable
private fun NavItem(identity: Identity, glyph: Glyph, label: String, selected: Boolean, modifier: Modifier, onClick: () -> Unit) {
    Column(
        modifier.fillMaxSize().clip(RoundedCornerShape(18.dp))
            .background(if (selected) Color(0x330A7CFF) else Color.Transparent)
            .clickable(onClick = onClick).semantics { role = Role.Tab; stateDescription = if (selected) "Sélectionné" else "Non sélectionné" },
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        GlyphIcon(glyph, if (selected) identity.palette.accent else identity.palette.inkSoft, Modifier.size(20.dp))
        Text(label, color = if (selected) Color(0xFF8FC0FF) else Color(0xFF8D9BB3), fontSize = 9.5.sp, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
private fun Page(identity: Identity, title: String, eyebrow: String, content: @Composable ColumnScope.() -> Unit) {
    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 20.dp, vertical = 10.dp),
    ) {
        Text(eyebrow.uppercase(), color = Color(0xFF7F8FA8), fontSize = 9.sp, letterSpacing = 1.8.sp, fontWeight = FontWeight.Bold)
        Spacer(Modifier.height(10.dp))
        Text(title, style = identity.type.title.copy(fontSize = 27.sp, lineHeight = 30.sp), color = identity.palette.ink)
        Spacer(Modifier.height(18.dp))
        content()
        Spacer(Modifier.height(28.dp))
    }
}

@Composable
private fun HomePage(
    identity: Identity, state: TunnelState, detail: String?, engineAvailable: Boolean,
    hasConfiguration: Boolean, account: ApiClient.MeResponse?, reduceMotion: Boolean,
    onToggle: () -> Unit, onPlans: () -> Unit,
) {
    val connected = state == TunnelState.CONNECTED
    val elapsed = elapsedSeconds(state)
    val headline = when (state) {
        TunnelState.CONNECTED -> "Vous êtes connecté."
        TunnelState.CONNECTING -> "Connexion en cours."
        TunnelState.RECONNECTING -> "On vous reconnecte."
        else -> when {
            !engineAvailable -> "Connexion indisponible."
            !hasConfiguration -> "Accès requis."
            else -> "Prêt à vous protéger."
        }
    }
    val subtitle = when (state) {
        TunnelState.CONNECTED -> "Le tunnel VPN est actif."
        TunnelState.CONNECTING -> "Préparation du tunnel sécurisé…"
        TunnelState.RECONNECTING -> "Test des accès… on garde le premier disponible."
        else -> when {
            !engineAvailable -> "Le moteur VPN n’est pas disponible sur cet appareil."
            !hasConfiguration -> "Connectez-vous et activez un forfait pour recevoir votre accès."
            else -> "Appuyez pour ouvrir le tunnel."
        }
    }
    Column(
        Modifier.fillMaxSize().padding(horizontal = 20.dp, vertical = 10.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        StatusChip(identity, connected, state)
        Spacer(Modifier.height(14.dp))
        Text(headline, style = identity.type.title.copy(fontSize = 27.sp, lineHeight = 30.sp), color = identity.palette.ink, textAlign = TextAlign.Center)
        Spacer(Modifier.height(7.dp))
        Text(subtitle, style = identity.type.subtitle.copy(fontSize = 12.5.sp, lineHeight = 18.sp), color = identity.palette.inkSoft, textAlign = TextAlign.Center)
        Spacer(Modifier.height(16.dp))
        PowerOrb(identity, state, elapsed, reduceMotion, engineAvailable && hasConfiguration, onToggle)
        Spacer(Modifier.height(9.dp))
        Text(if (connected) "Appuyer pour déconnecter" else if (hasConfiguration) "Appuyer pour connecter" else "Voir l’abonnement",
            color = Color(0xFF7A8699), fontSize = 11.sp, fontWeight = FontWeight.Medium,
            modifier = Modifier.clickable(enabled = !hasConfiguration, onClick = onPlans))
        Spacer(Modifier.height(14.dp))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            HaloStat(identity, "LATENCE", "—", Modifier.weight(1f))
            HaloStat(identity, "SERVEUR", "Auto", Modifier.weight(1f))
            HaloStat(identity, "APPAREILS", account?.let { "${it.devicesUsed} / ${it.devicesLimit}" } ?: "—", Modifier.weight(1f))
        }
        if (!detail.isNullOrBlank() && state != TunnelState.STOPPED) {
            Spacer(Modifier.height(12.dp)); Text(detail, color = identity.palette.inkFaint, style = identity.type.body, textAlign = TextAlign.Center)
        }
        Spacer(Modifier.weight(1f))
        Row(
            Modifier.fillMaxWidth().height(62.dp).clip(RoundedCornerShape(18.dp))
                .background(Brush.verticalGradient(listOf(Color(0xB81C263A), Color(0x8C0E1420))))
                .border(1.dp, Color.White.copy(alpha = .14f), RoundedCornerShape(18.dp))
                .clickable(onClick = onPlans).padding(horizontal = 15.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Column {
                Text((account?.entitlement?.planName ?: "ABONNEMENT").uppercase(), color = identity.palette.accent,
                    fontSize = 8.5.sp, letterSpacing = 1.4.sp, fontWeight = FontWeight.Bold)
                Text(account?.let { if (it.entitlement.active) "Actif · ${it.entitlement.daysRemaining} jours restants" else "Aucun forfait actif" } ?: "Connectez-vous pour activer votre accès",
                    color = Color(0xFFEAF1FF), fontSize = 12.5.sp, fontWeight = FontWeight.SemiBold)
            }
            Text("›", color = Color(0xFF7D8CA3), fontSize = 21.sp)
        }
    }
}

@Composable
private fun HaloStat(identity: Identity, label: String, value: String, modifier: Modifier) {
    Column(
        modifier.height(58.dp).clip(RoundedCornerShape(16.dp)).background(Color(0x9E161F30))
            .border(1.dp, Color.White.copy(alpha = .10f), RoundedCornerShape(16.dp)).padding(horizontal = 11.dp),
        verticalArrangement = Arrangement.Center,
    ) {
        Text(label, color = Color(0xFF7F8FA8), fontSize = 8.sp, letterSpacing = 1.2.sp, fontWeight = FontWeight.Bold)
        Spacer(Modifier.height(3.dp))
        Text(value, color = Color(0xFFE7EEFC), fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
private fun StatusChip(identity: Identity, connected: Boolean, state: TunnelState) {
    val label = when (state) {
        TunnelState.CONNECTED -> "Connexion sécurisée"
        TunnelState.CONNECTING -> "Connexion en cours"
        TunnelState.RECONNECTING -> "Reconnexion"
        TunnelState.NO_CONNECTION -> "Connexion indisponible"
        TunnelState.SUBSCRIPTION_EXPIRED, TunnelState.DEVICE_REVOKED -> "Action requise"
        else -> "Hors ligne"
    }
    Row(
        Modifier.height(28.dp).clip(RoundedCornerShape(99.dp)).background(Color(0x99141E30))
            .border(1.dp, Color.White.copy(alpha = .12f), RoundedCornerShape(99.dp)).padding(horizontal = 11.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(7.dp).background(if (connected) identity.palette.ok else identity.palette.inkFaint, CircleShape))
        Spacer(Modifier.size(7.dp)); Text(label, color = Color(0xFFB9C8DE), fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
        Spacer(Modifier.size(7.dp)); Box(Modifier.height(11.dp).size(width = 1.dp, height = 11.dp).background(Color.White.copy(alpha = .13f)))
        Spacer(Modifier.size(7.dp)); Text(if (connected) "AUTO" else "PRÊT", color = Color(0xFFB9C8DE), fontSize = 10.5.sp)
    }
}

@Composable
private fun PowerOrb(identity: Identity, state: TunnelState, elapsed: Long, reduceMotion: Boolean, enabled: Boolean, onToggle: () -> Unit) {
    val connected = state == TunnelState.CONNECTED
    Box(
        Modifier.size(210.dp).clip(CircleShape)
            .clickable(enabled = enabled, onClick = onToggle)
            .semantics { contentDescription = if (connected) "Déconnecter le VPN" else "Connecter le VPN"; role = Role.Button; stateDescription = if (connected) "Connecté" else "Déconnecté" },
        contentAlignment = Alignment.Center,
    ) {
        Canvas(Modifier.fillMaxSize().padding(5.dp)) {
            drawCircle(color = Color.White.copy(alpha = .14f), style = Stroke(6.dp.toPx()))
            if (connected) drawArc(identity.palette.accent, -90f, 223f, false, style = Stroke(6.dp.toPx(), cap = StrokeCap.Round))
        }
        Column(
            Modifier.size(186.dp).clip(CircleShape)
                .background(Brush.radialGradient(listOf(Color(0xFF22304A), Color(0xF0182236), Color(0xF50E1522))))
                .border(1.dp, Color.White.copy(alpha = .16f), CircleShape),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            Text(if (connected) "SESSION" else "VPN", color = Color(0xFF7F8FA8), fontSize = 9.sp, letterSpacing = 1.8.sp, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(2.dp))
            Text(if (connected) formatDuration(elapsed) else "—", color = Color(0xFFF2F7FF), fontSize = 34.sp, lineHeight = 34.sp, fontWeight = FontWeight.SemiBold)
            Spacer(Modifier.height(4.dp))
            Text(if (connected) "Connecté" else "Hors ligne", color = if (connected) identity.palette.accent else Color(0xFF7F8FA8), fontSize = 11.5.sp, fontWeight = FontWeight.SemiBold)
        }
    }
}

@Composable
private fun elapsedSeconds(state: TunnelState): Long {
    var seconds by remember(state) { mutableStateOf(0L) }
    LaunchedEffect(state) {
        if (state == TunnelState.CONNECTED) while (true) { delay(1000); seconds += 1 }
    }
    return seconds
}
private fun formatDuration(seconds: Long) = "%02d:%02d".format(seconds / 60, seconds % 60)

@Composable
private fun PlansPage(
    identity: Identity, plans: List<ApiClient.PlanDto>, signedIn: Boolean, order: ApiClient.OrderDto?, busy: Boolean,
    message: String?, onAccount: () -> Unit, onChoose: (ApiClient.PlanDto) -> Unit, onOpen: () -> Unit, onRefresh: () -> Unit,
) = Page(identity, "Choisissez votre accès.", "Abonnement") {
    Text("Des prix simples, une activation automatique après confirmation du paiement.", color = identity.palette.inkSoft, style = identity.type.body)
    message?.let { InlineMessage(identity, it) }
    order?.let {
        Spacer(Modifier.height(12.dp)); HaloCard(identity) {
            Text(if (it.activationStatus == "active") "Accès activé" else "Paiement ${paymentLabel(it.status)}", color = identity.palette.ink, fontWeight = FontWeight.SemiBold)
            Text("${money(it.price.amount)} · ${it.status}", color = identity.palette.inkSoft)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                if (it.checkout != null) SmallAction(identity, "Ouvrir", onOpen)
                SmallAction(identity, "Vérifier", onRefresh)
            }
        }
    }
    Spacer(Modifier.height(14.dp))
    if (plans.isEmpty() && !busy && message == null) Text("Aucun forfait n’est proposé pour le moment.", color = identity.palette.inkSoft)
    plans.forEach { plan ->
        HaloCard(identity, featured = plan.featured) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.Top) {
                Column(Modifier.weight(1f)) {
                    Text(plan.badge?.uppercase() ?: if (plan.featured) "RECOMMANDÉ" else "FORFAIT", style = identity.type.label, color = identity.palette.accent)
                    Text(plan.name, color = identity.palette.ink, fontWeight = FontWeight.SemiBold, fontSize = 20.sp)
                }
                Text(money(plan.priceXaf), color = identity.palette.ink, fontWeight = FontWeight.Bold)
            }
            Text(plan.description, color = identity.palette.inkSoft, style = identity.type.body)
            Text("${plan.durationDays} jours · ${plan.deviceLimit} appareil(s)", color = identity.palette.inkFaint, style = identity.type.mono)
            HaloButton(identity, if (signedIn) "Choisir ce forfait" else "Se connecter pour continuer", if (signedIn) ({ onChoose(plan) }) else onAccount, enabled = !busy)
        }
        Spacer(Modifier.height(12.dp))
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun AccountPage(
    identity: Identity, signedIn: Boolean, account: ApiClient.MeResponse?, devices: List<ApiClient.DeviceDto>,
    busy: Boolean, message: String?, onAuthenticate: (Boolean, String, String, String) -> Unit,
    onLogout: () -> Unit, onRevoke: (ApiClient.DeviceDto) -> Unit,
) = Page(identity, if (signedIn) "Votre compte." else "Bienvenue.", "Compte") {
    if (!signedIn) {
        var register by rememberSaveable { mutableStateOf(false) }
        var name by rememberSaveable { mutableStateOf("") }
        var email by rememberSaveable { mutableStateOf("") }
        var password by rememberSaveable { mutableStateOf("") }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Segment(identity, "Connexion", !register, Modifier.weight(1f)) { register = false }
            Segment(identity, "Inscription", register, Modifier.weight(1f)) { register = true }
        }
        Spacer(Modifier.height(16.dp))
        if (register) HaloField(identity, name, { name = it }, "Nom")
        HaloField(identity, email, { email = it }, "Adresse e-mail", KeyboardType.Email)
        HaloField(identity, password, { password = it }, "Mot de passe", KeyboardType.Password, true)
        message?.let { InlineMessage(identity, it) }
        HaloButton(identity, if (register) "Créer mon compte" else "Se connecter", { onAuthenticate(register, name, email, password) },
            enabled = !busy && email.isNotBlank() && password.length >= 8 && (!register || name.isNotBlank()))
        Text("Vos identifiants servent uniquement à votre compte et à vos appareils.", color = identity.palette.inkFaint, style = identity.type.body)
    } else {
        account?.let { me ->
            HaloCard(identity) {
                Text(me.user.name, color = identity.palette.ink, fontWeight = FontWeight.SemiBold, fontSize = 20.sp)
                Text(me.user.email, color = identity.palette.inkSoft)
                KeyValue(identity, "Forfait", me.entitlement.planName ?: "Inactif")
                KeyValue(identity, "Validité", "${me.entitlement.daysRemaining} jour(s)")
            }
        }
        Spacer(Modifier.height(16.dp)); Text("APPAREILS", style = identity.type.label, color = identity.palette.inkFaint); Spacer(Modifier.height(8.dp))
        devices.forEach { device -> DeviceRow(identity, device, onRevoke) }
        message?.let { InlineMessage(identity, it) }
        Spacer(Modifier.height(12.dp)); TextButton(onClick = onLogout) { Text("Se déconnecter", color = identity.palette.bad) }
    }
}

@Composable
private fun DeviceRow(identity: Identity, device: ApiClient.DeviceDto, onRevoke: (ApiClient.DeviceDto) -> Unit) {
    var confirm by remember { mutableStateOf(false) }
    HaloCard(identity) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            GlyphIcon(Glyph.DEVICE, identity.palette.inkSoft, Modifier.size(24.dp)); Spacer(Modifier.size(12.dp))
            Column(Modifier.weight(1f)) {
                Text(device.name, color = identity.palette.ink, fontWeight = FontWeight.Medium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(if (device.current) "Cet appareil" else device.status, color = identity.palette.inkSoft, fontSize = 12.sp)
            }
            if (!device.current && device.status != "revoked") TextButton(onClick = { confirm = true }) { Text("Révoquer", color = identity.palette.bad) }
        }
    }
    Spacer(Modifier.height(8.dp))
    if (confirm) AlertDialog(
        onDismissRequest = { confirm = false },
        title = { Text("Révoquer cet appareil ?") },
        text = { Text("Il perdra immédiatement son accès au VPN.") },
        confirmButton = { TextButton(onClick = { confirm = false; onRevoke(device) }) { Text("Révoquer") } },
        dismissButton = { TextButton(onClick = { confirm = false }) { Text("Annuler") } },
    )
}

@Composable
private fun SettingsPage(
    identity: Identity, appearance: Appearance, reduceMotion: Boolean, engineName: String, engineAvailable: Boolean,
    onAppearance: (Appearance) -> Unit, onReduceMotion: (Boolean) -> Unit, onNotifications: () -> Unit,
    onVpnSettings: () -> Unit, onClear: () -> Unit,
) = Page(identity, "Réglages.", "Préférences") {
    HaloCard(identity) {
        Text("APPARENCE", style = identity.type.label, color = identity.palette.inkFaint)
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Appearance.entries.forEach { item -> Segment(identity, when (item) { Appearance.AUTO -> "Auto"; Appearance.LIGHT -> "Clair"; Appearance.DARK -> "Sombre" }, appearance == item, Modifier.weight(1f)) { onAppearance(item) } }
        }
        SettingSwitch(identity, "Réduire les animations", "Limite les mouvements décoratifs.", reduceMotion, onReduceMotion)
    }
    Spacer(Modifier.height(12.dp))
    HaloCard(identity) {
        Text("SYSTÈME", style = identity.type.label, color = identity.palette.inkFaint)
        SettingAction(identity, "Notifications", "Afficher l’état du tunnel.", onNotifications)
        SettingAction(identity, "Réglages VPN Android", "Gérer l’autorisation système.", onVpnSettings)
        KeyValue(identity, "Moteur", if (engineAvailable) engineName else "Indisponible")
    }
    Spacer(Modifier.height(12.dp)); HaloCard(identity) {
        Text("CONFIDENTIALITÉ", style = identity.type.label, color = identity.palette.inkFaint)
        Text("Les données d’accès restent chiffrées sur cet appareil.", color = identity.palette.inkSoft, style = identity.type.body)
        TextButton(onClick = onClear) { Text("Effacer les données d’accès", color = identity.palette.bad) }
    }
    Spacer(Modifier.height(16.dp)); Text("${BrandTokens.appName} · ${BrandTokens.appVersion}", color = identity.palette.inkFaint, style = identity.type.mono)
}

@Composable
private fun HelpPage(identity: Identity, onSupport: () -> Unit) = Page(identity, "Comment peut-on aider ?", "Aide") {
    Text("Les réponses essentielles, sans jargon réseau.", color = identity.palette.inkSoft, style = identity.type.body)
    Spacer(Modifier.height(14.dp))
    Faq(identity, "Pourquoi Android demande-t-il une autorisation VPN ?", "Android exige votre accord avant qu’une application puisse créer un tunnel. Cette confirmation vient du système.")
    Faq(identity, "Pourquoi la connexion peut-elle s’interrompre ?", "Un changement de réseau, un forfait expiré ou un accès révoqué peut fermer le tunnel. L’écran d’accueil indique alors l’action utile.")
    Faq(identity, "Que faire après un paiement ?", "Revenez dans Abonnement et touchez Vérifier. L’accès apparaît dès que le paiement et l’activation sont confirmés.")
    Faq(identity, "Puis-je utiliser plusieurs appareils ?", "Oui, dans la limite indiquée par votre forfait. Vous pouvez révoquer un ancien appareil depuis Compte.")
    Spacer(Modifier.height(16.dp)); HaloButton(identity, "Contacter le support", onSupport)
    Spacer(Modifier.height(12.dp)); Text(identity.promise, color = identity.palette.inkFaint, style = identity.type.body)
}

@Composable
private fun Faq(identity: Identity, question: String, answer: String) {
    var open by rememberSaveable { mutableStateOf(false) }
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(identity.palette.surface)
        .border(1.dp, identity.palette.line, RoundedCornerShape(20.dp)).clickable { open = !open }.padding(16.dp)) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text(question, color = identity.palette.ink, fontWeight = FontWeight.Medium, modifier = Modifier.weight(1f))
            Text(if (open) "−" else "+", color = identity.palette.accent, fontSize = 20.sp)
        }
        if (open) { Spacer(Modifier.height(8.dp)); Text(answer, color = identity.palette.inkSoft, style = identity.type.body) }
    }
    Spacer(Modifier.height(8.dp))
}

@Composable
private fun BlockedScreen(identity: Identity, blocked: Blocked, onPlans: () -> Unit, onRetry: () -> Unit, onSupport: () -> Unit) {
    val title = when (blocked) { Blocked.OFFLINE -> "Connexion indisponible."; Blocked.EXPIRED -> "Votre accès a expiré."; Blocked.REVOKED -> "Cet appareil a été révoqué."; else -> "Action requise." }
    val body = when (blocked) { Blocked.OFFLINE -> "Vérifiez votre réseau puis réessayez."; Blocked.EXPIRED -> "Choisissez un forfait pour retrouver la connexion."; Blocked.REVOKED -> "Reconnectez cet appareil ou contactez le support."; else -> "" }
    Column(Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding().padding(28.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
        Box(Modifier.size(86.dp).background(identity.palette.surface, CircleShape).border(1.dp, identity.palette.line, CircleShape), contentAlignment = Alignment.Center) {
            GlyphIcon(if (blocked == Blocked.EXPIRED) Glyph.CARD else Glyph.HELP, identity.palette.accent, Modifier.size(34.dp))
        }
        Spacer(Modifier.height(22.dp)); Text(title, style = identity.type.title, color = identity.palette.ink, textAlign = TextAlign.Center)
        Spacer(Modifier.height(8.dp)); Text(body, style = identity.type.body, color = identity.palette.inkSoft, textAlign = TextAlign.Center)
        Spacer(Modifier.height(24.dp))
        when (blocked) { Blocked.EXPIRED -> HaloButton(identity, "Voir les forfaits", onPlans); Blocked.OFFLINE -> HaloButton(identity, "Réessayer", onRetry); Blocked.REVOKED -> HaloButton(identity, "Contacter le support", onSupport); else -> Unit }
    }
}

@Composable
private fun HaloCard(identity: Identity, featured: Boolean = false, content: @Composable ColumnScope.() -> Unit) {
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp))
            .background(Brush.verticalGradient(listOf(Color(0xB81C263A), Color(0x8C0E1420))))
            .border(1.dp, if (featured) identity.palette.accent.copy(alpha = .65f) else Color.White.copy(alpha = .14f), RoundedCornerShape(18.dp))
            .padding(15.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp), content = content,
    )
}

@Composable
private fun HaloButton(identity: Identity, label: String, onClick: () -> Unit, enabled: Boolean = true) {
    Button(onClick = onClick, enabled = enabled, modifier = Modifier.fillMaxWidth().height(46.dp), shape = RoundedCornerShape(14.dp),
        colors = ButtonDefaults.buttonColors(
            containerColor = identity.palette.accent,
            contentColor = identity.palette.accentInk,
            disabledContainerColor = Color.White.copy(alpha = .08f),
            disabledContentColor = Color(0xFF7F8FA8),
        )) { Text(label, fontWeight = FontWeight.SemiBold) }
}

@Composable
private fun SmallAction(identity: Identity, label: String, onClick: () -> Unit) {
    TextButton(onClick = onClick) { Text(label, color = identity.palette.accent) }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun HaloField(identity: Identity, value: String, onValue: (String) -> Unit, label: String, keyboardType: KeyboardType = KeyboardType.Text, password: Boolean = false) {
    OutlinedTextField(
        value = value, onValueChange = onValue, label = { Text(label) }, singleLine = true, modifier = Modifier.fillMaxWidth(),
        keyboardOptions = KeyboardOptions(keyboardType = keyboardType), visualTransformation = if (password) PasswordVisualTransformation() else androidx.compose.ui.text.input.VisualTransformation.None,
        shape = RoundedCornerShape(14.dp),
        colors = TextFieldDefaults.colors(
            focusedTextColor = identity.palette.ink, unfocusedTextColor = identity.palette.ink,
            focusedContainerColor = identity.palette.surface, unfocusedContainerColor = identity.palette.surface,
            focusedIndicatorColor = identity.palette.accent, unfocusedIndicatorColor = identity.palette.line,
            focusedLabelColor = identity.palette.accent, unfocusedLabelColor = identity.palette.inkSoft,
            cursorColor = identity.palette.accent,
        ),
    )
    Spacer(Modifier.height(10.dp))
}

@Composable
private fun Segment(identity: Identity, label: String, selected: Boolean, modifier: Modifier, onClick: () -> Unit) {
    Box(modifier.height(44.dp).clip(RoundedCornerShape(14.dp)).background(if (selected) identity.palette.accent.copy(alpha = .16f) else identity.palette.surface)
        .border(1.dp, if (selected) identity.palette.accent else identity.palette.line, RoundedCornerShape(14.dp)).clickable(onClick = onClick), contentAlignment = Alignment.Center) {
        Text(label, color = if (selected) identity.palette.ink else identity.palette.inkSoft, fontSize = 12.sp)
    }
}

@Composable
private fun KeyValue(identity: Identity, key: String, value: String) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(key, color = identity.palette.inkSoft, style = identity.type.body)
        Text(value, color = identity.palette.ink, style = identity.type.mono, textAlign = TextAlign.End)
    }
}

@Composable
private fun SettingSwitch(identity: Identity, title: String, subtitle: String, checked: Boolean, onChecked: (Boolean) -> Unit) {
    Row(Modifier.fillMaxWidth().padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) { Text(title, color = identity.palette.ink); Text(subtitle, color = identity.palette.inkSoft, fontSize = 12.sp) }
        Switch(checked = checked, onCheckedChange = onChecked)
    }
}

@Composable
private fun SettingAction(identity: Identity, title: String, subtitle: String, onClick: () -> Unit) {
    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).clickable(onClick = onClick).padding(vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) { Text(title, color = identity.palette.ink); Text(subtitle, color = identity.palette.inkSoft, fontSize = 12.sp) }
        Text("›", color = identity.palette.accent, fontSize = 24.sp)
    }
}

@Composable
private fun InlineMessage(identity: Identity, value: String) {
    Spacer(Modifier.height(10.dp))
    Text(
        value,
        color = identity.palette.bad,
        style = identity.type.body.copy(fontSize = 12.5.sp),
        modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp))
            .background(identity.palette.bad.copy(alpha = .08f))
            .border(1.dp, identity.palette.bad.copy(alpha = .22f), RoundedCornerShape(14.dp))
            .padding(12.dp),
    )
}

private fun paymentLabel(status: String) = when (status) { "paid" -> "reçu"; "failed" -> "échoué"; "expired" -> "expiré"; else -> "en attente" }
private fun money(amount: Int): String = NumberFormat.getIntegerInstance(Locale.FRANCE).format(amount) + " FCFA"
