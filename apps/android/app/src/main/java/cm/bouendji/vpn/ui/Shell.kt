package cm.bouendji.vpn.ui

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Intent
import androidx.compose.foundation.verticalScroll
import android.net.VpnService
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import cm.bouendji.vpn.offline.ImportInbox
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.slideOutVertically
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import cm.bouendji.vpn.AppContainer
import cm.bouendji.vpn.brand.BrandTokens
import cm.bouendji.vpn.ui.kit.Ic
import cm.bouendji.vpn.ui.kit.Icon
import cm.bouendji.vpn.ui.kit.NoticeBanner
import cm.bouendji.vpn.ui.kit.T
import cm.bouendji.vpn.ui.kit.Toast
import cm.bouendji.vpn.ui.screens.AuthScreen
import cm.bouendji.vpn.ui.screens.DevicesScreen
import cm.bouendji.vpn.ui.screens.HelpScreen
import cm.bouendji.vpn.ui.screens.HomeScreen
import cm.bouendji.vpn.ui.screens.InviteScreen
import cm.bouendji.vpn.ui.screens.OnboardingScreen
import cm.bouendji.vpn.ui.screens.OrderDoneScreen
import cm.bouendji.vpn.ui.screens.OrderScreen
import cm.bouendji.vpn.ui.screens.PlansScreen
import cm.bouendji.vpn.ui.screens.ProfileScreen
import cm.bouendji.vpn.ui.screens.ServersScreen
import cm.bouendji.vpn.ui.screens.SettingsScreen
import cm.bouendji.vpn.ui.screens.SheetHost
import cm.bouendji.vpn.ui.screens.SplashScreen
import cm.bouendji.vpn.ui.screens.SubscriptionScreen
import cm.bouendji.vpn.ui.screens.VpnAuthScreen
import cm.bouendji.vpn.ui.theme.LocalStyle
import cm.bouendji.vpn.ui.theme.LocalTokens
import cm.bouendji.vpn.ui.theme.styleFor
import cm.bouendji.vpn.ui.theme.tokensFor
import cm.bouendji.vpn.vpn.ServerBus
import cm.bouendji.vpn.vpn.TunnelState
import cm.bouendji.vpn.vpn.VpnTunnelService

/**
 * Racine de l'interface : le design « Le Billet » du prototype lelexxl2a2 (D91),
 * coloré par le thème de la communauté injecté au build.
 */
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
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val filePicker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) ImportInbox.offer(context.contentResolver, uri)
    }
    val controller = remember {
        AppController(
            container,
            scope,
            object : Platform {
                override fun needsVpnConsent(): Boolean = VpnService.prepare(context) != null
                override fun toggleTunnel() = onTunnelToggle()
                override fun openUrl(url: String) = onOpenUrl(url)
                override fun openVpnSettings() = onOpenVpnSettings()
                override fun requestNotifications() = onRequestNotifications()
                override fun share(text: String) {
                    val send = Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, text)
                    context.startActivity(Intent.createChooser(send, null).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                }
                override fun copy(label: String, text: String) {
                    context.getSystemService(ClipboardManager::class.java)?.setPrimaryClip(ClipData.newPlainText(label, text))
                }
                override fun pickOfflineFile() = filePicker.launch(arrayOf("*/*"))
            },
        ).also { c ->
            c.selectInService = { id -> VpnTunnelService.select(context, id) }
            c.probeInService = { VpnTunnelService.probe(context) }
        }
    }
    LaunchedEffect(Unit) { controller.boot() }

    val dark = when (controller.appearance) {
        Appearance.AUTO -> systemDark
        Appearance.LIGHT -> false
        Appearance.DARK -> true
    }
    val tokens = remember(dark) { tokensFor(BrandTokens.theme, dark, BrandTokens.accent) }
    val style = remember { styleFor(BrandTokens.theme) }
    LaunchedEffect(dark) { onSystemBars(dark) }

    val notice by ServerBus.notice.collectAsState()
    val ctx = ShellContext(controller, tunnelState, tunnelDetail, engineAvailable, onOpenSupport)

    BackHandler(enabled = controller.screen != Screen.SPLASH) {
        if (!controller.back()) (context as? android.app.Activity)?.moveTaskToBack(true)
    }

    CompositionLocalProvider(LocalTokens provides tokens, LocalStyle provides style) {
        MaterialTheme(colorScheme = if (dark) darkColorScheme(primary = tokens.accent) else lightColorScheme(primary = tokens.accent)) {
            Box(Modifier.fillMaxSize().background(tokens.bg)) {
                AnimatedContent(
                    targetState = controller.screen,
                    transitionSpec = {
                        if (controller.reduceMotion) {
                            fadeIn(tween(120)) togetherWith fadeOut(tween(120))
                        } else {
                            val dir = if (controller.forward) 1 else -1
                            (slideInHorizontally(tween(320)) { it / 16 * dir } + fadeIn(tween(320))) togetherWith
                                (slideOutHorizontally(tween(320)) { -it / 16 * dir } + fadeOut(tween(200)))
                        }
                    },
                    label = "screen",
                ) { target ->
                    Box(Modifier.fillMaxSize().background(tokens.bg)) { ScreenFor(target, ctx) }
                }

                val showTabs = controller.signedIn && controller.screen in TABS
                AnimatedVisibility(
                    showTabs,
                    modifier = Modifier.align(Alignment.BottomCenter),
                    enter = slideInVertically { it * 2 },
                    exit = slideOutVertically { it * 2 },
                ) { TabBar(controller.screen, controller::go) }

                // Bandeau de bascule / aucun serveur (D18, D61), au-dessus de tout écran connecté.
                val bannerText = notice
                AnimatedVisibility(
                    bannerText != null && controller.signedIn && controller.screen !in setOf(Screen.SPLASH, Screen.ONBOARDING),
                    modifier = Modifier.align(Alignment.TopCenter).statusBarsPadding().padding(horizontal = 10.dp, vertical = 4.dp),
                    enter = slideInVertically { -it * 2 },
                    exit = slideOutVertically { -it * 2 },
                ) {
                    val noServer = tunnelState == TunnelState.NO_CONNECTION
                    NoticeBanner(
                        text = bannerText.orEmpty(),
                        danger = noServer,
                        action = when {
                            noServer -> "Contacter"
                            controller.preferredServer != ServerBus.AUTO -> "Mon choix"
                            else -> null
                        },
                        onAction = {
                            if (noServer) onOpenSupport() else controller.selectServer(controller.preferredServer)
                        },
                        onClose = { ServerBus.setNotice(null) },
                    )
                }

                SheetHost(controller)
                Toast(controller.toast)
            }
        }
    }
}

