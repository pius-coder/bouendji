package cm.bouendji.vpn.ui.screens

import androidx.compose.animation.animateContentSize
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import cm.bouendji.vpn.R
import cm.bouendji.vpn.brand.BrandTokens
import cm.bouendji.vpn.ui.AppController
import cm.bouendji.vpn.ui.Appearance
import cm.bouendji.vpn.ui.COUNTRIES
import cm.bouendji.vpn.ui.CtaBar
import cm.bouendji.vpn.ui.Screen
import cm.bouendji.vpn.ui.ScreenColumn
import cm.bouendji.vpn.ui.kit.BlockBtn
import cm.bouendji.vpn.ui.kit.Btn
import cm.bouendji.vpn.ui.kit.BtnKind
import cm.bouendji.vpn.ui.kit.DisplayTitle
import cm.bouendji.vpn.ui.kit.Divider
import cm.bouendji.vpn.ui.kit.Group
import cm.bouendji.vpn.ui.kit.Guil
import cm.bouendji.vpn.ui.kit.Guilloche
import cm.bouendji.vpn.ui.kit.Ic
import cm.bouendji.vpn.ui.kit.Icon
import cm.bouendji.vpn.ui.kit.Lead
import cm.bouendji.vpn.ui.kit.ListRow
import cm.bouendji.vpn.ui.kit.PermArt
import cm.bouendji.vpn.ui.kit.Sheet
import cm.bouendji.vpn.ui.kit.Stack
import cm.bouendji.vpn.ui.kit.T
import cm.bouendji.vpn.ui.theme.Fonts
import cm.bouendji.vpn.ui.theme.LocalTokens
import kotlinx.coroutines.launch

/* ------------------------------------------------------------------ splash */

@Composable
fun SplashScreen() {
    val t = LocalTokens.current
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Guilloche(Guil.ROSETTE, t.guilloche, Modifier.size(440.dp), spinSeconds = 120)
        BrandIcon(116)
        Column(
            Modifier.align(Alignment.BottomCenter).navigationBarsPadding().padding(bottom = 44.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            T(BrandTokens.appName, size = 15.sp, weight = FontWeight.SemiBold)
            T("v${BrandTokens.appVersion}", color = t.label2, size = 12.sp, family = Fonts.mono)
        }
    }
}

/** Icône de l'application, coins de l'icône iOS (27/116). */
@Composable
fun BrandIcon(sizeDp: Int) {
    Image(
        painterResource(R.drawable.brand_icon),
        contentDescription = BrandTokens.appName,
        modifier = Modifier
            .size(sizeDp.dp)
            .shadow(18.dp, RoundedCornerShape((sizeDp * .233f).dp), ambientColor = Color(0x471E5032), spotColor = Color(0x471E5032))
            .clip(RoundedCornerShape((sizeDp * .233f).dp)),
    )
}

@Composable
fun Mascot(modifier: Modifier = Modifier, float: Boolean = true, alt: Boolean = false) {
    val offset = if (float) {
        val transition = rememberInfiniteTransition(label = "float")
        val y by transition.animateFloat(0f, -8f, infiniteRepeatable(tween(3_000, easing = FastOutSlowInEasing), RepeatMode.Reverse), label = "y")
        y
    } else {
        0f
    }
    Image(painterResource(if (alt) R.drawable.brand_mascot_alt else R.drawable.brand_mascot), contentDescription = null, modifier = modifier.graphicsLayer { translationY = offset * density })
}

/* -------------------------------------------------------------- onboarding */

private data class Slide(val title: String, val text: String)

