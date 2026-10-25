package cm.bouendji.vpn.ui.screens

import androidx.compose.animation.animateContentSize
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import cm.bouendji.vpn.BuildConfig
import cm.bouendji.vpn.brand.BrandTokens
import cm.bouendji.vpn.ui.Screen
import cm.bouendji.vpn.ui.ScreenColumn
import cm.bouendji.vpn.ui.ShellContext
import cm.bouendji.vpn.ui.kit.Avatar
import cm.bouendji.vpn.ui.kit.Banknote
import cm.bouendji.vpn.ui.kit.BlockBtn
import cm.bouendji.vpn.ui.kit.BtnKind
import cm.bouendji.vpn.ui.kit.Capsule
import cm.bouendji.vpn.ui.kit.DisplayTitle
import cm.bouendji.vpn.ui.kit.Divider
import cm.bouendji.vpn.ui.kit.FinePrint
import cm.bouendji.vpn.ui.kit.Group
import cm.bouendji.vpn.ui.kit.GroupFooter
import cm.bouendji.vpn.ui.kit.GroupHeader
import cm.bouendji.vpn.ui.kit.Ic
import cm.bouendji.vpn.ui.kit.Icon
import cm.bouendji.vpn.ui.kit.IconBtn
import cm.bouendji.vpn.ui.kit.LargeTitle
import cm.bouendji.vpn.ui.kit.Lead
import cm.bouendji.vpn.ui.kit.ListRow
import cm.bouendji.vpn.ui.kit.Meter
import cm.bouendji.vpn.ui.kit.NavBar
import cm.bouendji.vpn.ui.kit.PillSwitch
import cm.bouendji.vpn.ui.kit.Stack
import cm.bouendji.vpn.ui.kit.T
import cm.bouendji.vpn.ui.kit.Tag
import cm.bouendji.vpn.ui.kit.Triplet
import cm.bouendji.vpn.ui.kit.initialsOf
import cm.bouendji.vpn.ui.theme.Fonts
import cm.bouendji.vpn.ui.theme.LocalTokens
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

private val DATE = DateTimeFormatter.ofPattern("d MMM yyyy", Locale.FRENCH)
private val DATE_TIME = DateTimeFormatter.ofPattern("d MMM yyyy 'à' HH:mm", Locale.FRENCH)
private val MONTH = DateTimeFormatter.ofPattern("MMMM yyyy", Locale.FRENCH)

private fun fmt(iso: String?, formatter: DateTimeFormatter): String? =
    iso?.let { runCatching { Instant.parse(it).atZone(ZoneId.systemDefault()).format(formatter) }.getOrNull() }

fun bytesLabel(bytes: Long): Pair<String, String> = when {
    bytes >= 1_000_000_000 -> String.format(Locale.FRANCE, "%.1f", bytes / 1e9) to "Go"
    bytes >= 1_000_000 -> String.format(Locale.FRANCE, "%.0f", bytes / 1e6) to "Mo"
    else -> String.format(Locale.FRANCE, "%.0f", bytes / 1e3) to "Ko"
}

fun durationOnline(seconds: Long): Pair<String, String> = when {
    seconds >= 3_600 -> String.format(Locale.FRANCE, "%.1f", seconds / 3_600.0) to "h"
    else -> (seconds / 60).toString() to "min"
}

/* ------------------------------------------------------------------ profil */