/** Ce que chaque écran reçoit : le contrôleur et l'état du tunnel. */
class ShellContext(
    val c: AppController,
    val tunnel: TunnelState,
    val tunnelDetail: String?,
    val engineAvailable: Boolean,
    val openSupport: () -> Unit,
)

@Composable
private fun ScreenFor(screen: Screen, ctx: ShellContext) {
    when (screen) {
        Screen.SPLASH -> SplashScreen()
        Screen.ONBOARDING -> OnboardingScreen(ctx.c)
        Screen.AUTH -> AuthScreen(ctx)
        Screen.VPN_AUTH -> VpnAuthScreen(ctx.c)
        Screen.HOME -> HomeScreen(ctx)
        Screen.SERVERS -> ServersScreen(ctx)
        Screen.PLANS -> PlansScreen(ctx)
        Screen.ORDER -> OrderScreen(ctx)
        Screen.ORDER_DONE -> OrderDoneScreen(ctx)
        Screen.PROFILE -> ProfileScreen(ctx)
        Screen.SETTINGS -> SettingsScreen(ctx)
        Screen.SUBSCRIPTION -> SubscriptionScreen(ctx)
        Screen.DEVICES -> DevicesScreen(ctx)
        Screen.INVITE -> InviteScreen(ctx)
        Screen.HELP -> HelpScreen(ctx)
    }
}

/** Barre d'onglets flottante (`.tabbar`) : verre, 62 dp, pastille sur l'onglet actif. */
@Composable
private fun TabBar(current: Screen, onTab: (Screen) -> Unit) {
    val t = LocalTokens.current
    val shape = RoundedCornerShape(31.dp)
    val forfaits = BrandTokens.memberWord.ifBlank { "Forfaits" }.lowercase().replaceFirstChar { it.uppercase() }
    val items = listOf(
        Triple(Screen.HOME, Ic.Home, "Accueil"),
        Triple(Screen.SERVERS, Ic.Globe, "Serveurs"),
        Triple(Screen.PLANS, Ic.Nji, forfaits),
        Triple(Screen.PROFILE, Ic.User, "Profil"),
    )
    Row(
        Modifier
            .navigationBarsPadding()
            .padding(start = 16.dp, end = 16.dp, bottom = 10.dp)
            .fillMaxWidth()
            .height(62.dp)
            .shadow(14.dp, shape)
            .clip(shape)
            .background(t.glassStrong)
            .border(.5.dp, t.separator, shape)
            .padding(5.dp),
        horizontalArrangement = Arrangement.spacedBy(0.dp),
    ) {
        items.forEach { (screen, icon, label) ->
            val active = screen == current
            Column(
                Modifier
                    .weight(1f)
                    .fillMaxHeight()
                    .clip(RoundedCornerShape(26.dp))
                    .background(if (active) t.accentSoft else androidx.compose.ui.graphics.Color.Transparent)
                    .clickable(role = Role.Tab) { onTab(screen) },
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center,
            ) {
                Icon(icon, if (active) t.accentText else t.label2, size = 23.dp)
                T(label, color = if (active) t.accentText else t.label2, size = 10.5.sp, weight = FontWeight.SemiBold, maxLines = 1)
            }
        }
    }
}

/** Contenu défilant d'un écran : marges du prototype (gouttière 16, place pour la barre d'onglets). */
@Composable
fun ScreenColumn(
    tabs: Boolean = false,
    cta: Boolean = false,
    centered: Boolean = false,
    content: @Composable androidx.compose.foundation.layout.ColumnScope.() -> Unit,
) {
    val scroll = androidx.compose.foundation.rememberScrollState()
    Column(
        Modifier
            .fillMaxSize()
            .verticalScroll(scroll)
            .padding(horizontal = 16.dp)
            .padding(bottom = if (tabs) 110.dp else if (cta) 130.dp else 36.dp)
            .navigationBarsPadding(),
        horizontalAlignment = if (centered) Alignment.CenterHorizontally else Alignment.Start,
        content = content,
    )
}

/** Barre d'action collée en bas (`.cta-bar`), fondu vers le fond. */
@Composable
fun androidx.compose.foundation.layout.BoxScope.CtaBar(aboveTabs: Boolean = false, content: @Composable androidx.compose.foundation.layout.ColumnScope.() -> Unit) {
    val t = LocalTokens.current
    Column(
        Modifier
            .align(Alignment.BottomCenter)
            .fillMaxWidth()
            .background(androidx.compose.ui.graphics.Brush.verticalGradient(0f to t.bg.copy(alpha = 0f), .38f to t.bg, 1f to t.bg))
            .navigationBarsPadding()
            .padding(start = 16.dp, end = 16.dp, top = 18.dp, bottom = if (aboveTabs) 84.dp else 14.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp),
        content = content,
    )
}
