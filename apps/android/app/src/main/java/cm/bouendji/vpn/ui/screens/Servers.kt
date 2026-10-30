package cm.bouendji.vpn.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import cm.bouendji.vpn.ui.Screen
import cm.bouendji.vpn.ui.ScreenColumn
import cm.bouendji.vpn.ui.ShellContext
import cm.bouendji.vpn.ui.kit.Bars
import cm.bouendji.vpn.ui.kit.Btn
import cm.bouendji.vpn.ui.kit.BtnKind
import cm.bouendji.vpn.ui.kit.Divider
import cm.bouendji.vpn.ui.kit.Flag
import cm.bouendji.vpn.ui.kit.Group
import cm.bouendji.vpn.ui.kit.GroupFooter
import cm.bouendji.vpn.ui.kit.GroupHeader
import cm.bouendji.vpn.ui.kit.Ic
import cm.bouendji.vpn.ui.kit.Icon
import cm.bouendji.vpn.ui.kit.LargeTitle
import cm.bouendji.vpn.ui.kit.ListRow
import cm.bouendji.vpn.ui.kit.NavBar
import cm.bouendji.vpn.ui.kit.Regions
import cm.bouendji.vpn.ui.kit.SearchField
import cm.bouendji.vpn.ui.kit.Segmented
import cm.bouendji.vpn.ui.kit.T
import cm.bouendji.vpn.ui.kit.Tag
import cm.bouendji.vpn.ui.theme.Fonts
import cm.bouendji.vpn.ui.theme.LocalTokens
import cm.bouendji.vpn.vpn.ProbeMethod
import cm.bouendji.vpn.vpn.ProbeState
import cm.bouendji.vpn.vpn.ServerBus
import cm.bouendji.vpn.vpn.ServerStatus
import cm.bouendji.vpn.vpn.TunnelState

/** Heure de Douala (UTC+1, pas d'heure d'été) pour activer les serveurs de nuit (D136). */
fun isDoualaNight(window: String?): Boolean {
    if (window == null) return false
    val cal = java.util.Calendar.getInstance(java.util.TimeZone.getTimeZone("GMT+1"))
    val hour = cal.get(java.util.Calendar.HOUR_OF_DAY)
    return when (window) {
        "20-24" -> hour in 20..23
        "24-04" -> hour in 0..3
        "20-04" -> hour >= 20 || hour < 4
        else -> false
    }
}

