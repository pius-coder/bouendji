package cm.bouendji.vpn.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import cm.bouendji.vpn.ui.kit.Segmented
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import cm.bouendji.vpn.brand.BrandTokens
import cm.bouendji.vpn.net.ApiClient
import cm.bouendji.vpn.ui.AppController
import cm.bouendji.vpn.ui.CtaBar
import cm.bouendji.vpn.ui.Screen
import cm.bouendji.vpn.ui.ScreenColumn
import cm.bouendji.vpn.ui.ShellContext
import cm.bouendji.vpn.ui.kit.Banknote
import cm.bouendji.vpn.ui.kit.BlockBtn
import cm.bouendji.vpn.ui.kit.Btn
import cm.bouendji.vpn.ui.kit.BtnKind
import cm.bouendji.vpn.ui.kit.DisplayTitle
import cm.bouendji.vpn.ui.kit.Divider
import cm.bouendji.vpn.ui.kit.Group
import cm.bouendji.vpn.ui.kit.GroupFooter
import cm.bouendji.vpn.ui.kit.GroupHeader
import cm.bouendji.vpn.ui.kit.Guil
import cm.bouendji.vpn.ui.kit.Guilloche
import cm.bouendji.vpn.ui.kit.Ic
import cm.bouendji.vpn.ui.kit.LargeTitle
import cm.bouendji.vpn.ui.kit.Lead
import cm.bouendji.vpn.ui.kit.ListRow
import cm.bouendji.vpn.ui.kit.NavBar
import cm.bouendji.vpn.ui.kit.PermArt
import cm.bouendji.vpn.ui.kit.RadioDot
import cm.bouendji.vpn.ui.kit.StepBadge
import cm.bouendji.vpn.ui.kit.T
import cm.bouendji.vpn.ui.kit.noteBrush
import cm.bouendji.vpn.ui.theme.Fonts
import cm.bouendji.vpn.ui.theme.LocalTokens
import java.text.NumberFormat
import java.util.Locale

/** D45 : `free-labs` = serveurs illimités (Cloud Run), `paid-gcp` = limités (3x-ui, quota). */
val TIER_ORDER = listOf("free-labs", "paid-gcp")

fun tierLabel(tier: String): String = if (tier == "paid-gcp") "Limité" else "Illimité"

fun tierHint(tier: String): String = if (tier == "paid-gcp") {
    "Serveurs stables, disponibles en continu, avec un volume de données par forfait."
} else {
    "Données sans limite ; les serveurs tournent par cycles et l'application bascule seule de l'un à l'autre."
}

fun fcfa(amount: Int): String = NumberFormat.getIntegerInstance(Locale.FRANCE).format(amount).replace(' ', ' ').replace(' ', ' ')

fun durationLabel(days: Int): String = when {
    days == 1 -> "24 heures"
    days % 30 == 0 && days >= 30 -> if (days == 30) "1 mois" else "${days / 30} mois"
    days % 7 == 0 -> if (days == 7) "1 semaine" else "${days / 7} semaines"
    else -> "$days jours"
}

private fun planSummary(plan: ApiClient.PlanDto) =
    "${durationLabel(plan.durationDays)} · ${plan.deviceLimit} appareil${if (plan.deviceLimit > 1) "s" else ""}"

/** Mot de la carte : celui de la marque, sinon son nom. */
private val cardWord: String get() = BrandTokens.memberWord.ifBlank { BrandTokens.appName.uppercase() }

/** Série affichée : initiales de la marque (« BV » pour Bouendji VPN). */
private val series: String get() = BrandTokens.appName.split(" ").filter { it.isNotBlank() }.take(2).joinToString("") { it.first().uppercase() }

/* ---------------------------------------------------------------- forfaits */

