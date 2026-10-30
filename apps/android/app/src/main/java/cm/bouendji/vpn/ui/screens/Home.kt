package cm.bouendji.vpn.ui.screens

import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.animateColorAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.border
import androidx.compose.foundation.shape.CutCornerShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.drawOutline
import androidx.compose.ui.graphics.drawscope.translate
import cm.bouendji.vpn.ui.kit.hardShadow
import cm.bouendji.vpn.ui.theme.Decor
import cm.bouendji.vpn.ui.theme.LocalStyle
import cm.bouendji.vpn.ui.theme.PowerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.scale
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import cm.bouendji.vpn.ui.Screen
import cm.bouendji.vpn.ui.ScreenColumn
import cm.bouendji.vpn.ui.ShellContext
import cm.bouendji.vpn.ui.kit.Avatar
import cm.bouendji.vpn.ui.kit.Bars
import cm.bouendji.vpn.ui.kit.Capsule
import cm.bouendji.vpn.ui.kit.Flag
import cm.bouendji.vpn.ui.kit.Group
import cm.bouendji.vpn.ui.kit.GroupHeader
import cm.bouendji.vpn.ui.kit.Guil
import cm.bouendji.vpn.ui.kit.Guilloche
import cm.bouendji.vpn.ui.kit.Ic
import cm.bouendji.vpn.ui.kit.Icon
import cm.bouendji.vpn.ui.kit.ListRow
import cm.bouendji.vpn.ui.kit.NavBar
import cm.bouendji.vpn.ui.kit.Regions
import cm.bouendji.vpn.ui.kit.StatusDot
import cm.bouendji.vpn.ui.kit.T
import cm.bouendji.vpn.ui.kit.Triplet
import cm.bouendji.vpn.ui.kit.initialsOf
import cm.bouendji.vpn.ui.theme.Fonts
import cm.bouendji.vpn.ui.theme.LocalTokens
import cm.bouendji.vpn.vpn.ServerBus
import cm.bouendji.vpn.vpn.TunnelState
import cm.bouendji.vpn.vpn.TunnelStateBus
import kotlinx.coroutines.delay
import java.util.Locale

private val RUNNING = setOf(TunnelState.CONNECTING, TunnelState.RECONNECTING, TunnelState.CONNECTED, TunnelState.NO_CONNECTION)