@Composable
fun ProfileScreen(ctx: ShellContext) {
    val c = ctx.c
    val t = LocalTokens.current
    val me = c.me
    Column(Modifier.fillMaxSize()) {
        NavBar(trailing = { IconBtn(Ic.Gear, "Paramètres", { c.go(Screen.SETTINGS) }) })
        ScreenColumn(tabs = true) {
            LargeTitle("Profil")
            Group {
                Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                    Avatar(initialsOf(me?.user?.name), size = 60.dp)
                    Column(Modifier.weight(1f)) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            T(me?.user?.name ?: "—", size = 20.sp, weight = FontWeight.SemiBold, maxLines = 1, modifier = Modifier.weight(1f, fill = false))
                            if (me?.entitlement?.active == true && BrandTokens.memberWord.isNotBlank()) {
                                Tag(BrandTokens.memberWord, color = Color.White, background = t.gold)
                            }
                        }
                        T(fmt(me?.user?.createdAt, MONTH)?.let { "Membre depuis $it" } ?: (me?.user?.email ?: ""), color = t.label2, size = 14.sp, modifier = Modifier.padding(top = 3.dp))
                    }
                }
            }
            Spacer(Modifier.height(12.dp))
            val stats = c.stats
            val (dataValue, dataUnit) = bytesLabel((stats?.bytesUp ?: 0) + (stats?.bytesDown ?: 0))
            val (timeValue, timeUnit) = durationOnline(stats?.seconds ?: 0)
            Triplet(
                listOf(
                    Triple("protégés", if (stats == null) "—" else dataValue, dataUnit),
                    Triple("en ligne", if (stats == null) "—" else timeValue, timeUnit),
                    Triple("restant", if (me?.entitlement?.active == true) me.entitlement.daysRemaining.toString() else "—", "jours"),
                ),
            )
            Spacer(Modifier.height(20.dp))
            Group {
                ListRow("Abonnement", icon = Ic.Card, iconColor = t.accent, value = me?.entitlement?.planName ?: "Aucun", chevron = true, onClick = { c.go(Screen.SUBSCRIPTION) })
                Divider(58.dp)
                ListRow("Mes appareils", icon = Ic.Devices, iconColor = t.inkIcon, value = "${me?.devicesUsed ?: c.devices.size} / ${me?.devicesLimit ?: 1}", chevron = true, onClick = { c.go(Screen.DEVICES) })
            }
            Spacer(Modifier.height(20.dp))
            Group {
                ListRow("Inviter un ami", icon = Ic.UserPlus, iconColor = t.gold, chevron = true, onClick = { c.go(Screen.INVITE) })
                Divider(58.dp)
                ListRow("Aide", icon = Ic.Help, iconColor = t.mint, chevron = true, onClick = { c.go(Screen.HELP) })
                Divider(58.dp)
                ListRow("Paramètres", icon = Ic.Gear, iconColor = Color(0xFF6E7A72), chevron = true, onClick = { c.go(Screen.SETTINGS) })
            }
        }
    }
}

/* -------------------------------------------------------------- paramètres */

@Composable
fun SettingsScreen(ctx: ShellContext) {
    val c = ctx.c
    val t = LocalTokens.current
    Column(Modifier.fillMaxSize()) {
        NavBar(backLabel = "Profil", onBack = { c.back() })
        ScreenColumn {
            LargeTitle("Paramètres")

            GroupHeader("Connexion")
            Group {
                ListRow("Connexion automatique", icon = Ic.Bolt, iconColor = t.accent, sub = "À l'ouverture de l'application") {
                    PillSwitch(c.autoConnect, c::updateAutoConnect)
                }
                Divider(58.dp)
                ListRow(
                    "Serveur automatique",
                    icon = Ic.Globe,
                    iconColor = t.mint,
                    sub = if (c.preferredServer == "auto") "Le plus rapide, bascule seule en cas de panne" else "Choix manuel ; la bascule reste active",
                ) {
                    PillSwitch(c.preferredServer == "auto", { on -> if (on) c.selectServer("auto") else c.go(Screen.SERVERS) })
                }
                Divider(58.dp)
                ListRow("Kill switch", icon = Ic.Power, iconColor = Color(0xFFC2412D), sub = "Bloquer Internet si le VPN se coupe", chevron = true, onClick = c.platform::openVpnSettings)
            }
            GroupFooter(
                "Le kill switch empêche toute donnée de sortir sans protection si le tunnel tombe. Android le gère lui-même : " +
                    "touche la rangée, choisis ${BrandTokens.appName}, puis active « VPN permanent » et « Bloquer les connexions sans VPN ».",
            )

            GroupHeader("Fichier de secours")
            Group {
                ListRow(
                    "Importer un fichier .bvpn",
                    icon = Ic.Download,
                    iconColor = t.accent,
                    sub = "Si l'application ne reçoit plus tes serveurs",
                    chevron = true,
                    onClick = c.platform::pickOfflineFile,
                )
            }
            GroupFooter("Le support peut t'envoyer un fichier .bvpn (WhatsApp, e-mail). Il ne fonctionne que sur ce téléphone, une seule fois, et pour une durée courte.")

            GroupHeader("Confidentialité")
            Group {
                ListRow("Protection DNS", icon = Ic.Dns, iconColor = t.accent, sub = "Requêtes DNS chiffrées dans le tunnel") {
                    PillSwitch(c.dnsProtection, c::updateDnsProtection)
                }
            }
            GroupFooter("Sans protection, les noms des sites visités passent par le résolveur de ton opérateur, hors du tunnel.")

            GroupHeader("Application")
            Group {
                ListRow("Apparence", icon = Ic.Moon, iconColor = Color(0xFF3B4A40), value = c.appearance.label, chevron = true, onClick = { c.sheet = "appearance" })
                Divider(58.dp)
                ListRow("Mouvement réduit", icon = Ic.Refresh, iconColor = t.mint) { PillSwitch(c.reduceMotion, c::updateReduceMotion) }
                Divider(58.dp)
                ListRow("Notifications", icon = Ic.Bell, iconColor = Color(0xFFC2412D), chevron = true, onClick = c.platform::requestNotifications)
            }

            if (c.signedIn) {
                Spacer(Modifier.height(20.dp))
                Group { ListRow("Se déconnecter", destructive = true, onClick = c::logout) }
            }
            FinePrint("${BrandTokens.appName} ${BrandTokens.appVersion}${if (BuildConfig.DEBUG) " · test" else ""}")
        }
    }
}