@Composable
fun PlansScreen(ctx: ShellContext) {
    val c = ctx.c
    val t = LocalTokens.current
    val asTab = c.signedIn
    Box(Modifier.fillMaxSize()) {
        Column(Modifier.fillMaxSize()) {
            NavBar(backLabel = if (asTab) null else "Retour", onBack = if (asTab) null else ({ c.back() }))
            ScreenColumn(cta = true, tabs = asTab) {
                LargeTitle("Forfaits")
                MemberCard(serial = serialOf(c.me?.user?.id))

                // D45 : le type de serveurs se choisit à l'achat. Le sélecteur n'apparaît
                // que si la marque vend les deux types.
                val tiers = c.plans.map { it.endpointTier }.distinct()
                var tierIndex by rememberSaveable { mutableIntStateOf(0) }
                val shownTier = if (tiers.size > 1) TIER_ORDER[tierIndex] else null
                if (tiers.size > 1) {
                    Spacer(Modifier.height(18.dp))
                    Segmented(TIER_ORDER.map(::tierLabel), tierIndex, { tierIndex = it })
                    GroupFooter(tierHint(TIER_ORDER[tierIndex]))
                }
                // D127 : l'offre sur mesure passe avant les billets classiques.
                c.plans.firstOrNull { it.isCustom }?.let { custom ->
                    GroupHeader("Compose ton forfait")
                    CustomBuilder(c, custom, selected = custom.id == c.selectedPlan?.id) { c.selectedPlanId = custom.id }
                }
                val classic = c.plans.filter { !it.isCustom && (shownTier == null || it.endpointTier == shownTier) }
                if (classic.isNotEmpty() || c.plans.isEmpty()) GroupHeader("Choisis ton billet")
                if (c.plans.isEmpty()) {
                    Group { T(if (c.busy) "Chargement des forfaits…" else "Aucun forfait disponible pour le moment.", color = t.label2, size = 15.sp, modifier = Modifier.padding(16.dp, 30.dp)) }
                }
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    classic.forEach { plan ->
                        Bill(plan, selected = plan.id == c.selectedPlan?.id) { c.selectedPlanId = plan.id }
                    }
                }

                GroupHeader("Inclus dans chaque forfait")
                Group {
                    ListRow("Illimité de nuit en option", icon = Ic.Infinity, iconColor = t.accent, sub = "20 h-24 h, 24 h-4 h ou 20 h-4 h")
                    Divider(58.dp)
                    ListRow("Bascule automatique entre serveurs", icon = Ic.Bolt, iconColor = t.gold)
                    Divider(58.dp)
                    ListRow("Protection DNS chiffrée", icon = Ic.Dns, iconColor = t.inkIcon)
                    Divider(58.dp)
                    ListRow("Tous les pays de la liste", icon = Ic.Globe, iconColor = t.mint, sub = "Choix libre ou automatique")
                }
                GroupFooter("Sans engagement. Paiement Mobile Money sur une page sécurisée ; l'accès s'active seul une fois le paiement confirmé.")
                GroupFooter(c.error, danger = true)
            }
        }
        CtaBar(aboveTabs = asTab) {
            val plan = c.selectedPlan
            BlockBtn(
                if (plan != null) "Continuer · ${fcfa(c.estimateXaf(plan))} FCFA" else "Continuer",
                { if (c.signedIn) c.go(Screen.ORDER) else c.go(Screen.AUTH) },
                enabled = plan != null,
            )
        }
    }
}

/**
 * Offre sur mesure (D127) : deux curseurs (data, durée) et le prix en direct.
 * Le prix affiché suit la formule du serveur ; la commande le recalcule et fait foi.
 */
