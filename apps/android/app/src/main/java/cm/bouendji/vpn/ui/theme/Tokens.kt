package cm.bouendji.vpn.ui.theme

import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.Easing
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import cm.bouendji.vpn.brand.BrandTokens

/**
 * Jetons des quatre identités visuelles (nœud `ui-identities`).
 *
 * Une identité n'est pas une palette : elle porte aussi ses rayons, ses
 * épaisseurs de trait, sa famille typographique et son mouvement. Le rendu
 * d'un même écran change donc de *forme* quand le thème change, pas seulement
 * de teinte.
 *
 * Les valeurs viennent de la planche `Atelier-identites-VPN-v2.html` (sections
 * 1 à 4 du CSS) :
 *
 *  - Halo   : verre, cercles, anneau, ombres douces, 280 ms ;
 *  - Mono   : éditorial suisse, angles à 2-4 dp, filets, monospace, mouvement sec ;
 *  - Vector : tube cathodique, angles vifs, bordure 2 dp, ombre dure décalée,
 *             trame de balayage, monospace, paliers de 90-140 ms ;
 *  - Otaku  : manga, cercles à contour 3 dp, ombre pleine décalée, rotation,
 *             trames de points, graisse 900, rebond.
 *
 * Rien ici n'est tiré au hasard : l'identité vient de [BrandTokens.theme],
 * réécrit au build (D2). Aucun appel réseau, aucune préférence serveur.
 */
data class Palette(
    val dark: Boolean,
    val canvasTop: Color,
    val canvasBottom: Color,
    val surface: Color,
    val surfaceAlt: Color,
    val ink: Color,
    val muted: Color,
    val line: Color,
    val accent: Color,
    val onAccent: Color,
    val accentInk: Color,
    val positive: Color,
    val warning: Color,
    val danger: Color,
    /** Liseré des surfaces en verre (Halo) ; trait normal ailleurs. */
    val glassBorder: Color,
)

/**
 * Rayons et traits. [hardShadow] > 0 déclenche une ombre pleine décalée
 * (Vector, Otaku) au lieu d'une élévation floue.
 */
data class ShapeScale(
    val icon: Shape,
    val card: Shape,
    val control: Shape,
    val chip: Shape,
    val field: Shape,
    val borderWidth: Dp,
    val hardShadow: Dp,
    /** Inclinaison signature de l'identité, en degrés (Otaku : -1,5°). */
    val tilt: Float,
)

data class TypeScale(
    val display: FontFamily,
    val body: FontFamily,
    val numeric: FontFamily,
    val displayWeight: FontWeight,
    val titleWeight: FontWeight,
    val labelWeight: FontWeight,
    val bodyWeight: FontWeight,
    /** Interlettrage des étiquettes capitales. */
    val labelTracking: TextUnit,
    val caps: Boolean,
    val titleSize: TextUnit,
    val timeSize: TextUnit,
    val bodySize: TextUnit,
    val lineHeight: TextUnit,
)

data class MotionScale(
    val fast: Int,
    val base: Int,
    val slow: Int,
    val easing: Easing,
    /** Durée d'un tour complet pour les anneaux ; 0 = pas de rotation. */
    val spinSeconds: Int,
    /** Pulsations (Otaku) ; false = aucun battement. */
    val pulses: Boolean,
    /** Décalage d'appui (Vector : 2 dp, Otaku : 2 dp) en plus de l'ombre. */
    val pressShift: Dp,
)

data class BrandTheme(
    val identity: BrandTokens.Theme,
    val palette: Palette,
    val shapes: ShapeScale,
    val type: TypeScale,
    val motion: MotionScale,
    val reduceMotion: Boolean,
)

/** Nom propre de l'identité — jamais traduit, c'est un nom de marque. */
fun BrandTokens.Theme.displayName(): String = when (this) {
    BrandTokens.Theme.HALO -> "Halo"
    BrandTokens.Theme.MONO -> "Mono"
    BrandTokens.Theme.VECTOR -> "Vector"
    BrandTokens.Theme.OTAKU -> "Otaku"
}

/* ------------------------------------------------------------------ palette */

