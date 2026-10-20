package cm.bouendji.vpn

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.core.view.WindowInsetsControllerCompat
import androidx.lifecycle.lifecycleScope
import cm.bouendji.vpn.brand.BrandTokens
import cm.bouendji.vpn.ui.AppRoot
import cm.bouendji.vpn.ui.AppState
import cm.bouendji.vpn.ui.Appearance
import cm.bouendji.vpn.ui.UiPrefs
import cm.bouendji.vpn.ui.theme.BouendjiTheme
import cm.bouendji.vpn.ui.theme.brandTheme

/**
 * Activité unique.
 *
 * Elle ne fait que trois choses : construire l'état (une fois, avec le scope
 * de l'activité), choisir clair/sombre, et composer la racine. L'identité
 * vient de [BrandTokens.theme] — jamais d'un tirage au sort, jamais d'une
 * préférence serveur (D2).
 *
 * Le thème est reconstruit quand l'apparence ou le réglage de mouvement
 * change : les jetons de forme, de typographie et de mouvement suivent, pas
 * seulement les couleurs.
 */
class MainActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        val container = (application as VpnApplication).container
        val prefs = UiPrefs(this)
        val state = AppState(
            container = container,
            prefs = prefs,
            scope = lifecycleScope,
            context = this,
        )

        setContent {
            val appearance by state.appearance.collectAsState()
            val reduceMotion by state.reduceMotion.collectAsState()
            val systemDark = isSystemInDarkTheme()

            val dark = when (appearance) {
                Appearance.AUTO -> systemDark
                Appearance.LIGHT -> false
                Appearance.DARK -> true
            }

            val theme = remember(dark, reduceMotion) {
                brandTheme(
                    identity = BrandTokens.theme,
                    dark = dark,
                    accentHex = BrandTokens.accent,
                    reduceMotion = reduceMotion,
                )
            }

            // Les icônes de la barre système suivent le fond réellement dessiné,
            // pas le réglage système : en mode « clair » forcé la nuit, des
            // icônes blanches seraient illisibles.
            SideEffect {
                val controller = WindowInsetsControllerCompat(window, window.decorView)
                controller.isAppearanceLightStatusBars = !dark
                controller.isAppearanceLightNavigationBars = !dark
            }

            BouendjiTheme(theme) {
                AppRoot(state)
            }
        }
    }
}