@Composable
fun OnboardingScreen(c: AppController) {
    val t = LocalTokens.current
    val word = BrandTokens.memberWord.lowercase().replaceFirstChar { it.uppercase() }
    // Les textes viennent du thème : chaque marque a sa voix (Style.slides).
    val themed = cm.bouendji.vpn.ui.theme.LocalStyle.current.slides.map { (title, text) -> Slide(title, text) }
    val slides = if (word == "Nji") {
        themed.take(2) + Slide("Navigue comme\nun Nji.", "En bamoun, Nji veut dire riche. Ici, ta richesse, c'est ta liberté.")
    } else {
        themed
    }
    val pager = rememberPagerState { slides.size }
    val scope = rememberCoroutineScope()
    Column(Modifier.fillMaxSize()) {
        Row(Modifier.fillMaxWidth().statusBarsPadding().padding(end = 8.dp, top = 2.dp), horizontalArrangement = Arrangement.End) {
            Btn("Passer", c::finishOnboarding, kind = BtnKind.PLAIN, height = 44.dp)
        }
        HorizontalPager(pager, Modifier.weight(1f)) { page ->
            Column(Modifier.fillMaxSize().padding(top = 24.dp)) {
                Box(Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.Center) {
                    when (page) {
                        0 -> Box(
                            Modifier.fillMaxHeight(.92f).aspectRatio(.8f).clip(cm.bouendji.vpn.ui.kit.cardShape(160.dp))
                                .background(Brush.radialGradient(listOf(t.accentSoft, Color.Transparent)))
                                .border(1.dp, t.noteEdge, cm.bouendji.vpn.ui.kit.cardShape(160.dp)),
                            contentAlignment = Alignment.Center,
                        ) {
                            Guilloche(Guil.ROSETTE, t.guilloche, Modifier.fillMaxSize().padding(10.dp))
                            Mascot(Modifier.fillMaxWidth(.66f))
                        }
                        1 -> Box(Modifier.fillMaxSize()) {
                            Guilloche(Guil.WAVES, t.guilloche, Modifier.fillMaxSize())
                            Mascot(Modifier.fillMaxWidth(.9f).align(Alignment.CenterEnd).offset(x = 40.dp))
                        }
                        else -> Box(contentAlignment = Alignment.Center) {
                            Guilloche(Guil.SEAL, t.guilloche, Modifier.size(250.dp))
                            if (BrandTokens.memberWord.isNotBlank()) {
                                T(BrandTokens.memberWord, color = t.accent.copy(alpha = .18f), size = 54.sp, weight = FontWeight.SemiBold, family = Fonts.display)
                            }
                            Mascot(Modifier.width(170.dp))
                        }
                    }
                }
                Column(Modifier.padding(horizontal = 28.dp, vertical = 8.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        T("0${page + 1}", color = t.accentText, size = 13.sp, weight = FontWeight.Medium, family = Fonts.mono)
                        T(" / 0${slides.size}", color = t.label2, size = 13.sp)
                    }
                    Spacer(Modifier.height(12.dp))
                    DisplayTitle(slides[page].title, size = 38.sp)
                    Spacer(Modifier.height(12.dp))
                    T(slides[page].text, color = t.label2, size = 17.sp, lineHeight = 25.sp)
                }
            }
        }
        Column(Modifier.navigationBarsPadding().padding(horizontal = 24.dp, vertical = 18.dp)) {
            Row(Modifier.fillMaxWidth().padding(bottom = 20.dp), horizontalArrangement = Arrangement.spacedBy(7.dp, Alignment.CenterHorizontally)) {
                repeat(slides.size) { index ->
                    val on = index == pager.currentPage
                    Box(Modifier.animateContentSize().height(7.dp).width(if (on) 22.dp else 7.dp).clip(RoundedCornerShape(4.dp)).background(if (on) t.accent else t.label3))
                }
            }
            BlockBtn(if (pager.currentPage == slides.lastIndex) "Commencer" else "Continuer", {
                if (pager.currentPage == slides.lastIndex) c.finishOnboarding() else scope.launch { pager.animateScrollToPage(pager.currentPage + 1) }
            })
        }
    }
}

/* ----------------------------------------------------------- autorisation */

@Composable
fun VpnAuthScreen(c: AppController) {
    val t = LocalTokens.current
    Box(Modifier.fillMaxSize()) {
        Column(Modifier.statusBarsPadding()) {
            ScreenColumn(cta = true, centered = true) {
                Spacer(Modifier.height(24.dp))
                PermArt(Ic.Shield)
                Spacer(Modifier.height(18.dp))
                DisplayTitle("Une dernière étape.", align = TextAlign.Center)
                Spacer(Modifier.height(10.dp))
                Lead("${BrandTokens.appName} doit ajouter une configuration VPN à ton téléphone pour chiffrer ta connexion.", align = TextAlign.Center)
                Spacer(Modifier.height(22.dp))
                Group {
                    ListRow("Chiffrement du trafic", icon = Ic.Lock, iconColor = t.accent, sub = "Ton trafic passe par un tunnel sécurisé.")
                    Divider(58.dp)
                    ListRow("Aucun historique conservé", icon = Ic.EyeOff, iconColor = t.inkIcon, sub = "Le service ne journalise pas les sites que tu consultes.")
                    Divider(58.dp)
                    ListRow("Bascule automatique", icon = Ic.Refresh, iconColor = t.mint, sub = "Si un serveur ne répond plus, un autre prend le relais.")
                }
            }
        }
        CtaBar {
            BlockBtn("Continuer", {
                // La vraie fenêtre système s'ouvre au premier allumage du tunnel.
                c.go(Screen.HOME)
                c.platform.toggleTunnel()
            })
            Btn("Plus tard", { c.go(Screen.HOME) }, Modifier.fillMaxWidth(), kind = BtnKind.PLAIN)
        }
    }
}

/* ------------------------------------------------------------------ feuilles */