private fun haloPalette(dark: Boolean): Palette = if (dark) {
    Palette(
        dark = true,
        canvasTop = Color(0xFF080B12),
        canvasBottom = Color(0xFF070A10),
        surface = Color(0xFF131A27),
        surfaceAlt = Color(0xFF1A2334),
        ink = Color(0xFFEEF4FF),
        muted = Color(0xFFA7B4C8),
        line = Color(0xFF26324A),
        accent = Color(0xFF7FB6FF),
        onAccent = Color(0xFF06101F),
        accentInk = Color(0xFF9CC8FF),
        positive = Color(0xFF4ADE9B),
        warning = Color(0xFFFFC46B),
        danger = Color(0xFFFF8A80),
        glassBorder = Color(0x2BFFFFFF),
    )
} else {
    Palette(
        dark = false,
        canvasTop = Color(0xFFF7FAFF),
        canvasBottom = Color(0xFFE9EFF8),
        surface = Color(0xFFFFFFFF),
        surfaceAlt = Color(0xFFF1F5FC),
        ink = Color(0xFF0B1322),
        muted = Color(0xFF5B6779),
        line = Color(0xFFD9E3F2),
        accent = Color(0xFF0A6BE0),
        onAccent = Color(0xFFFFFFFF),
        accentInk = Color(0xFF0A5AC0),
        positive = Color(0xFF0B7A4B),
        warning = Color(0xFF8A5300),
        danger = Color(0xFFB3261E),
        glassBorder = Color(0xD9FFFFFF),
    )
}

private fun monoPalette(dark: Boolean): Palette = if (dark) {
    Palette(
        dark = true,
        canvasTop = Color(0xFF0C0C0B),
        canvasBottom = Color(0xFF0C0C0B),
        surface = Color(0xFF151412),
        surfaceAlt = Color(0xFF1D1B18),
        ink = Color(0xFFF1EEE6),
        muted = Color(0xFFABA69C),
        line = Color(0xFF3A3730),
        accent = Color(0xFFFF7A4D),
        onAccent = Color(0xFF1A0A04),
        accentInk = Color(0xFFFF9673),
        positive = Color(0xFF7FD3A2),
        warning = Color(0xFFF2B45E),
        danger = Color(0xFFFF8F86),
        glassBorder = Color(0xFF3A3730),
    )
} else {
    Palette(
        dark = false,
        canvasTop = Color(0xFFF4F2EC),
        canvasBottom = Color(0xFFF4F2EC),
        surface = Color(0xFFFBF9F4),
        surfaceAlt = Color(0xFFEDEAE2),
        ink = Color(0xFF161513),
        muted = Color(0xFF5C5952),
        line = Color(0xFFBDB8AC),
        accent = Color(0xFFB32B08),
        onAccent = Color(0xFFFFFFFF),
        accentInk = Color(0xFFA8290A),
        positive = Color(0xFF1E6B45),
        warning = Color(0xFF8A5300),
        danger = Color(0xFFA31B12),
        glassBorder = Color(0xFFBDB8AC),
    )
}

private fun vectorPalette(dark: Boolean): Palette = if (dark) {
    Palette(
        dark = true,
        canvasTop = Color(0xFF050A06),
        canvasBottom = Color(0xFF050A06),
        surface = Color(0xFF0B120C),
        surfaceAlt = Color(0xFF101A11),
        ink = Color(0xFFD9FFC4),
        muted = Color(0xFF9BC08C),
        line = Color(0xFF2F4A26),
        accent = Color(0xFFB7FF4A),
        onAccent = Color(0xFF08210A),
        accentInk = Color(0xFFB7FF4A),
        positive = Color(0xFFB7FF4A),
        warning = Color(0xFFFFD84D),
        danger = Color(0xFFFF7A6B),
        glassBorder = Color(0xFF2F4A26),
    )
} else {
    Palette(
        dark = false,
        canvasTop = Color(0xFFCFE6B8),
        canvasBottom = Color(0xFFC4DEA9),
        surface = Color(0xFFE4F3D2),
        surfaceAlt = Color(0xFFD8ECC1),
        ink = Color(0xFF15240E),
        muted = Color(0xFF3F6132),
        line = Color(0xFF6E8F5B),
        accent = Color(0xFF2E7D16),
        onAccent = Color(0xFFF2FFE4),
        accentInk = Color(0xFF1F6B10),
        positive = Color(0xFF1F6B10),
        warning = Color(0xFF7A5200),
        danger = Color(0xFF8C1D12),
        glassBorder = Color(0xFF6E8F5B),
    )
}

