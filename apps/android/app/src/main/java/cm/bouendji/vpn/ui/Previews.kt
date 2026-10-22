package cm.bouendji.vpn.ui

import androidx.compose.runtime.Composable
import androidx.compose.ui.tooling.preview.Preview
import cm.bouendji.vpn.brand.BrandTokens
import cm.bouendji.vpn.ui.theme.identityFor
import cm.bouendji.vpn.vpn.TunnelState

/**
 * Aperçus pour le panneau « Design » d'Android Studio.
 *
 * Rien n'est simulé : ce sont les vrais composants, avec les vrais jetons
 * d'identité. Le but est de juger la matière sans attendre un `assembleDebug`
 * ni un appareil.
 *
 * L'identité est figée au build (D30) ; ici on force chaque direction pour
 * pouvoir les comparer côte à côte.
 */
@Composable
private fun PreviewHost(
    theme: BrandTokens.Theme,
    dark: Boolean,
    state: TunnelState,
    detail: String? = null,
) {
    VpnHome(
        identity = identityFor(theme, dark),
        state = state,
        detail = detail,
        engineName = "libbox-1.14.3",
        engineAvailable = true,
        hasConfiguration = true,
        dark = dark,
        onToggleDark = {},
        onToggle = {},
        onOpenSupport = {},
    )
}

@Preview(name = "Halo · sombre · connecté", widthDp = 412, heightDp = 915, showBackground = true)
@Composable
private fun PreviewHaloDark() = PreviewHost(BrandTokens.Theme.HALO, true, TunnelState.CONNECTED)

@Preview(name = "Halo · clair · arrêté", widthDp = 412, heightDp = 915, showBackground = true)
@Composable
private fun PreviewHaloLight() = PreviewHost(BrandTokens.Theme.HALO, false, TunnelState.STOPPED)

@Preview(name = "Mono · sombre · connecté", widthDp = 412, heightDp = 915, showBackground = true)
@Composable
private fun PreviewMonoDark() = PreviewHost(BrandTokens.Theme.MONO, true, TunnelState.CONNECTED)

@Preview(name = "Vector · sombre · connexion", widthDp = 412, heightDp = 915, showBackground = true)
@Composable
private fun PreviewVectorDark() = PreviewHost(BrandTokens.Theme.VECTOR, true, TunnelState.CONNECTING)

@Preview(name = "Otaku · sombre · connecté", widthDp = 412, heightDp = 915, showBackground = true)
@Composable
private fun PreviewOtakuDark() = PreviewHost(BrandTokens.Theme.OTAKU, true, TunnelState.CONNECTED)

@Preview(name = "Halo · aucune sortie (D19)", widthDp = 412, heightDp = 915, showBackground = true)
@Composable
private fun PreviewHaloNoEgress() = PreviewHost(
    theme = BrandTokens.Theme.HALO,
    dark = true,
    state = TunnelState.NO_CONNECTION,
    detail = "Aucune configuration active pour cet appareil.",
)