@Composable
private fun CustomBuilder(c: AppController, plan: ApiClient.PlanDto, selected: Boolean, onSelect: () -> Unit) {
    val t = LocalTokens.current
    val terms = plan.custom ?: return
    val choice = c.customChoice(plan) ?: return
    val shape = RoundedCornerShape(14.dp)
    Column(
        Modifier
            .fillMaxWidth()
            .then(if (t.dark) Modifier else Modifier.shadow(2.dp, shape))
            .clip(shape)
            .background(t.surface)
            .border(if (selected) 2.dp else 0.dp, if (selected) t.accent else Color.Transparent, shape)
            .clickable(role = Role.RadioButton, onClick = onSelect),
    ) {
        // Face du billet : le prix, recalculé à chaque mouvement de curseur.
        Row(
            Modifier.fillMaxWidth().background(noteBrush(t.noteStart, t.noteEnd)).padding(horizontal = 18.dp, vertical = 16.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                T(plan.name, color = t.noteInk, size = 17.sp, weight = FontWeight.SemiBold, maxLines = 1)
                T("${choice.gb} Go · ${durationLabel(choice.days)}", color = t.noteInk.copy(alpha = .75f), size = 13.sp)
            }
            Row(verticalAlignment = Alignment.Bottom) {
                T(fcfa(terms.priceXaf(choice.gb, choice.days)), color = t.noteInk, size = 26.sp, weight = FontWeight.SemiBold, family = Fonts.display)
                T(" FCFA", color = t.noteInk, size = 11.sp, family = Fonts.mono, modifier = Modifier.padding(bottom = 4.dp))
            }
        }
        Column(Modifier.padding(horizontal = 16.dp, vertical = 12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            ChoiceSlider(
                label = "Data",
                valueText = "${choice.gb} Go",
                value = choice.gb,
                min = terms.minGb,
                max = terms.maxGb,
                step = terms.stepGb,
                onChange = { c.customGb = it; onSelect() },
            )
            ChoiceSlider(
                label = "Validité",
                valueText = durationLabel(choice.days),
                value = choice.days,
                min = terms.minDays,
                max = terms.maxDays,
                step = 1,
                onChange = { c.customDays = it; onSelect() },
            )
            T(
                "Prix du Go : ${fcfa(terms.priceXaf(1, choice.days))} FCFA pour ${durationLabel(choice.days)}. Plus la validité est courte, moins le Go coûte.",
                color = t.label3,
                size = 12.sp,
            )
            if (plan.deviceLimit > 1) T("Jusqu'à ${plan.deviceLimit} appareils.", color = t.label3, size = 12.sp)
        }
    }
}

@Composable
private fun ChoiceSlider(label: String, valueText: String, value: Int, min: Int, max: Int, step: Int, onChange: (Int) -> Unit) {
    val t = LocalTokens.current
    Row(Modifier.fillMaxWidth().padding(top = 6.dp), horizontalArrangement = Arrangement.SpaceBetween) {
        T(label, color = t.label2, size = 14.sp)
        T(valueText, size = 15.sp, weight = FontWeight.SemiBold)
    }
    if (max <= min) return
    val positions = (max - min) / step
    androidx.compose.material3.Slider(
        value = value.toFloat(),
        onValueChange = { raw -> onChange(min + Math.round((raw - min) / step) * step) },
        valueRange = min.toFloat()..max.toFloat(),
        // `steps` = crans intermédiaires ; au-delà de 100, le curseur reste continu et la valeur est arrondie.
        steps = if (positions in 2..100) positions - 1 else 0,
        colors = androidx.compose.material3.SliderDefaults.colors(
            thumbColor = t.accent,
            activeTrackColor = t.accent,
            inactiveTrackColor = t.fill,
            activeTickColor = Color.Transparent,
            inactiveTickColor = Color.Transparent,
        ),
    )
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        T("$min", color = t.label3, size = 11.sp, family = Fonts.mono)
        T("$max", color = t.label3, size = 11.sp, family = Fonts.mono)
    }
}