/* -------------------------------------------------------------- abonnement */

@Composable
fun SubscriptionScreen(ctx: ShellContext) {
    val c = ctx.c
    val t = LocalTokens.current
    val entitlement = c.me?.entitlement
    val subscription = c.me?.subscription
    val active = entitlement?.active == true
    Column(Modifier.fillMaxSize()) {
        NavBar(backLabel = "Profil", onBack = { c.back() })
        ScreenColumn {
            LargeTitle("Abonnement")
            Banknote(height = 196.dp) {
                Column(Modifier.padding(horizontal = 20.dp, vertical = 18.dp).fillMaxWidth()) {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        T(if (active) "ACCÈS ACTIF" else "ACCÈS INACTIF", color = t.noteInk, size = 10.5.sp, weight = FontWeight.SemiBold, letterSpacing = 1.7.sp)
                        T(BrandTokens.appName, color = t.noteInk, size = 13.sp, family = Fonts.display)
                    }
                    T(entitlement?.planName ?: subscription?.planName ?: "Aucun forfait", color = t.noteInk, size = 30.sp, family = Fonts.display, weight = FontWeight.SemiBold, modifier = Modifier.padding(top = 14.dp, bottom = 2.dp))
                    T(
                        when {
                            active -> fmt(entitlement?.endsAt, DATE)?.let { "Expire le $it" } ?: ""
                            subscription != null -> "Terminé"
                            else -> "Choisis un forfait pour activer ton accès"
                        },
                        color = t.noteInk.copy(alpha = .8f),
                        size = 13.sp,
                    )
                    if (active) {
                        T("${entitlement!!.daysRemaining} jour${if (entitlement.daysRemaining > 1) "s" else ""} restant${if (entitlement.daysRemaining > 1) "s" else ""}", color = t.noteInk, size = 24.sp, weight = FontWeight.Medium, family = Fonts.mono, modifier = Modifier.padding(top = 18.dp, bottom = 10.dp))
                        val total = subscription?.let { daysBetween(it.startsAt, it.endsAt) } ?: entitlement.daysRemaining
                        Meter(if (total > 0) entitlement.daysRemaining.toFloat() / total else 0f)
                    }
                }
            }
            Spacer(Modifier.height(20.dp))
            Group {
                ListRow("Forfait", value = entitlement?.planName ?: subscription?.planName ?: "—")
                Divider()
                ListRow("Activé le", value = fmt(entitlement?.startsAt ?: subscription?.startsAt, DATE_TIME) ?: "—")
                Divider()
                ListRow("Expire le", value = fmt(entitlement?.endsAt ?: subscription?.endsAt, DATE_TIME) ?: "—")
                Divider()
                ListRow("Appareils", value = "${c.me?.devicesUsed ?: 0} / ${entitlement?.deviceLimit ?: 1}")
            }
            if (entitlement?.activationPending == true) GroupFooter("Activation en cours : ton paiement est confirmé, l'accès arrive dans quelques instants.")
            Stack {
                BlockBtn(if (active) "Recharger mon forfait" else "Choisir un forfait", { c.go(Screen.PLANS) })
                if (c.order != null) BlockBtn("Suivre ma dernière commande", { c.go(Screen.ORDER_DONE) }, kind = BtnKind.TINTED)
            }
        }
    }
}