@Composable
fun SheetHost(c: AppController) {
    val t = LocalTokens.current
    Sheet(open = c.sheet != null, onDismiss = { c.sheet = null }) {
        when (c.sheet) {
            "appearance" -> {
                T("Apparence", size = 19.sp, weight = FontWeight.SemiBold, modifier = Modifier.padding(vertical = 6.dp))
                Spacer(Modifier.height(10.dp))
                Group {
                    Appearance.entries.forEachIndexed { index, option ->
                        if (index > 0) Divider()
                        ListRow(option.label, onClick = { c.updateAppearance(option); c.sheet = null }) {
                            if (c.appearance == option) Icon(Ic.Check, t.accent, size = 20.dp, strokeWidth = 2.4f)
                        }
                    }
                }
            }
            "country" -> {
                T("Pays", size = 19.sp, weight = FontWeight.SemiBold, modifier = Modifier.padding(vertical = 6.dp))
                Spacer(Modifier.height(10.dp))
                Column(Modifier.height(420.dp).verticalScroll(rememberScrollState())) {
                    Group {
                        COUNTRIES.forEachIndexed { index, (name, dial) ->
                            if (index > 0) Divider()
                            ListRow(name, value = "+$dial", onClick = { c.authForm = c.authForm.copy(countryIndex = index); c.sheet = null }) {
                                if (c.authForm.countryIndex == index) Icon(Ic.Check, t.accent, size = 20.dp, strokeWidth = 2.4f)
                            }
                        }
                    }
                }
            }
            "renew" -> {
                Mascot(Modifier.width(92.dp), float = false)
                val expired = c.me?.subscription != null
                DisplayTitle(if (expired) "Abonnement terminé" else "Choisis un forfait", size = 22.sp, align = TextAlign.Center)
                Spacer(Modifier.height(6.dp))
                Lead(
                    if (expired) "Ton accès a pris fin. Recharge ton forfait pour te reconnecter."
                    else "Le tunnel s'active dès que ton paiement est confirmé.",
                    align = TextAlign.Center,
                )
                Stack {
                    BlockBtn("Voir les forfaits", { c.sheet = null; c.go(Screen.PLANS) })
                    BlockBtn("Plus tard", { c.sheet = null }, kind = BtnKind.TINTED)
                }
            }
            "welcome" -> {
                Mascot(Modifier.width(110.dp), float = false)
                val first = c.me?.user?.name?.trim()?.split(" ")?.firstOrNull() ?: c.authForm.firstNames.trim().split(" ").firstOrNull().orEmpty()
                DisplayTitle(if (first.isNotBlank()) "Bienvenue, $first !" else "Bienvenue !", size = 24.sp, align = TextAlign.Center)
                Spacer(Modifier.height(6.dp))
                Lead(
                    "Ton compte ${BrandTokens.appName} est prêt. Choisis un forfait : dès que le paiement est confirmé, " +
                        "tes serveurs arrivent et tu te connectes d'une touche.",
                    align = TextAlign.Center,
                )
                Stack {
                    if (BrandTokens.communityWhatsappUrl.isNotBlank()) {
                        BlockBtn("Rejoindre la communauté WhatsApp", { c.platform.openUrl(BrandTokens.communityWhatsappUrl) }, icon = Ic.Whatsapp)
                    }
                    if (BrandTokens.communityTelegramUrl.isNotBlank()) {
                        BlockBtn("Rejoindre le canal Telegram", { c.platform.openUrl(BrandTokens.communityTelegramUrl) }, kind = BtnKind.TINTED, icon = Ic.Telegram)
                    }
                    BlockBtn(if (c.accessActive) "C'est parti" else "Voir les forfaits", {
                        c.sheet = null
                        if (!c.accessActive) c.go(Screen.PLANS)
                    }, kind = if (BrandTokens.communityWhatsappUrl.isNotBlank()) BtnKind.TINTED else BtnKind.FILLED)
                }
            }
            "import" -> {
                PermArt(if (c.importOk) Ic.Check else Ic.X, size = 120.dp)
                Spacer(Modifier.height(12.dp))
                DisplayTitle(if (c.importOk) "Fichier importé" else "Import refusé", size = 22.sp, align = TextAlign.Center)
                Spacer(Modifier.height(6.dp))
                Lead(c.importMessage.orEmpty(), align = TextAlign.Center)
                Stack {
                    if (c.importOk) {
                        BlockBtn("Me connecter", { c.sheet = null; c.go(Screen.HOME); c.platform.toggleTunnel() }, icon = Ic.Power)
                    } else {
                        BlockBtn("Choisir un autre fichier", { c.sheet = null; c.platform.pickOfflineFile() })
                        BlockBtn("Contacter le support", { c.sheet = null; c.platform.openUrl(BrandTokens.supportUrl) }, kind = BtnKind.TINTED)
                    }
                }
            }
            "revoked" -> {
                DisplayTitle("Appareil retiré", size = 22.sp, align = TextAlign.Center)
                Spacer(Modifier.height(6.dp))
                Lead("Cet appareil a été retiré de ton compte. Contacte le support pour le réactiver.", align = TextAlign.Center)
                Stack { BlockBtn("Contacter le support", { c.sheet = null; c.platform.openUrl(BrandTokens.supportUrl) }) }
            }
            else -> Spacer(Modifier.height(1.dp))
        }
    }
}