private fun otakuPalette(dark: Boolean): Palette = if (dark) {
    Palette(
        dark = true,
        canvasTop = Color(0xFF1B1117),
        canvasBottom = Color(0xFF150C12),
        surface = Color(0xFF251821),
        surfaceAlt = Color(0xFF2E1D28),
        ink = Color(0xFFFFF2EA),
        muted = Color(0xFFD3AEBD),
        line = Color(0xFF000000),
        accent = Color(0xFFFF5C93),
        onAccent = Color(0xFF1B0A11),
        accentInk = Color(0xFFFF8FB4),
        positive = Color(0xFF7FE0A8),
        warning = Color(0xFFFFD84D),
        danger = Color(0xFFFF8F86),
        glassBorder = Color(0xFF000000),
    )
} else {
    Palette(
        dark = false,
        canvasTop = Color(0xFFFFF7EC),
        canvasBottom = Color(0xFFFFF1DF),
        surface = Color(0xFFFFFDF9),
        surfaceAlt = Color(0xFFFFF3E2),
        ink = Color(0xFF1B1015),
        muted = Color(0xFF6B505C),
        line = Color(0xFF1B1015),
        accent = Color(0xFFFF3D7F),
        onAccent = Color(0xFF1B1015),
        accentInk = Color(0xFFC2185B),
        positive = Color(0xFF1E7A4F),
        warning = Color(0xFF8A5300),
        danger = Color(0xFFA81E38),
        glassBorder = Color(0xFF1B1015),
    )
}

/* -------------------------------------------------------------------- formes */

private fun shapeScale(identity: BrandTokens.Theme): ShapeScale = when (identity) {
    BrandTokens.Theme.HALO -> ShapeScale(
        icon = CircleShape,
        card = RoundedCornerShape(26.dp),
        control = CircleShape,
        chip = RoundedCornerShape(percent = 50),
        field = RoundedCornerShape(18.dp),
        borderWidth = 1.dp,
        hardShadow = 0.dp,
        tilt = 0f,
    )

    BrandTokens.Theme.MONO -> ShapeScale(
        icon = RoundedCornerShape(2.dp),
        card = RoundedCornerShape(2.dp),
        control = RoundedCornerShape(2.dp),
        chip = RoundedCornerShape(2.dp),
        field = RoundedCornerShape(2.dp),
        borderWidth = 1.5.dp,
        hardShadow = 0.dp,
        tilt = 0f,
    )

    BrandTokens.Theme.VECTOR -> ShapeScale(
        icon = RoundedCornerShape(0.dp),
        card = RoundedCornerShape(0.dp),
        control = RoundedCornerShape(0.dp),
        chip = RoundedCornerShape(0.dp),
        field = RoundedCornerShape(0.dp),
        borderWidth = 2.dp,
        hardShadow = 4.dp,
        tilt = 0f,
    )

    BrandTokens.Theme.OTAKU -> ShapeScale(
        icon = CircleShape,
        card = RoundedCornerShape(16.dp),
        control = CircleShape,
        chip = RoundedCornerShape(6.dp),
        field = RoundedCornerShape(10.dp),
        borderWidth = 3.dp,
        hardShadow = 5.dp,
        tilt = -1.5f,
    )
}

/* --------------------------------------------------------------- typographie */

