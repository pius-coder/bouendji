package cm.bouendji.vpn.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import cm.bouendji.vpn.R
import cm.bouendji.vpn.ui.components.BrandBackground
import cm.bouendji.vpn.ui.components.BrandNotice
import cm.bouendji.vpn.ui.components.BrandTopBar
import cm.bouendji.vpn.ui.components.Tone
import cm.bouendji.vpn.ui.screens.AccountScreen
import cm.bouendji.vpn.ui.screens.HelpScreen
import cm.bouendji.vpn.ui.screens.HomeScreen
import cm.bouendji.vpn.ui.screens.PlansScreen
import cm.bouendji.vpn.ui.screens.SettingsScreen

/** Les cinq écrans. Aucune route inventée : chacun correspond à un besoin réel. */
private enum class Screen {
    HOME,
    ACCOUNT,
    PLANS,
    SETTINGS,
    HELP,
}

/**
 * Racine de l'interface : fond d'identité, barre **1 + 3**, puis l'écran.
 *
 * La navigation tient dans une seule valeur sauvegardée (`rememberSaveable`) :
 * pas de bibliothèque de navigation, pas de route encodée, pas d'écran qu'on
 * pourrait atteindre sans que son état existe. Le bouton retour d'Android et
 * la flèche de la barre font exactement la même chose.
 */
@Composable
fun AppRoot(state: AppState) {
    var screen by rememberSaveable { mutableStateOf(Screen.HOME) }
    val notice by state.notice.collectAsState()

    BackHandler(enabled = screen != Screen.HOME) { screen = Screen.HOME }

    val title = when (screen) {
        Screen.HOME -> ""
        Screen.ACCOUNT -> stringResource(R.string.account_title)
        Screen.PLANS -> stringResource(R.string.plans_title)
        Screen.SETTINGS -> stringResource(R.string.settings_title)
        Screen.HELP -> stringResource(R.string.help_title)
    }

    BrandBackground {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .windowInsetsPadding(WindowInsets.safeDrawing),
        ) {
            BrandTopBar(
                title = title,
                showBack = screen != Screen.HOME,
                onBack = { screen = Screen.HOME },
                onAccount = { screen = Screen.ACCOUNT },
                onSettings = { screen = Screen.SETTINGS },
                onHelp = { screen = Screen.HELP },
            )

            val message = notice
            if (message != null) {
                BrandNotice(
                    message = message,
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
                    tone = Tone.ACCENT,
                    actionLabel = stringResource(R.string.action_dismiss),
                    onAction = { state.dismissNotice() },
                )
            }

            when (screen) {
                Screen.HOME -> HomeScreen(
                    state = state,
                    onPlans = { screen = Screen.PLANS },
                )

                Screen.ACCOUNT -> AccountScreen(
                    state = state,
                    onPlans = { screen = Screen.PLANS },
                )

                Screen.PLANS -> PlansScreen(
                    state = state,
                    onAccount = { screen = Screen.ACCOUNT },
                )

                Screen.SETTINGS -> SettingsScreen(state = state)

                Screen.HELP -> HelpScreen()
            }
        }
    }
}