@Composable
fun ServersScreen(ctx: ShellContext) {
    val c = ctx.c
    val t = LocalTokens.current
    val servers by ServerBus.servers.collectAsState()
    val activeId by ServerBus.active.collectAsState()
    var query by rememberSaveable { mutableStateOf("") }
    var filter by rememberSaveable { mutableIntStateOf(0) }

    val testing = c.directTesting || servers.any { it.probe == ProbeState.TESTING }
    val running = ctx.tunnel != TunnelState.STOPPED

    val entitlement = c.me?.entitlement
    val userTier = entitlement?.endpointTier ?: "free-labs"
    val isNightActive = isDoualaNight(c.quota?.nightWindow)

    val visible = servers
        .filter { s ->
            // D136 / D140 : filtrage dynamique conditionné par la formule souscrite
            // Le propriétaire et les utilisateurs payants ont accès à l'ensemble du réseau
            if (entitlement?.planCode == "owner-vip" || userTier == "paid-gcp") {
                true
            } else if (userTier == "free-labs") {
                s.endpointTier == "free-labs"
            } else {
                s.endpointTier == "paid-gcp" || (s.startsAt != null && isNightActive)
            }
        }
        .filter { s ->
            query.isBlank() ||
                s.label.contains(query, ignoreCase = true) ||
                Regions.countryName(s.region).contains(query, ignoreCase = true)
        }
        .filter { s ->
            when (filter) {
                1 -> s.configId in c.favorites
                2 -> s.probe == ProbeState.OK
                else -> true
            }
        }
        // Ceux qui répondent d'abord, par latence ; puis non testés ; puis en échec.
        .sortedWith(compareBy<ServerStatus>({ rank(it) }, { it.latencyMs ?: Int.MAX_VALUE }))

    Column(Modifier.fillMaxSize()) {
        NavBar(backLabel = if (cm.bouendji.vpn.ui.IS_LIGNE) "Accueil" else null, onBack = if (cm.bouendji.vpn.ui.IS_LIGNE) ({ c.back() }) else null, trailing = {
            Btn(
                if (testing) "Test…" else "Tester",
                c::testLatency,
                kind = BtnKind.TINTED,
                icon = Ic.Refresh,
                busy = testing,
                height = 34.dp,
                enabled = servers.isNotEmpty(),
            )
        })
        ScreenColumn(tabs = !cm.bouendji.vpn.ui.IS_LIGNE) {
            LargeTitle("Serveurs")
            c.me?.entitlement?.takeIf { it.active }?.let { entitlement ->
                val isOwner = entitlement.planCode == "owner-vip"
                val label = if (isOwner) "VIP" else tierLabel(entitlement.endpointTier)
                val hint = if (isOwner) "Accès illimité à l'ensemble du réseau mondial." else tierHint(entitlement.endpointTier)
                Row(Modifier.padding(start = 4.dp, bottom = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                    Tag(label)
                    T("  $hint", color = t.label2, size = 13.sp, modifier = Modifier.weight(1f))
                }
            }
            SearchField(query, { query = it }, "Rechercher un pays ou une ville")
            Spacer(Modifier.height(12.dp))
            Segmented(listOf("Tous", "Favoris", "Disponibles"), filter, { filter = it })
            Spacer(Modifier.height(10.dp))
            Btn(
                "Actualiser la liste",
                c::refreshServers,
                kind = BtnKind.TINTED,
                icon = Ic.Refresh,
                busy = c.busy,
                height = 34.dp,
            )

            if (!c.accessActive) {
                Spacer(Modifier.height(18.dp))
                Group {
                    Column(
                        Modifier.padding(horizontal = 20.dp, vertical = 30.dp).fillMaxWidth(),
                        horizontalAlignment = Alignment.CenterHorizontally,
                    ) {
                        Icon(Ic.Lock, t.accent, size = 36.dp)
                        Spacer(Modifier.height(12.dp))
                        T("Aucun forfait actif", size = 18.sp, weight = androidx.compose.ui.text.font.FontWeight.Bold, color = t.label)
                        Spacer(Modifier.height(6.dp))
                        T(
                            "Choisis un forfait pour débloquer l'accès aux serveurs et te connecter.",
                            color = t.label2,
                            size = 14.sp,
                            align = TextAlign.Center,
                        )
                        Spacer(Modifier.height(16.dp))
                        Btn("Voir les forfaits", { c.go(Screen.PLANS) }, kind = BtnKind.FILLED, height = 42.dp)
                    }
                }
                return@ScreenColumn
            }

            if (servers.isEmpty() || visible.isEmpty()) {
                Spacer(Modifier.height(18.dp))
                Group {
                    Column(Modifier.padding(horizontal = 16.dp, vertical = 30.dp).fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
                        Icon(Ic.Globe, t.label3, size = 30.dp)
                        Spacer(Modifier.height(10.dp))
                        T(
                            if (servers.isEmpty()) "La liste des serveurs arrive avec ta configuration."
                            else "Aucun serveur disponible pour les critères choisis.",
                            color = t.label2,
                            size = 15.sp,
                            align = TextAlign.Center,
                        )
                    }
                }
                return@ScreenColumn
            }

            GroupHeader("Mode")
            Group {
                ListRow(
                    "Automatique",
                    sub = "Le plus rapide ; bascule seul si un serveur ne répond plus.",
                    leading = {
                        Box(Modifier.size(30.dp).clip(CircleShape).background(t.accentSoft), contentAlignment = Alignment.Center) {
                            Icon(Ic.Bolt, t.accentText, size = 16.dp, strokeWidth = 2f)
                        }
                    },
                    onClick = { c.selectServer(ServerBus.AUTO) },
                ) {
                    if (c.preferredServer == ServerBus.AUTO) Icon(Ic.Check, t.accent, size = 20.dp, strokeWidth = 2.6f)
                }
            }

            GroupHeader("Pays")
            if (visible.isEmpty()) {
                Group {
                    T(
                        if (filter == 1) "Aucun favori pour l'instant." else if (filter == 2) "Lance un test pour voir les serveurs disponibles." else "Aucun serveur ne correspond.",
                        color = t.label2,
                        size = 15.sp,
                        modifier = Modifier.padding(horizontal = 16.dp, vertical = 34.dp),
                    )
                }
            } else {
                Group {
                    visible.forEachIndexed { index, server ->
                        if (index > 0) Divider(58.dp)
                        ServerRow(
                            server,
                            selected = c.preferredServer == server.configId,
                            active = running && server.configId == activeId,
                            favorite = server.configId in c.favorites,
                            onSelect = { c.selectServer(server.configId) },
                            onFavorite = { c.toggleFavorite(server.configId) },
                        )
                    }
                }
            }
            val method = servers.firstNotNullOfOrNull { it.method }
            GroupFooter(
                when (method) {
                    ProbeMethod.TUNNEL -> "Latence mesurée à travers le tunnel (requête HTTP réelle)."
                    ProbeMethod.DIRECT -> "Tunnel coupé : temps de connexion direct au serveur. La mesure à travers le tunnel se fait une fois connecté."
                    null -> "Touche « Tester » pour mesurer la latence de chaque serveur."
                },
            )
            GroupFooter("Touche l'étoile pour ajouter un favori. Ton choix est une préférence : s'il ne répond plus, l'application bascule automatiquement.")
        }
    }
}

private fun rank(server: ServerStatus): Int = when (server.probe) {
    ProbeState.OK -> 0
    ProbeState.TESTING, ProbeState.UNKNOWN -> 1
    ProbeState.FAILED -> 2
}

@Composable
private fun ServerRow(
    server: ServerStatus,
    selected: Boolean,
    active: Boolean,
    favorite: Boolean,
    onSelect: () -> Unit,
    onFavorite: () -> Unit,
) {
    val t = LocalTokens.current
    ListRow(
        Regions.countryName(server.region),
        sub = server.label,
        leading = { Flag(server.region) },
        onClick = onSelect,
    ) {
        if (active) Tag("En cours")
        when (server.probe) {
            ProbeState.TESTING -> CircularProgressIndicator(color = t.accent, strokeWidth = 2.dp, modifier = Modifier.size(16.dp))
            ProbeState.FAILED -> T("Échec", color = t.danger, size = 13.sp)
            ProbeState.OK -> {
                Bars(server.latencyMs)
                T("${server.latencyMs} ms", color = t.label2, size = 13.sp, family = Fonts.mono)
            }
            ProbeState.UNKNOWN -> T("—", color = t.label3, size = 13.sp)
        }
        Box(
            Modifier.size(34.dp).clip(CircleShape).clickable(role = Role.Checkbox, onClickLabel = "Favori", onClick = onFavorite),
            contentAlignment = Alignment.Center,
        ) {
            Icon(Ic.Star, if (favorite) t.gold else t.label3, size = 19.dp, filled = favorite)
        }
        if (selected) Icon(Ic.Check, t.accent, size = 20.dp, strokeWidth = 2.6f) else Spacer(Modifier.width(20.dp))
    }
}