private fun daysBetween(start: String, end: String): Int = runCatching {
    ((Instant.parse(end).toEpochMilli() - Instant.parse(start).toEpochMilli()) / 86_400_000L).toInt()
}.getOrDefault(0)

/* ---------------------------------------------------------------- appareils */

@Composable
fun DevicesScreen(ctx: ShellContext) {
    val c = ctx.c
    val t = LocalTokens.current
    val current = c.devices.firstOrNull { it.current }
    val others = c.devices.filter { !it.current }
    Column(Modifier.fillMaxSize()) {
        NavBar(backLabel = "Profil", onBack = { c.back() })
        ScreenColumn {
            LargeTitle("Mes appareils")
            GroupHeader("Cet appareil")
            Group {
                ListRow(
                    current?.name ?: android.os.Build.MODEL,
                    icon = Ic.Devices,
                    iconColor = t.accent,
                    sub = "Actif maintenant",
                ) { Tag(if (current?.status == "revoked") "Retiré" else "Actif") }
            }
            if (others.isNotEmpty()) {
                GroupHeader("Autres appareils")
                Group {
                    others.forEachIndexed { index, device ->
                        if (index > 0) Divider(58.dp)
                        ListRow(
                            device.name,
                            icon = Ic.Devices,
                            iconColor = t.inkIcon,
                            sub = fmt(device.lastSeenAt, DATE_TIME)?.let { "Vu le $it" } ?: "Jamais vu",
                        ) {
                            if (device.status == "revoked") Tag("Retiré", t.danger, t.dangerSoft)
                            else Box(Modifier.clickable { c.revoke(device) }.padding(6.dp)) { T("Retirer", color = t.danger, size = 15.sp, weight = FontWeight.SemiBold) }
                        }
                    }
                }
            }
            GroupFooter("Ton forfait couvre ${c.me?.devicesLimit ?: 1} appareil(s). Retirer un appareil libère sa place ; la coupure de son tunnel en cours n'est pas immédiate.")
            GroupFooter(c.error, danger = true)
            Stack {
                BlockBtn("Ajouter un appareil", ctx.openSupport, kind = BtnKind.TINTED, icon = Ic.Plug)
            }
            GroupFooter("Pour utiliser ton compte sur un autre téléphone, installe l'application et connecte-toi avec ton e-mail.")
        }
    }
}

/* ------------------------------------------------------------------ inviter */

@Composable
fun InviteScreen(ctx: ShellContext) {
    val c = ctx.c
    val t = LocalTokens.current
    val code = c.referral?.code
    Column(Modifier.fillMaxSize()) {
        NavBar(backLabel = "Profil", onBack = { c.back() })
        ScreenColumn(centered = true) {
            Mascot(Modifier.width(150.dp).padding(top = 6.dp, bottom = 10.dp))
            DisplayTitle("Invite tes proches.", align = TextAlign.Center)
            Spacer(Modifier.height(10.dp))
            Lead("Partage ton code : chaque inscription faite avec lui est rattachée à ton compte.", align = TextAlign.Center)
            Spacer(Modifier.height(18.dp))
            Group {
                Row(Modifier.padding(horizontal = 16.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        T("Ton code parrain", color = t.label2, size = 13.sp)
                        T(code ?: "…", size = 19.sp, weight = FontWeight.SemiBold, family = Fonts.mono, letterSpacing = 2.sp)
                    }
                    IconBtn(Ic.Copy, "Copier le code", {
                        if (code != null) { c.platform.copy("Code parrain", code); c.showToast("Code copié.") }
                    }, tinted = true)
                }
                Divider()
                ListRow("Inscrits avec ton code", value = c.referral?.invited?.toString() ?: "—")
            }
            GroupFooter(c.error, danger = true)
            Stack {
                BlockBtn("Partager", {
                    if (code != null) c.platform.share("Rejoins-moi sur ${BrandTokens.appName} ! À l'inscription, entre mon code parrain : $code")
                }, icon = Ic.Share, enabled = code != null)
            }
        }
    }
}

/* -------------------------------------------------------------------- aide */