@Composable
fun HomeScreen(ctx: ShellContext) {
    // Solo : accueil propre, structuré en trois blocs (forfait, serveur, connexion).
    if (cm.bouendji.vpn.ui.IS_LIGNE) { HomeLigne(ctx); return }
    val c = ctx.c
    val t = LocalTokens.current
    val state = ctx.tunnel
    val servers by ServerBus.servers.collectAsState()
    val activeId by ServerBus.active.collectAsState()
    val traffic by ServerBus.traffic.collectAsState()

    // Chronomètre de session : tenu par TunnelStateBus, donc il ne repart pas quand on change de page.
    val since by TunnelStateBus.since.collectAsState()
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    LaunchedEffect(state) {
        while (state in RUNNING) { now = System.currentTimeMillis(); delay(1_000) }
    }

    // Débit : différence des compteurs cumulés, échantillonnés chaque seconde par le service.
    var lastTotals by remember { mutableStateOf<Pair<Long, Long>?>(null) }
    var rates by remember { mutableStateOf(0.0 to 0.0) }
    LaunchedEffect(traffic) {
        val current = traffic ?: run { lastTotals = null; rates = 0.0 to 0.0; return@LaunchedEffect }
        val previous = lastTotals
        if (previous != null) {
            val down = (current.downloadBytes - previous.second).coerceAtLeast(0) * 8 / 1_000_000.0
            val up = (current.uploadBytes - previous.first).coerceAtLeast(0) * 8 / 1_000_000.0
            rates = down to up
        }
        lastTotals = current.uploadBytes to current.downloadBytes
    }

    val active = servers.firstOrNull { it.configId == activeId }
    val preferred = servers.firstOrNull { it.configId == c.preferredServer }
    val shown = active ?: preferred
    val firstName = c.me?.user?.name?.trim()?.split(" ")?.firstOrNull()

    val (title, sub, dotColor, halo) = when (state) {
        TunnelState.CONNECTED -> Quad("Protégé", shown?.let { "Ton trafic passe par ${it.label}." } ?: "Ton trafic est chiffré.", t.accent, t.accentSoft)
        TunnelState.CONNECTING -> Quad("Connexion…", ctx.tunnelDetail ?: "Ouverture du tunnel sécurisé.", t.gold, t.goldSoft)
        TunnelState.RECONNECTING -> Quad("Reconnexion…", ctx.tunnelDetail ?: "Recherche d'un serveur qui répond.", t.gold, t.goldSoft)
        TunnelState.NO_CONNECTION -> Quad("Aucun serveur", "Aucun serveur ne répond. Nouvel essai automatique.", t.danger, t.dangerSoft)
        TunnelState.SUBSCRIPTION_EXPIRED -> Quad("Abonnement expiré", "Recharge ton forfait pour te reconnecter.", t.danger, t.dangerSoft)
        TunnelState.DEVICE_REVOKED -> Quad("Appareil retiré", "Contacte le support pour le réactiver.", t.danger, t.dangerSoft)
        TunnelState.STOPPED -> Quad("Non protégé", ctx.tunnelDetail?.takeIf { it.isNotBlank() } ?: "Ton trafic n'est pas chiffré.", t.danger, t.dangerSoft)
    }
    val busyState = state == TunnelState.CONNECTING || state == TunnelState.RECONNECTING
    val blink = if (busyState) {
        val tr = rememberInfiniteTransition(label = "blink")
        tr.animateFloat(1f, .35f, infiniteRepeatable(tween(500), RepeatMode.Reverse), label = "a").value
    } else 1f

    fun onPower() {
        when {
            !ctx.engineAvailable -> c.showToast("Moteur VPN indisponible sur cet appareil.")
            !c.signedIn -> c.go(Screen.AUTH)
            c.deviceRevoked -> c.sheet = "revoked"
            state in RUNNING -> c.platform.toggleTunnel()
            !c.accessActive -> c.sheet = "renew"
            !c.hasConfiguration -> { c.showToast("Réception de ta configuration…"); c.refreshAll() }
            else -> c.platform.toggleTunnel()
        }
    }

    Column(Modifier.fillMaxSize()) {
        Row(
            Modifier.fillMaxWidth().statusBarsPadding().height(44.dp).padding(horizontal = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (cm.bouendji.vpn.ui.IS_LIGNE) {
                T(cm.bouendji.vpn.brand.BrandTokens.appName, size = 17.sp, weight = FontWeight.Black, maxLines = 1)
            } else {
                Avatar(initialsOf(c.me?.user?.name), onClick = { c.go(Screen.PROFILE) })
            }
            Spacer(Modifier.weight(1f))
            val entitlement = c.me?.entitlement
            when {
                !c.signedIn || cm.bouendji.vpn.ui.IS_LIGNE -> Unit
                entitlement?.active == true -> Capsule(entitlement.planName ?: "Actif") { c.go(Screen.SUBSCRIPTION) }
                c.me?.subscription != null -> Capsule("Expiré", danger = true) { c.go(Screen.PLANS) }
                else -> Capsule("Sans forfait", danger = true) { c.go(Screen.PLANS) }
            }
            // Solo : plus d'onglet Profil, la feuille « Moi » plein écran s'ouvre d'ici.
            if (cm.bouendji.vpn.ui.IS_LIGNE && c.signedIn) {
                cm.bouendji.vpn.ui.kit.Btn("≡ Moi", { c.go(Screen.PROFILE) }, kind = cm.bouendji.vpn.ui.kit.BtnKind.PLAIN, height = 44.dp)
            }
        }
        val ligne = cm.bouendji.vpn.ui.IS_LIGNE
        val numFamily = if (ligne) cm.bouendji.vpn.ui.theme.numberFamily(LocalStyle.current) else Fonts.mono
        Box(Modifier.weight(1f)) {
        ScreenColumn(tabs = !ligne) {
            Column(Modifier.fillMaxWidth().padding(top = 10.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                T(if (firstName != null) "Bonjour, $firstName" else "Bonjour", color = t.label2, size = 15.sp, weight = FontWeight.Medium)
                Row(Modifier.padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Box(Modifier.alpha(blink)) { StatusDot(dotColor, halo) }
                    T(title, size = 32.sp, weight = FontWeight.Bold, letterSpacing = (-.7).sp)
                }
                T(sub, color = t.label2, size = 15.sp, align = TextAlign.Center, maxLines = 2)
            }

            if (!ligne) PowerControl(state, c.reduceMotion, ::onPower)

            if (!ligne) T(
                when (state) {
                    TunnelState.STOPPED, TunnelState.SUBSCRIPTION_EXPIRED, TunnelState.DEVICE_REVOKED -> "Touche pour te protéger"
                    TunnelState.CONNECTED -> "Touche pour te déconnecter"
                    else -> "Touche pour annuler"
                },
                color = t.label2,
                size = 15.sp,
                align = TextAlign.Center,
                modifier = Modifier.fillMaxWidth(),
            )
            // Forfait à quota (R6/D127) : data restante, ou épuisée avec le rachat.
            val quota = c.quota
            val total = quota?.quotaBytes
            if (c.signedIn && quota != null && total != null && total > 0) {
                val left = quota.remainingBytes ?: (total - quota.usedBytes).coerceAtLeast(0)
                val exhausted = quota.state == "exhausted" || left <= 0
                T(
                    if (exhausted) "Data épuisée" else "${gigabytes(left)} restants sur ${gigabytes(total)}",
                    color = if (exhausted) t.danger else t.label2,
                    size = 14.sp,
                    weight = FontWeight.Medium,
                    align = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth().padding(top = 6.dp),
                )
                if (exhausted) {
                    T(
                        "Racheter un forfait",
                        color = t.accent,
                        size = 15.sp,
                        weight = FontWeight.SemiBold,
                        align = TextAlign.Center,
                        modifier = Modifier.fillMaxWidth().padding(top = 4.dp).clickable { c.go(Screen.PLANS) },
                    )
                }
            }
            if (state == TunnelState.CONNECTED && since > 0) {
                val s = ((now - since) / 1_000).coerceAtLeast(0)
                T(
                    "%02d:%02d:%02d".format(s / 3600, s / 60 % 60, s % 60),
                    size = 30.sp,
                    weight = FontWeight.Medium,
                    family = numFamily,
                    align = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth().padding(top = 2.dp),
                )
            }

            if (state == TunnelState.CONNECTED) {
                val used = traffic?.let { it.uploadBytes + it.downloadBytes } ?: 0L
                val (usedValue, usedUnit) = bytesLabel(used)
                T(
                    "Session : $usedValue $usedUnit échangés",
                    color = t.label2,
                    size = 13.sp,
                    align = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth().padding(top = 4.dp),
                )
                Spacer(Modifier.height(16.dp))
                val testing = servers.any { it.probe == cm.bouendji.vpn.vpn.ProbeState.TESTING }
                Triplet(
                    listOf(
                        Triple("Réception", mbps(rates.first), "Mb/s"),
                        Triple("Envoi", mbps(rates.second), "Mb/s"),
                        Triple("Latence", if (testing) "…" else shown?.latencyMs?.toString() ?: "—", "ms · tester"),
                    ),
                    listOf(Ic.ArrowDown, Ic.ArrowUp, Ic.Refresh),
                    listOf(null, null, c::testLatency),
                )
            }

            GroupHeader("Serveur")
            Group {
                if (servers.isEmpty()) {
                    ListRow(
                        "Aucun serveur reçu",
                        icon = Ic.Globe,
                        iconColor = t.inkIcon,
                        sub = if (c.accessActive) "La liste arrive avec ta configuration." else "Active un forfait pour recevoir les serveurs.",
                        chevron = true,
                        onClick = { c.go(if (c.accessActive) Screen.SERVERS else Screen.PLANS) },
                    )
                } else {
                    val auto = c.preferredServer == ServerBus.AUTO
                    ListRow(
                        label = if (shown != null) Regions.countryName(shown.region) else "Automatique",
                        sub = when {
                            shown != null && auto -> "${shown.label} · choix automatique"
                            shown != null -> shown.label
                            else -> "Le serveur le plus rapide"
                        },
                        leading = { if (shown != null) Flag(shown.region) else Box(Modifier.size(30.dp).clip(CircleShape).background(t.accentSoft), contentAlignment = Alignment.Center) { Icon(Ic.Bolt, t.accentText, size = 16.dp) } },
                        chevron = true,
                        onClick = { c.go(Screen.SERVERS) },
                        trailing = {
                            if (shown?.latencyMs != null) {
                                Bars(shown.latencyMs)
                                T("${shown.latencyMs} ms", color = t.label2, size = 14.sp, family = numFamily)
                            }
                        },
                    )
                }
            }
            // Solo : rangée forfait à la place de la capsule (spec §3).
            if (ligne && c.signedIn) {
                val ent = c.me?.entitlement
                GroupHeader("Forfait")
                Group {
                    when {
                        ent?.active == true -> ListRow(
                            ent.planName ?: "Actif", icon = Ic.Card, iconColor = t.accent, sub = "Abonnement actif",
                            trailing = { T("${ent.daysRemaining} j", color = t.label2, size = 14.sp, family = numFamily) },
                            chevron = true, onClick = { c.go(Screen.SUBSCRIPTION) },
                        )
                        c.me?.subscription != null -> ListRow("Expiré", icon = Ic.Card, iconColor = t.danger, sub = "Choisir un forfait", chevron = true, onClick = { c.go(Screen.PLANS) })
                        else -> ListRow("Sans forfait", icon = Ic.Card, iconColor = t.danger, sub = "Choisir un forfait", chevron = true, onClick = { c.go(Screen.PLANS) })
                    }
                }
            }
        }
        }
        // Solo : bouton connexion = pilule pleine largeur en bas, zone pouce (spec §3).
        if (ligne) {
            Column(Modifier.fillMaxWidth().navigationBarsPadding().padding(horizontal = 16.dp).padding(bottom = 16.dp)) {
                cm.bouendji.vpn.ui.kit.BlockBtn(
                    when (state) {
                        TunnelState.CONNECTED -> "Déconnecter"
                        TunnelState.CONNECTING, TunnelState.RECONNECTING -> "Annuler"
                        else -> "Connecter"
                    },
                    ::onPower,
                    kind = if (state == TunnelState.CONNECTED) cm.bouendji.vpn.ui.kit.BtnKind.TINTED else cm.bouendji.vpn.ui.kit.BtnKind.FILLED,
                )
            }
        }
    }
}

private data class Quad<A, B, C, D>(val a: A, val b: B, val c: C, val d: D)

private fun mbps(value: Double): String = String.format(Locale.FRANCE, "%.1f", value)

/** Rosette + disque d'alimentation (`.power-wrap`, `.power`). */
@Composable
private fun PowerControl(state: TunnelState, reduceMotion: Boolean, onClick: () -> Unit) {
    val t = LocalTokens.current
    val style = LocalStyle.current
    val powerShape: Shape = when (style.power) {
        PowerShape.CIRCLE -> CircleShape
        PowerShape.SQUIRCLE -> RoundedCornerShape(38)
        PowerShape.SQUARE -> RoundedCornerShape(0.dp)
        PowerShape.OCTAGON -> CutCornerShape(30)
        PowerShape.BLOB -> RoundedCornerShape(topStartPercent = 50, topEndPercent = 30, bottomEndPercent = 50, bottomStartPercent = 35)
        PowerShape.DIAMOND -> androidx.compose.foundation.shape.GenericShape { s, _ ->
            moveTo(s.width / 2, 0f); lineTo(s.width, s.height / 2); lineTo(s.width / 2, s.height); lineTo(0f, s.height / 2); close()
        }
        PowerShape.PILL -> RoundedCornerShape(topStartPercent = 50, topEndPercent = 50, bottomEndPercent = 14, bottomStartPercent = 14)
        PowerShape.HEXAGON -> androidx.compose.foundation.shape.GenericShape { s, _ ->
            val r = s.minDimension / 2
            for (i in 0 until 6) {
                val a = Math.toRadians(-90.0 + i * 60)
                val x = s.width / 2 + r * kotlin.math.cos(a).toFloat()
                val y = s.height / 2 + r * kotlin.math.sin(a).toFloat()
                if (i == 0) moveTo(x, y) else lineTo(x, y)
            }
            close()
        }
    }
    val on = state == TunnelState.CONNECTED
    val connecting = state == TunnelState.CONNECTING || state == TunnelState.RECONNECTING
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val bg by animateColorAsState(if (on) t.accent else t.surfaceElev, tween(450), label = "bg")
    val fg by animateColorAsState(if (on) t.onAccent else t.label, tween(450), label = "fg")
    val breathe = if (connecting) {
        val tr = rememberInfiniteTransition(label = "breathe")
        tr.animateFloat(8f, 16f, infiniteRepeatable(tween(650), RepeatMode.Reverse), label = "r").value
    } else 10f
    Box(Modifier.fillMaxWidth().padding(top = 14.dp, bottom = 6.dp), contentAlignment = Alignment.Center) {
        Box(Modifier.size(276.dp), contentAlignment = Alignment.Center) {
            Guilloche(
                Guil.RING,
                if (on || connecting) t.guillocheOn else t.guilloche,
                Modifier.fillMaxSize(),
                spinSeconds = when {
                    reduceMotion -> 0
                    connecting -> 5
                    on -> 80
                    else -> 0
                },
            )
            Box(
                Modifier
                    .size(138.dp)
                    .scale(if (pressed) .95f else 1f)
                    .drawBehind {
                        // Halo autour du bouton, à la forme du bouton.
                        val grow = when {
                            on -> 10.dp.toPx()
                            connecting -> breathe.dp.toPx()
                            else -> 1.dp.toPx()
                        }
                        val outline = powerShape.createOutline(androidx.compose.ui.geometry.Size(size.width + grow * 2, size.height + grow * 2), layoutDirection, this)
                        translate(-grow, -grow) { drawOutline(outline, if (on || connecting) t.accentSoft else t.separator) }
                    }
                    .then(if (style.decor == Decor.STICKER) Modifier.hardShadow(powerShape, t.label, 6.dp) else Modifier)
                    .clip(powerShape)
                    .background(bg)
                    .then(if (style.decor == Decor.STICKER || style.decor == Decor.RULE) Modifier.border(style.stroke * 2, t.label, powerShape) else if (style.decor == Decor.TERMINAL) Modifier.border(2.dp, t.accent, powerShape) else Modifier)
                    .clickable(interaction, indication = null, role = Role.Switch, onClickLabel = if (on) "Couper le VPN" else "Activer le VPN", onClick = onClick),
                contentAlignment = Alignment.Center,
            ) { Icon(Ic.Power, fg, size = 44.dp, strokeWidth = 2.1f) }
        }
    }
}

/** Go décimaux (10^9 octets, comme le serveur), une décimale sous 10 Go. */
fun gigabytes(bytes: Long): String {
    val gb = bytes / 1_000_000_000.0
    val text = if (gb >= 10) "%.0f".format(java.util.Locale.FRANCE, gb) else "%.1f".format(java.util.Locale.FRANCE, gb)
    return "$text Go"
}

/* ------------------------------------------------------------ Solo (Ligne) */

/**
 * Accueil Solo : trois blocs numérotés, chacun dit à quoi il sert.
 * 1 Mon forfait (payer / prolonger, bouton explicite), 2 Mon serveur, 3 Ma connexion.
 * Barre haute : logo + nom, et « Mon compte » écrit en toutes lettres (pas d'icône).
 * Mêmes fonctions que l'accueil classique : power, durée, débit, latence, quota, serveurs.
 */
@Composable
private fun HomeLigne(ctx: ShellContext) {
    val c = ctx.c
    val t = LocalTokens.current
    val num = cm.bouendji.vpn.ui.theme.numberFamily(LocalStyle.current)
    val state = ctx.tunnel
    val servers by ServerBus.servers.collectAsState()
    val activeId by ServerBus.active.collectAsState()
    val traffic by ServerBus.traffic.collectAsState()
    val since by TunnelStateBus.since.collectAsState()
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    LaunchedEffect(state) { while (state in RUNNING) { now = System.currentTimeMillis(); delay(1_000) } }
    var lastTotals by remember { mutableStateOf<Pair<Long, Long>?>(null) }
    var rates by remember { mutableStateOf(0.0 to 0.0) }
    LaunchedEffect(traffic) {
        val current = traffic ?: run { lastTotals = null; rates = 0.0 to 0.0; return@LaunchedEffect }
        lastTotals?.let { p ->
            rates = ((current.downloadBytes - p.second).coerceAtLeast(0) * 8 / 1_000_000.0) to
                ((current.uploadBytes - p.first).coerceAtLeast(0) * 8 / 1_000_000.0)
        }
        lastTotals = current.uploadBytes to current.downloadBytes
    }
    val shown = servers.firstOrNull { it.configId == activeId } ?: servers.firstOrNull { it.configId == c.preferredServer }
    val ent = c.me?.entitlement
    val active = ent?.active == true
    val busyState = state == TunnelState.CONNECTING || state == TunnelState.RECONNECTING

    fun onPower() {
        when {
            !ctx.engineAvailable -> c.showToast("Moteur VPN indisponible sur cet appareil.")
            !c.signedIn -> c.go(Screen.AUTH)
            c.deviceRevoked -> c.sheet = "revoked"
            state in RUNNING -> c.platform.toggleTunnel()
            !c.accessActive -> c.go(Screen.PLANS)
            !c.hasConfiguration -> { c.showToast("Réception de ta configuration…"); c.refreshAll() }
            else -> c.platform.toggleTunnel()
        }
    }

    Column(Modifier.fillMaxSize()) {
        // Barre haute : identité à gauche, compte en toutes lettres à droite.
        Row(
            Modifier.fillMaxWidth().statusBarsPadding().height(56.dp).padding(horizontal = 16.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            BrandIcon(32)
            T(cm.bouendji.vpn.brand.BrandTokens.appName, size = 18.sp, weight = FontWeight.Black, maxLines = 1)
            Spacer(Modifier.weight(1f))
            if (c.signedIn) cm.bouendji.vpn.ui.kit.Btn("Mon compte", { c.go(Screen.PROFILE) }, kind = cm.bouendji.vpn.ui.kit.BtnKind.TINTED, height = 36.dp)
        }
        Box(Modifier.weight(1f)) {
            ScreenColumn {
                // État en grand, sans décor.
                val (title, sub, color) = when (state) {
                    TunnelState.CONNECTED -> Triple("Protégé", shown?.let { "Ton trafic passe par ${Regions.countryName(it.region)}." } ?: "Ton trafic est chiffré.", t.accent)
                    TunnelState.CONNECTING -> Triple("Connexion…", ctx.tunnelDetail ?: "Ouverture du tunnel sécurisé.", t.gold)
                    TunnelState.RECONNECTING -> Triple("Reconnexion…", ctx.tunnelDetail ?: "Recherche d'un serveur qui répond.", t.gold)
                    TunnelState.NO_CONNECTION -> Triple("Aucun serveur", "Aucun serveur ne répond. Nouvel essai automatique.", t.danger)
                    TunnelState.SUBSCRIPTION_EXPIRED -> Triple("Forfait expiré", "Paie un forfait pour te reconnecter.", t.danger)
                    TunnelState.DEVICE_REVOKED -> Triple("Appareil retiré", "Contacte le support pour le réactiver.", t.danger)
                    TunnelState.STOPPED -> Triple("Non protégé", ctx.tunnelDetail?.takeIf { it.isNotBlank() } ?: "Ton trafic n'est pas chiffré.", t.danger)
                }
                Column(Modifier.fillMaxWidth().padding(top = 8.dp, bottom = 4.dp)) {
                    T(title, color = color, size = 34.sp, weight = FontWeight.Black, letterSpacing = (-.8).sp)
                    T(sub, color = t.label2, size = 15.sp, maxLines = 2)
                    if (state == TunnelState.CONNECTED && since > 0) {
                        val s = ((now - since) / 1_000).coerceAtLeast(0)
                        T("%02d:%02d:%02d".format(s / 3600, s / 60 % 60, s % 60), size = 28.sp, weight = FontWeight.Medium, family = num, modifier = Modifier.padding(top = 6.dp))
                        val used = traffic?.let { it.uploadBytes + it.downloadBytes } ?: 0L
                        val (uv, uu) = bytesLabel(used)
                        T("↓ ${mbps(rates.first)} Mb/s   ↑ ${mbps(rates.second)} Mb/s   · $uv $uu", color = t.label2, size = 13.sp, family = num)
                    }
                }

                // 1. Mon forfait — c'est ici qu'on paie.
                GroupHeader("1 · Mon forfait")
                Group {
                    when {
                        active -> ListRow(
                            ent!!.planName ?: "Forfait actif", icon = Ic.Card, iconColor = t.accent,
                            sub = "Actif — détails et échéance",
                            trailing = { T("${ent.daysRemaining} j restants", color = t.label2, size = 14.sp, family = num) },
                            chevron = true, onClick = { c.go(Screen.SUBSCRIPTION) },
                        )
                        c.me?.subscription != null -> ListRow("Forfait expiré", icon = Ic.Card, iconColor = t.danger, sub = "Paie un forfait pour te reconnecter.")
                        else -> ListRow("Aucun forfait actif", icon = Ic.Card, iconColor = t.danger, sub = "Sans forfait, la connexion est impossible.")
                    }
                    val order = c.order
                    if (order != null && order.status == "pending") {
                        cm.bouendji.vpn.ui.kit.Divider(58.dp)
                        ListRow("Paiement en attente", icon = Ic.Refresh, iconColor = t.gold, sub = "Vérifier ou rouvrir la page de paiement", chevron = true, onClick = { c.go(Screen.ORDER_DONE) })
                    }
                }
                val quota = c.quota
                val total = quota?.quotaBytes
                if (quota != null && total != null && total > 0) {
                    val left = quota.remainingBytes ?: (total - quota.usedBytes).coerceAtLeast(0)
                    val exhausted = quota.state == "exhausted" || left <= 0
                    cm.bouendji.vpn.ui.kit.GroupFooter(if (exhausted) "Data épuisée : paie un nouveau forfait." else "${gigabytes(left)} restants sur ${gigabytes(total)}", danger = exhausted)
                }
                Spacer(Modifier.height(10.dp))
                cm.bouendji.vpn.ui.kit.BlockBtn(
                    if (active) "Prolonger mon forfait (payer)" else "Payer un forfait",
                    { c.go(Screen.PLANS) },
                    kind = if (active) cm.bouendji.vpn.ui.kit.BtnKind.TINTED else cm.bouendji.vpn.ui.kit.BtnKind.FILLED,
                )

                // 2. Mon serveur.
                GroupHeader("2 · Mon serveur")
                Group {
                    if (servers.isEmpty()) {
                        ListRow("Aucun serveur reçu", icon = Ic.Globe, iconColor = t.inkIcon,
                            sub = if (c.accessActive) "La liste arrive avec ta configuration." else "Les serveurs arrivent après le paiement.",
                            chevron = c.accessActive, onClick = if (c.accessActive) ({ c.go(Screen.SERVERS) }) else null)
                    } else {
                        val auto = c.preferredServer == ServerBus.AUTO
                        ListRow(
                            label = if (shown != null) Regions.countryName(shown.region) else "Automatique",
                            sub = if (auto) "Choix automatique — toucher pour changer" else "Toucher pour changer de serveur",
                            leading = { if (shown != null) Flag(shown.region) else Icon(Ic.Bolt, t.accentText, size = 20.dp) },
                            chevron = true,
                            onClick = { c.go(Screen.SERVERS) },
                            trailing = { if (shown?.latencyMs != null) T("${shown.latencyMs} ms", color = t.label2, size = 14.sp, family = num) },
                        )
                        cm.bouendji.vpn.ui.kit.Divider(58.dp)
                        val testing = servers.any { it.probe == cm.bouendji.vpn.vpn.ProbeState.TESTING }
                        ListRow(if (testing) "Test en cours…" else "Tester la vitesse des serveurs", icon = Ic.Refresh, iconColor = t.inkIcon, onClick = c::testLatency)
                    }
                }

                // 3. Ma connexion : rappel de ce que fait le bouton du bas.
                GroupHeader("3 · Ma connexion")
                cm.bouendji.vpn.ui.kit.GroupFooter(
                    when {
                        !c.accessActive -> "Paie un forfait (étape 1), puis connecte-toi avec le bouton en bas."
                        state == TunnelState.CONNECTED -> "Le bouton en bas coupe la protection."
                        else -> "Le bouton en bas chiffre ta connexion."
                    },
                )
            }
        }
        // Action unique, zone pouce.
        Column(Modifier.fillMaxWidth().navigationBarsPadding().padding(horizontal = 16.dp).padding(top = 8.dp, bottom = 16.dp)) {
            cm.bouendji.vpn.ui.kit.BlockBtn(
                when {
                    state == TunnelState.CONNECTED -> "Se déconnecter"
                    busyState -> "Annuler la connexion"
                    !c.accessActive -> "Payer pour se connecter"
                    else -> "Se connecter"
                },
                ::onPower,
                kind = if (state == TunnelState.CONNECTED) cm.bouendji.vpn.ui.kit.BtnKind.TINTED else cm.bouendji.vpn.ui.kit.BtnKind.FILLED,
            )
        }
    }
}
