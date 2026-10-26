package cm.bouendji.vpn.ui.theme

import androidx.compose.foundation.shape.CutCornerShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import cm.bouendji.vpn.brand.BrandTokens

/**
 * Identité visuelle d'un thème, au-delà des couleurs (`Billet.kt`) : polices,
 * formes, décor des groupes, fond graphique, bouton de connexion, ton des textes.
 * Une marque = un thème = une app qui ne ressemble pas aux autres.
 *
 * Polices : seulement celles du système (aucun téléchargement à l'exécution).
 */
enum class Decor {
    /** Carte claire, ombre douce (billet de banque). */
    SHADOW,
    /** Verre dépoli : surface translucide, filet clair. */
    GLASS,
    /** Éditorial : pas de fond, filets noirs en haut et en bas. */
    RULE,
    /** Terminal : cadre fin couleur d'accent, angles coupés. */
    TERMINAL,
    /** Autocollant : trait épais d'encre, ombre portée dure décalée. */
    STICKER,
}

enum class Art { GUILLOCHE, ORBITS, TYPE, RADAR, BURST }

enum class PowerShape { CIRCLE, SQUIRCLE, SQUARE, OCTAGON, BLOB }

data class Style(
    val display: FontFamily,
    val displayWeight: FontWeight,
    val body: FontFamily,
    val titleUppercase: Boolean,
    val titleSpacing: Float,
    /** Rayon des cartes et groupes. */
    val radius: Dp,
    val buttonShape: Shape,
    val chipShape: Shape,
    val decor: Decor,
    val art: Art,
    val power: PowerShape,
    /** Préfixe des en-têtes de groupe (`// ` en terminal). */
    val headerPrefix: String,
    /** Épaisseur du trait des formes « autocollant » ou « éditorial ». */
    val stroke: Dp,
    /** Les trois phrases d'accueil propres au thème. */
    val slides: List<Pair<String, String>>,
)

fun styleFor(theme: BrandTokens.Theme): Style = when (theme) {
    BrandTokens.Theme.BILLET -> Style(
        display = FontFamily.Serif, displayWeight = FontWeight.SemiBold, body = FontFamily.Default,
        titleUppercase = false, titleSpacing = -.3f, radius = 14.dp,
        buttonShape = RoundedCornerShape(50), chipShape = RoundedCornerShape(50),
        decor = Decor.SHADOW, art = Art.GUILLOCHE, power = PowerShape.CIRCLE, headerPrefix = "", stroke = 1.dp,
        slides = listOf(
            "Ta connexion,\nton territoire." to "Ton trafic est chiffré dans un tunnel, sur chaque réseau.",
            "Invisible,\npartout." to "Wi-Fi public, voyage, café : ta connexion reste privée.",
            "Une valeur\nsûre." to "Comme un billet : signé, contrôlé, impossible à copier.",
        ),
    )
    BrandTokens.Theme.HALO -> Style(
        display = FontFamily.SansSerif, displayWeight = FontWeight.Light, body = FontFamily.SansSerif,
        titleUppercase = false, titleSpacing = -.8f, radius = 24.dp,
        buttonShape = RoundedCornerShape(20.dp), chipShape = RoundedCornerShape(12.dp),
        decor = Decor.GLASS, art = Art.ORBITS, power = PowerShape.SQUIRCLE, headerPrefix = "", stroke = 1.dp,
        slides = listOf(
            "Flotte au-dessus\ndu réseau." to "Une bulle chiffrée t'accompagne sur chaque connexion.",
            "Léger comme\nun halo." to "Rien à régler : l'app choisit le meilleur serveur pour toi.",
            "Toujours\nen orbite." to "Si un serveur tombe, un autre prend le relais sans coupure.",
        ),
    )
    BrandTokens.Theme.MONO -> Style(
        display = FontFamily.Serif, displayWeight = FontWeight.Black, body = FontFamily.Serif,
        titleUppercase = true, titleSpacing = 1.2f, radius = 0.dp,
        buttonShape = RoundedCornerShape(0.dp), chipShape = RoundedCornerShape(0.dp),
        decor = Decor.RULE, art = Art.TYPE, power = PowerShape.SQUARE, headerPrefix = "", stroke = 1.5.dp,
        slides = listOf(
            "Noir sur\nblanc." to "Ta connexion, chiffrée de bout en bout. Rien de plus, rien de moins.",
            "Sans\nbavardage." to "Pas de publicité, pas de pistage. Un tunnel, et c'est tout.",
            "L'essentiel,\nimprimé." to "Un abonnement clair, un prix clair, une connexion claire.",
        ),
    )
    BrandTokens.Theme.VECTOR -> Style(
        display = FontFamily.Monospace, displayWeight = FontWeight.Bold, body = FontFamily.Monospace,
        titleUppercase = true, titleSpacing = .5f, radius = 4.dp,
        buttonShape = CutCornerShape(10.dp), chipShape = CutCornerShape(5.dp),
        decor = Decor.TERMINAL, art = Art.RADAR, power = PowerShape.OCTAGON, headerPrefix = "// ", stroke = 1.dp,
        slides = listOf(
            "> tunnel\n  chiffré" to "Connexion établie. Trafic chiffré. Aucune trace en clair.",
            "> mode\n  furtif" to "Wi-Fi public, réseau mobile : tu passes sous le radar.",
            "> accès\n  autorisé" to "Ton appareil a sa propre clé. Personne d'autre ne l'utilise.",
        ),
    )
    BrandTokens.Theme.OTAKU -> Style(
        display = FontFamily.SansSerif, displayWeight = FontWeight.Black, body = FontFamily.SansSerif,
        titleUppercase = false, titleSpacing = -.5f, radius = 18.dp,
        buttonShape = RoundedCornerShape(16.dp), chipShape = RoundedCornerShape(50),
        decor = Decor.STICKER, art = Art.BURST, power = PowerShape.BLOB, headerPrefix = "", stroke = 2.dp,
        slides = listOf(
            "Prêt ?\nConnecte !" to "Un seul bouton et ta connexion passe en mode protégé.",
            "Zéro lag,\nzéro trace." to "Joue, regarde, discute : ton trafic reste à toi.",
            "Ta team,\nton réseau." to "Rejoins la communauté et reste connecté partout.",
        ),
    )
}

/** Fourni par `Shell` avec `LocalTokens`. */
val LocalStyle = staticCompositionLocalOf { styleFor(BrandTokens.Theme.BILLET) }