/** Plage de nuit facultative (ou obligatoire pour `limited_night`), avec son prix. */
@Composable
private fun NightPicker(c: AppController, plan: ApiClient.PlanDto) {
    if (plan.nightOptions.isEmpty()) return
    val required = plan.family == "limited_night"
    val options = (if (required) emptyList() else listOf<ApiClient.NightOptionDto?>(null)) + plan.nightOptions
    val current = options.indexOfFirst { it?.window == c.nightWindow }.takeIf { it >= 0 } ?: 0
    // Forfait qui exige une plage : la première est retenue tant que rien n'est choisi.
    androidx.compose.runtime.LaunchedEffect(plan.id, current) {
        if (options[current]?.window != c.nightWindow) c.nightWindow = options[current]?.window
    }
    GroupHeader(if (required) "Plage de nuit" else "Illimité de nuit (option)")
    Segmented(options.map { it?.let { o -> nightLabel(o.window) } ?: "Sans" }, current, { c.nightWindow = options[it]?.window })
    val picked = options[current]
    GroupFooter(
        if (picked == null) "Ajoute une plage pour surfer sans compter la nuit."
        else "Data illimitée ${nightLabel(picked.window)} (heure de Douala) : +${fcfa(picked.priceXaf)} FCFA.",
    )
}

fun nightLabel(window: String): String = when (window) {
    "20-24" -> "20 h-24 h"
    "24-04" -> "24 h-4 h"
    "20-04" -> "20 h-4 h"
    else -> window
}

private fun serialOf(userId: String?): String {
    val digits = userId.orEmpty().filter(Char::isDigit).padEnd(8, '0').take(8)
    return "$series ${digits.take(4)} ${digits.drop(4)}"
}

/** `.banknote` de l'écran Forfaits : carte de membre. */
@Composable
private fun MemberCard(serial: String) {
    val t = LocalTokens.current
    Banknote {
        Row(Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 18.dp), horizontalArrangement = Arrangement.SpaceBetween) {
            T("CARTE DE MEMBRE", color = t.noteInk, size = 10.5.sp, weight = FontWeight.SemiBold, letterSpacing = 1.7.sp)
            T("SÉRIE $series", color = t.noteInk, size = 10.5.sp, weight = FontWeight.SemiBold, family = Fonts.mono, letterSpacing = 1.7.sp)
        }
        T(
            cardWord,
            color = t.noteInk,
            size = if (cardWord.length > 6) 44.sp else 68.sp,
            weight = FontWeight.SemiBold,
            family = Fonts.display,
            maxLines = 1,
            modifier = Modifier.align(Alignment.BottomStart).padding(start = 20.dp, bottom = 38.dp),
        )
        Box(Modifier.align(Alignment.CenterEnd).padding(end = 18.dp).size(100.dp).clip(CircleShape).background(noteBrush(t.noteStart, t.noteEnd)), contentAlignment = Alignment.Center) {
            Guilloche(Guil.SEAL, t.noteInk.copy(alpha = .7f), Modifier.fillMaxSize())
            Box(Modifier.size(36.dp).clip(CircleShape).background(noteBrush(t.noteStart, t.noteEnd)).border(1.dp, t.noteEdge, CircleShape), contentAlignment = Alignment.Center) {
                T(series.take(1), color = t.noteInk, size = 18.sp, weight = FontWeight.SemiBold, family = Fonts.display)
            }
        }
        Row(Modifier.align(Alignment.BottomCenter).fillMaxWidth().padding(horizontal = 20.dp, vertical = 18.dp), horizontalArrangement = Arrangement.SpaceBetween) {
            T(serial, color = t.noteInk, size = 11.5.sp, weight = FontWeight.Medium, family = Fonts.mono, letterSpacing = 1.4.sp)
            T(BrandTokens.appName, color = t.noteInk, size = 13.sp, family = Fonts.display)
        }
    }
}