private fun typeScale(identity: BrandTokens.Theme): TypeScale = when (identity) {
    BrandTokens.Theme.HALO -> TypeScale(
        display = FontFamily.SansSerif,
        body = FontFamily.SansSerif,
        numeric = FontFamily.SansSerif,
        displayWeight = FontWeight.SemiBold,
        titleWeight = FontWeight.SemiBold,
        labelWeight = FontWeight.Bold,
        bodyWeight = FontWeight.Normal,
        labelTracking = 1.6.sp,
        caps = true,
        titleSize = 26.sp,
        timeSize = 40.sp,
        bodySize = 14.sp,
        lineHeight = 20.sp,
    )

    // Éditorial : titres capitales sans-serif, chiffres et libellés monospace.
    BrandTokens.Theme.MONO -> TypeScale(
        display = FontFamily.SansSerif,
        body = FontFamily.Monospace,
        numeric = FontFamily.Monospace,
        displayWeight = FontWeight.Medium,
        titleWeight = FontWeight.Medium,
        labelWeight = FontWeight.Bold,
        bodyWeight = FontWeight.Normal,
        labelTracking = 1.8.sp,
        caps = true,
        titleSize = 24.sp,
        timeSize = 42.sp,
        bodySize = 12.5.sp,
        lineHeight = 18.sp,
    )

    BrandTokens.Theme.VECTOR -> TypeScale(
        display = FontFamily.Monospace,
        body = FontFamily.Monospace,
        numeric = FontFamily.Monospace,
        displayWeight = FontWeight.Bold,
        titleWeight = FontWeight.Bold,
        labelWeight = FontWeight.Bold,
        bodyWeight = FontWeight.Normal,
        labelTracking = 1.4.sp,
        caps = true,
        titleSize = 20.sp,
        timeSize = 38.sp,
        bodySize = 12.5.sp,
        lineHeight = 19.sp,
    )

    // Manga : graisse maximale, interlettrage serré, capitales.
    BrandTokens.Theme.OTAKU -> TypeScale(
        display = FontFamily.SansSerif,
        body = FontFamily.SansSerif,
        numeric = FontFamily.SansSerif,
        displayWeight = FontWeight.Black,
        titleWeight = FontWeight.Black,
        labelWeight = FontWeight.ExtraBold,
        bodyWeight = FontWeight.Medium,
        labelTracking = 1.2.sp,
        caps = true,
        titleSize = 26.sp,
        timeSize = 40.sp,
        bodySize = 14.sp,
        lineHeight = 20.sp,
    )
}

/* ------------------------------------------------------------------ mouvement */

private fun motionScale(identity: BrandTokens.Theme): MotionScale = when (identity) {
    // Verre tranquille : long, adouci, anneau qui tourne lentement.
    BrandTokens.Theme.HALO -> MotionScale(
        fast = 160,
        base = 280,
        slow = 900,
        easing = CubicBezierEasing(0.22f, 0.9f, 0.24f, 1f),
        spinSeconds = 24,
        pulses = false,
        pressShift = 0.dp,
    )

    // Éditorial : sec, linéaire, aucun ornement mobile.
    BrandTokens.Theme.MONO -> MotionScale(
        fast = 120,
        base = 200,
        slow = 700,
        easing = LinearEasing,
        spinSeconds = 0,
        pulses = false,
        pressShift = 0.dp,
    )

    // Arcade : très court, linéaire, appui qui « s'enfonce » de 2 dp.
    BrandTokens.Theme.VECTOR -> MotionScale(
        fast = 90,
        base = 140,
        slow = 600,
        easing = LinearEasing,
        spinSeconds = 0,
        pulses = false,
        pressShift = 2.dp,
    )

    // Manga : rebond (ressort côté composants), halo pointillé qui tourne.
    BrandTokens.Theme.OTAKU -> MotionScale(
        fast = 140,
        base = 220,
        slow = 900,
        easing = FastOutSlowInEasing,
        spinSeconds = 18,
        pulses = true,
        pressShift = 2.dp,
    )
}

/* -------------------------------------------------------------------- thème */

/**
 * Construit le thème. [accentHex] vient de `BrandTokens.accent` (`#RRGGBB` ou
 * `null`). Un accent de marque est recalé automatiquement pour rester lisible :
 * le texte posé dessus et le texte coloré sur la surface passent AA (4,5:1) ou
 * retombent sur l'encre.
 */
fun brandTheme(
    identity: BrandTokens.Theme,
    dark: Boolean,
    accentHex: String? = BrandTokens.accent,
    reduceMotion: Boolean = false,
): BrandTheme {
    val base = when (identity) {
        BrandTokens.Theme.HALO -> haloPalette(dark)
        BrandTokens.Theme.MONO -> monoPalette(dark)
        BrandTokens.Theme.VECTOR -> vectorPalette(dark)
        BrandTokens.Theme.OTAKU -> otakuPalette(dark)
    }
    val override = accentHex?.let(::parseHexColor)
    val palette = if (override == null) {
        base
    } else {
        base.copy(
            accent = override,
            onAccent = readableInkOn(override),
            accentInk = ensureReadable(override, base.surface, base.ink),
        )
    }
    return BrandTheme(
        identity = identity,
        palette = palette,
        shapes = shapeScale(identity),
        type = typeScale(identity),
        motion = motionScale(identity),
        reduceMotion = reduceMotion,
    )
}

/** Durée effective : nulle quand l'utilisateur a demandé de réduire le mouvement. */
fun BrandTheme.duration(ms: Int): Int = if (reduceMotion) 0 else ms