private val FAQ = listOf(
    "Comment activer mon accès ?" to "Choisis un forfait, paie par Mobile Money sur la page sécurisée, puis reviens dans l'application et touche « Vérifier le paiement ». L'accès s'active seul, sans code à saisir.",
    "Que se passe-t-il quand mon forfait expire ?" to "Le tunnel se coupe à l'échéance. Recharge ton forfait depuis l'onglet Forfaits pour te reconnecter.",
    "Un serveur ne marche pas, que faire ?" to "Rien : l'application teste les serveurs et bascule toute seule sur celui qui répond. Tu peux aussi en choisir un dans l'onglet Serveurs et lancer un test de latence.",
    "Pourquoi « aucun serveur disponible » ?" to "Aucun serveur n'a répondu aux tests. L'application réessaie automatiquement (30 s, puis 2 min, puis 10 min). Si cela dure, contacte le support.",
    "Puis-je utiliser mon compte sur plusieurs appareils ?" to "Oui, dans la limite de ton forfait. Connecte-toi avec ton e-mail sur l'autre téléphone ; tu peux retirer un appareil dans Profil › Mes appareils.",
    "À quoi sert le kill switch ?" to "Il bloque Internet si le VPN tombe, pour qu'aucune donnée ne sorte sans protection. Il se règle dans Android (VPN permanent).",
)

@Composable
fun HelpScreen(ctx: ShellContext) {
    val c = ctx.c
    val t = LocalTokens.current
    var open by rememberSaveable { mutableIntStateOf(-1) }
    Column(Modifier.fillMaxSize()) {
        NavBar(backLabel = "Retour", onBack = { c.back() })
        ScreenColumn {
            LargeTitle("Aide")
            GroupHeader("Questions fréquentes")
            Group {
                FAQ.forEachIndexed { index, (question, answer) ->
                    if (index > 0) Divider()
                    val expanded = open == index
                    val angle by animateFloatAsState(if (expanded) 180f else 0f, label = "chevron")
                    Column(Modifier.fillMaxWidth().animateContentSize().clickable { open = if (expanded) -1 else index }) {
                        Row(Modifier.padding(horizontal = 16.dp, vertical = 14.dp), verticalAlignment = Alignment.CenterVertically) {
                            T(question, weight = FontWeight.Medium, modifier = Modifier.weight(1f))
                            Icon(Ic.ChevronDown, t.label3, size = 16.dp, strokeWidth = 2.4f, modifier = Modifier.rotate(angle))
                        }
                        if (expanded) T(answer, color = t.label2, size = 15.sp, lineHeight = 22.sp, modifier = Modifier.padding(start = 16.dp, end = 16.dp, bottom = 14.dp))
                    }
                }
            }
            GroupHeader("Plus aucun serveur ?")
            Group {
                ListRow(
                    "Importer un fichier de secours",
                    icon = Ic.Download,
                    iconColor = t.accent,
                    sub = "Fichier .bvpn envoyé par le support",
                    chevron = true,
                    onClick = c.platform::pickOfflineFile,
                )
            }
            GroupHeader("Nous contacter")
            Group {
                val mail = BrandTokens.supportUrl.startsWith("mailto:")
                ListRow(
                    "Support",
                    icon = if (mail) Ic.Mail else Ic.Help,
                    iconColor = t.accent,
                    sub = BrandTokens.supportUrl.removePrefix("mailto:").removePrefix("https://"),
                    chevron = true,
                    onClick = ctx.openSupport,
                )
                if (BrandTokens.communityWhatsappUrl.isNotBlank()) {
                    Divider(58.dp)
                    ListRow("Communauté WhatsApp", icon = Ic.Whatsapp, iconColor = Color(0xFF25D366), chevron = true, onClick = { c.platform.openUrl(BrandTokens.communityWhatsappUrl) })
                }
                if (BrandTokens.communityTelegramUrl.isNotBlank()) {
                    Divider(58.dp)
                    ListRow("Canal Telegram", icon = Ic.Telegram, iconColor = Color(0xFF2AABEE), chevron = true, onClick = { c.platform.openUrl(BrandTokens.communityTelegramUrl) })
                }
            }
            GroupHeader("Confidentialité")
            Group {
                ListRow("Aucun lien de configuration affiché", icon = Ic.Lock, iconColor = t.accent, sub = "Les accès voyagent chiffrés et restent dans le coffre du téléphone.")
                Divider(58.dp)
                ListRow("Aucun historique de navigation", icon = Ic.EyeOff, iconColor = t.inkIcon, sub = "Seuls le volume et la durée d'utilisation sont comptés.")
            }
        }
    }
}