/** `.bill` : face hachurée avec le prix, détail, bouton radio. */
@Composable
private fun Bill(plan: ApiClient.PlanDto, selected: Boolean, onSelect: () -> Unit) {
    val t = LocalTokens.current
    val shape = RoundedCornerShape(14.dp)
    Row(
        Modifier
            .fillMaxWidth()
            .heightIn(min = 74.dp)
            .then(if (t.dark) Modifier else Modifier.shadow(2.dp, shape))
            .clip(shape)
            .background(t.surface)
            .border(if (selected) 2.dp else 0.dp, if (selected) t.accent else Color.Transparent, shape)
            .clickable(role = Role.RadioButton, onClick = onSelect),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(
            Modifier
                .width(108.dp)
                .heightIn(min = 74.dp)
                .fillMaxHeight()
                .background(noteBrush(t.noteStart, t.noteEnd))
                .drawBehind {
                    // Hachures à 135° et tirets de la perforation (`.bill-face`).
                    val step = 7.dp.toPx()
                    var x = -size.height
                    while (x < size.width) {
                        drawLine(t.noteLine, Offset(x, size.height), Offset(x + size.height, 0f), 1f)
                        x += step
                    }
                    drawLine(t.noteEdge, Offset(size.width, 0f), Offset(size.width, size.height), 1.dp.toPx(), pathEffect = PathEffect.dashPathEffect(floatArrayOf(6f, 6f)))
                }
                .padding(horizontal = 14.dp),
            verticalArrangement = Arrangement.Center,
        ) {
            T(fcfa(plan.priceXaf), color = t.noteInk, size = 23.sp, weight = FontWeight.SemiBold, family = Fonts.display, maxLines = 1)
            T("FCFA", color = t.noteInk.copy(alpha = .8f), size = 10.5.sp, family = Fonts.mono, letterSpacing = 1.4.sp, modifier = Modifier.padding(top = 4.dp))
        }
        Column(Modifier.weight(1f).padding(horizontal = 14.dp, vertical = 10.dp), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                T(plan.name, size = 16.sp, weight = FontWeight.SemiBold, maxLines = 1)
                val badge = plan.badge ?: if (plan.featured) "Populaire" else tierLabel(plan.endpointTier)
                if (badge != null) {
                    Box(Modifier.clip(RoundedCornerShape(50)).background(t.goldSoft).padding(horizontal = 7.dp, vertical = 2.dp)) {
                        T(badge, color = t.goldText, size = 10.5.sp, weight = FontWeight.Bold)
                    }
                }
            }
            T(planSummary(plan), color = t.label2, size = 13.sp)
            if (plan.description.isNotBlank()) T(plan.description, color = t.label3, size = 12.sp, maxLines = 2)
        }
        Box(Modifier.padding(end = 16.dp)) { RadioDot(selected) }
    }
}

/* ---------------------------------------------------------------- commande */

