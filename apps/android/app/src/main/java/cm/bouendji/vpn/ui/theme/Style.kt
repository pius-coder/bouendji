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
    /** Ligne (Solo) : rangées pleine largeur séparées d'un filet 1 dp, angles vifs, fil vertical bleu. */
    LINE,
}

enum class Art { GUILLOCHE, ORBITS, TYPE, RADAR, BURST, KENTE, STARS, FACETS, LINE }

enum class PowerShape { CIRCLE, SQUIRCLE, SQUARE, OCTAGON, BLOB, DIAMOND, PILL, HEXAGON }

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
    BrandTokens.Theme.SAHEL -> sahel()
    BrandTokens.Theme.NEBULA -> nebula()
    BrandTokens.Theme.GLACIER -> glacier()
    BrandTokens.Theme.LIGNE -> ligne()
}

/** Solo : système uniquement, titres Black, angles vifs, seul le bouton est une pilule. */
private fun ligne() = Style(
    display = FontFamily.SansSerif, displayWeight = FontWeight.Black, body = FontFamily.SansSerif,
    titleUppercase = false, titleSpacing = -.6f, radius = 0.dp,
    buttonShape = RoundedCornerShape(28.dp), chipShape = RoundedCornerShape(0.dp),
    decor = Decor.LINE, art = Art.LINE, power = PowerShape.PILL, headerPrefix = "", stroke = 1.dp,
    slides = listOf(
        "Un fil,\nune action." to "Crée ton compte, choisis ton forfait, connecte-toi.",
        "Tout est\nsur la ligne." to "Chaque étape s'allume quand la précédente est faite.",
        "Un bouton,\nc'est tout." to "Ton trafic passe chiffré dès que tu appuies.",
    ),
)

/** Chiffres (durée, latence, jours restants) : à chasse fixe pour Solo, sinon police du texte. */
fun numberFamily(style: Style): FontFamily = if (style.decor == Decor.LINE) FontFamily.Monospace else style.body

private fun sahel() = Style(
    display = FontFamily.Serif, displayWeight = FontWeight.Bold, body = FontFamily.SansSerif,
    titleUppercase = false, titleSpacing = -.2f, radius = 22.dp,
    buttonShape = RoundedCornerShape(topStart = 22.dp, topEnd = 6.dp, bottomEnd = 22.dp, bottomStart = 6.dp),
    chipShape = RoundedCornerShape(topStart = 12.dp, topEnd = 3.dp, bottomEnd = 12.dp, bottomStart = 3.dp),
    decor = Decor.SHADOW, art = Art.KENTE, power = PowerShape.DIAMOND, headerPrefix = "◆ ", stroke = 1.5.dp,
    slides = listOf(
        "La route est\nà toi." to "Du marché au campus, ta connexion reste chiffrée et à toi seul.",
        "Solide comme\nla terre." to "Des serveurs relayés : si l'un faiblit, un autre prend la route.",
        "Ta communauté,\nton réseau." to "Un forfait à ta mesure, payé en Mobile Money, actif tout de suite.",
    ),
)

private fun nebula() = Style(
    display = FontFamily.SansSerif, displayWeight = FontWeight.ExtraBold, body = FontFamily.SansSerif,
    titleUppercase = false, titleSpacing = -1f, radius = 28.dp,
    buttonShape = RoundedCornerShape(50), chipShape = RoundedCornerShape(50),
    decor = Decor.GLASS, art = Art.STARS, power = PowerShape.PILL, headerPrefix = "✦ ", stroke = 1.dp,
    slides = listOf(
        "Passe en\nhyperespace." to "Un tunnel chiffré t'emmène loin des regards indiscrets.",
        "Des étoiles\npour serveurs." to "Toujours un serveur allumé quelque part pour te relier.",
        "Ton univers,\nsans limite." to "Ajoute la nuit illimitée et explore sans compter.",
    ),
)

private fun glacier() = Style(
    display = FontFamily.SansSerif, displayWeight = FontWeight.Thin, body = FontFamily.SansSerif,
    titleUppercase = true, titleSpacing = 3f, radius = 10.dp,
    buttonShape = CutCornerShape(topStart = 14.dp, bottomEnd = 14.dp), chipShape = CutCornerShape(topStart = 6.dp, bottomEnd = 6.dp),
    decor = Decor.GLASS, art = Art.FACETS, power = PowerShape.HEXAGON, headerPrefix = "", stroke = 1.dp,
    slides = listOf(
        "Pur comme\nla glace." to "Ton trafic passe chiffré, net, sans fuite.",
        "Froid sous\npression." to "Réseau saturé, Wi-Fi public : la connexion tient.",
        "Clair et\nprécis." to "Tu choisis tes gigas et ta durée, au franc près.",
    ),
)

/** Fourni par `Shell` avec `LocalTokens`. */
val LocalStyle = staticCompositionLocalOf { styleFor(BrandTokens.Theme.BILLET) }