@Composable
fun OrderScreen(ctx: ShellContext) {
    val c = ctx.c
    val t = LocalTokens.current
    val plan = c.selectedPlan
    Box(Modifier.fillMaxSize()) {
        Column(Modifier.fillMaxSize()) {
            NavBar(backLabel = "Forfaits", onBack = { c.back() })
            ScreenColumn(cta = true) {
                LargeTitle("Commande")
                if (plan != null) {
                    Row(
                        Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(noteBrush(t.noteStart, t.noteEnd))
                            .border(1.dp, t.noteEdge, RoundedCornerShape(14.dp)).padding(horizontal = 18.dp, vertical = 16.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(14.dp),
                    ) {
                        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                            T(plan.name, color = t.noteInk, size = 17.sp, weight = FontWeight.SemiBold)
                            val choice = c.customChoice(plan)
                            T(
                                if (choice != null) "${choice.gb} Go · ${durationLabel(choice.days)}" else planSummary(plan),
                                color = t.noteInk.copy(alpha = .75f),
                                size = 13.sp,
                            )
                            c.nightWindow?.takeIf { w -> plan.nightOptions.any { it.window == w } }?.let {
                                T("+ illimité ${nightLabel(it)}", color = t.noteInk.copy(alpha = .75f), size = 13.sp)
                            }
                        }
                        Row(verticalAlignment = Alignment.Bottom) {
                            T(fcfa(c.estimateXaf(plan)), color = t.noteInk, size = 26.sp, weight = FontWeight.SemiBold, family = Fonts.display)
                            T(" FCFA", color = t.noteInk, size = 11.sp, family = Fonts.mono, modifier = Modifier.padding(bottom = 4.dp))
                        }
                    }
                    NightPicker(c, plan)
                }

                GroupHeader("Ton compte")
                Group {
                    ListRow("Nom", value = c.me?.user?.name ?: "—")
                    Divider()
                    ListRow("E-mail", value = c.me?.user?.email ?: "—")
                }

                GroupHeader("Moyen de paiement")
                Group {
                    ListRow(
                        "Mobile Money",
                        icon = Ic.Card,
                        iconColor = Color(0xFFFF7900),
                        sub = "Orange Money, MTN MoMo : au choix sur la page de paiement sécurisée.",
                    )
                }
                GroupFooter(c.error, danger = true)
                GroupFooter("La page de paiement s'ouvre dans ton navigateur. Reviens ensuite ici : ton accès s'active dès que le paiement est confirmé.")
            }
        }
        CtaBar {
            BlockBtn(
                if (plan != null) "Payer ${fcfa(c.estimateXaf(plan))} FCFA" else "Payer",
                c::startOrder,
                icon = Ic.Card,
                enabled = plan != null,
                busy = c.busy,
            )
        }
    }
}

/* ------------------------------------------------------- après le paiement */

@Composable
fun OrderDoneScreen(ctx: ShellContext) {
    val c = ctx.c
    val order = c.order
    val status = order?.status
    val activated = order?.activationStatus == "active"
    Box(Modifier.fillMaxSize()) {
        Column(Modifier.fillMaxSize()) {
            NavBar(backLabel = "Forfaits", onBack = { c.back() })
            ScreenColumn(cta = true, centered = true) {
                PermArt(if (activated || status == "paid") Ic.Check else if (status == "failed" || status == "expired") Ic.X else Ic.Clock)
                Spacer(Modifier.height(18.dp))
                DisplayTitle(
                    when {
                        activated -> "Accès activé."
                        status == "paid" -> "Paiement reçu."
                        status == "failed" -> "Paiement échoué."
                        status == "expired" -> "Lien expiré."
                        else -> "Commande créée."
                    },
                    align = TextAlign.Center,
                )
                Spacer(Modifier.height(8.dp))
                if (order != null) {
                    T("Réf. ${order.orderId.take(8).uppercase()} · ${fcfa(order.price.amount)} FCFA", color = LocalTokens.current.label2, size = 13.5.sp, family = Fonts.mono, align = TextAlign.Center)
                }
                Spacer(Modifier.height(18.dp))
                Group {
                    ListRow("Paie ton forfait", sub = "Sur la page sécurisée, par Mobile Money.", leading = { StepBadge(1) })
                    Divider(58.dp)
                    ListRow("Reviens dans l'application", sub = "Touche « Vérifier le paiement ».", leading = { StepBadge(2) })
                    Divider(58.dp)
                    ListRow("Connecte-toi", sub = "Ton accès s'active seul, sans code à saisir.", leading = { StepBadge(3) })
                }
                GroupFooter(c.error, danger = true)
            }
        }
        CtaBar {
            when {
                activated -> BlockBtn("Me connecter", { c.go(Screen.HOME) }, icon = Ic.Power)
                status == "failed" || status == "expired" -> BlockBtn("Choisir un forfait", { c.go(Screen.PLANS) })
                else -> {
                    BlockBtn("Vérifier le paiement", c::checkOrder, busy = c.busy)
                    if (order?.checkout?.url != null) Btn("Rouvrir la page de paiement", c::reopenCheckout, Modifier.fillMaxWidth(), kind = BtnKind.PLAIN)
                }
            }
        }
    }
}
