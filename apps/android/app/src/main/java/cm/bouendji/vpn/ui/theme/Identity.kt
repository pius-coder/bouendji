package cm.bouendji.vpn.ui.theme

import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import cm.bouendji.vpn.brand.BrandTokens

/**
 * Jetons de l'interface — calculés à partir de [BrandTokens.theme], lui-même
 * injecté au build (D30).
 *
 * Une identité n'est pas une palette : c'est un ensemble cohérent de couleurs,
 * de rayons, d'épaisseurs de trait et de familles typographiques. Changer
 * d'identité change la **forme**, pas seulement la teinte.
 *
 * Aucune police n'est embarquée : les familles système (sans, serif, mono)
 * suffisent aux quatre directions, et évitent 400 Ko de fichiers par marque.
 */
@Immutable
data class Palette(
    val canvas: Color,
    val canvasAlt: Color,
    val surface: Color,
    val surfaceStrong: Color,
    val ink: Color,
    val inkSoft: Color,
    val inkFaint: Color,
    val accent: Color,
    val accentInk: Color,
    val ok: Color,
    val warn: Color,
    val bad: Color,
    val line: Color,
    val glow: Color,
)

/** Rayons et épaisseurs : « réglable » veut dire lisible ici, pas dans un thème distant. */
@Immutable
data class Metrics(
    val radiusCard: Dp,
    val radiusChip: Dp,
    val radiusSheet: Dp,
    val border: Dp,
    val gutter: Dp,
    val control: Dp,
    val topBar: Dp,
)

@Immutable
data class TypeScale(
    val display: TextStyle,
    val title: TextStyle,
    val subtitle: TextStyle,
    val label: TextStyle,
    val body: TextStyle,
    val mono: TextStyle,
)

@Immutable
data class Identity(
    val theme: BrandTokens.Theme,
    val dark: Boolean,
    val palette: Palette,
    val metrics: Metrics,
    val type: TypeScale,
    /** Nom lisible de la direction, affiché dans les réglages. */
    val direction: String,
    /** Le contenu de la carte-repère : une phrase, pas un slogan creux. */
    val promise: String,
)

val LocalIdentity = staticCompositionLocalOf<Identity> {
    error("Identity absente : envelopper l'écran dans ProvideIdentity.")
}

/**
 * Construit l'identité effective.
 *
 * [accentHex] vient de `BrandTokens.accent` : une marque peut imposer sa
 * couleur sans changer de direction visuelle.
 */
fun identityFor(
    theme: BrandTokens.Theme,
    dark: Boolean,
    accentHex: String? = BrandTokens.accent,
): Identity {
    val base = paletteFor(theme, dark)
    val accent = accentHex?.let(::parseColor)
    return Identity(
        theme = theme,
        dark = dark,
        palette = if (accent == null) base else base.copy(accent = accent),
        metrics = metricsFor(theme),
        type = typeFor(theme, base),
        direction = when (theme) {
            BrandTokens.Theme.HALO -> "Halo — verre dépoli"
            BrandTokens.Theme.MONO -> "Mono — éditorial"
            BrandTokens.Theme.VECTOR -> "Vector — tube cathodique"
            BrandTokens.Theme.OTAKU -> "Otaku — manga"
        },
        promise = when (theme) {
            BrandTokens.Theme.HALO -> "La lumière passe. Le tunnel reste."
            BrandTokens.Theme.MONO -> "Rien à cacher, rien à montrer."
            BrandTokens.Theme.VECTOR -> "Le signal, sans le bruit."
            BrandTokens.Theme.OTAKU -> "Ton réseau, ton arc narratif."
        },
    )
}

private fun parseColor(hex: String): Color? = runCatching {
    val clean = hex.trim().removePrefix("#")
    require(clean.length == 6)
    Color(0xFF000000L or clean.toLong(16))
}.getOrNull()

private fun paletteFor(theme: BrandTokens.Theme, dark: Boolean): Palette = when (theme) {
    BrandTokens.Theme.HALO -> if (dark) Palette(
        canvas = Color(0xFF070A12),
        canvasAlt = Color(0xFF0B1120),
        surface = Color(0xE6121A2B),
        surfaceStrong = Color(0xF21A2438),
        ink = Color(0xFFF3F7FF),
        inkSoft = Color(0xFFA9B6CE),
        inkFaint = Color(0xFF6B7896),
        accent = Color(0xFF0A7CFF),
        accentInk = Color(0xFFFFFFFF),
        ok = Color(0xFF5BE0A8),
        warn = Color(0xFFFFC46B),
        bad = Color(0xFFFF7A8A),
        line = Color(0x1FFFFFFF),
        glow = Color(0x660A7CFF),
    ) else Palette(
        canvas = Color(0xFFEDF1F8),
        canvasAlt = Color(0xFFE2E9F5),
        surface = Color(0xF2FFFFFF),
        surfaceStrong = Color(0xFFFFFFFF),
        ink = Color(0xFF0A1020),
        inkSoft = Color(0xFF54607A),
        inkFaint = Color(0xFF8A94AA),
        accent = Color(0xFF0A7CFF),
        accentInk = Color(0xFFFFFFFF),
        ok = Color(0xFF0E9E6E),
        warn = Color(0xFFA96B00),
        bad = Color(0xFFC93048),
        line = Color(0x14000000),
        glow = Color(0x330A7CFF),
    )

    BrandTokens.Theme.MONO -> if (dark) Palette(
        canvas = Color(0xFF0B0B0B),
        canvasAlt = Color(0xFF111111),
        surface = Color(0xFF141414),
        surfaceStrong = Color(0xFF1C1C1C),
        ink = Color(0xFFF4F1EA),
        inkSoft = Color(0xFF9E9A91),
        inkFaint = Color(0xFF6A665F),
        accent = Color(0xFFF4F1EA),
        accentInk = Color(0xFF0B0B0B),
        ok = Color(0xFF9ED8A4),
        warn = Color(0xFFE3C07A),
        bad = Color(0xFFE2857F),
        line = Color(0xFF2A2A2A),
        glow = Color(0x00FFFFFF),
    ) else Palette(
        canvas = Color(0xFFF6F3EC),
        canvasAlt = Color(0xFFEFEAE0),
        surface = Color(0xFFFFFEFA),
        surfaceStrong = Color(0xFFFFFFFF),
        ink = Color(0xFF141210),
        inkSoft = Color(0xFF5B574F),
        inkFaint = Color(0xFF8C877C),
        accent = Color(0xFF141210),
        accentInk = Color(0xFFF6F3EC),
        ok = Color(0xFF2C6E49),
        warn = Color(0xFF8A5A00),
        bad = Color(0xFF9B2C2C),
        line = Color(0xFFDDD6C7),
        glow = Color(0x00FFFFFF),
    )

    BrandTokens.Theme.VECTOR -> if (dark) Palette(
        canvas = Color(0xFF04070A),
        canvasAlt = Color(0xFF06120D),
        surface = Color(0xFF08130F),
        surfaceStrong = Color(0xFF0C1B15),
        ink = Color(0xFFC9FFDA),
        inkSoft = Color(0xFF6FBF8B),
        inkFaint = Color(0xFF3F7A57),
        accent = Color(0xFF39FF88),
        accentInk = Color(0xFF04120A),
        ok = Color(0xFF39FF88),
        warn = Color(0xFFFFD166),
        bad = Color(0xFFFF5C5C),
        line = Color(0xFF14301F),
        glow = Color(0x5539FF88),
    ) else Palette(
        canvas = Color(0xFFE9F6ED),
        canvasAlt = Color(0xFFDCEFE2),
        surface = Color(0xFFF3FCF6),
        surfaceStrong = Color(0xFFFFFFFF),
        ink = Color(0xFF0A2415),
        inkSoft = Color(0xFF356B49),
        inkFaint = Color(0xFF6C9A7C),
        accent = Color(0xFF0E8F4A),
        accentInk = Color(0xFFEAFBF0),
        ok = Color(0xFF0E8F4A),
        warn = Color(0xFF8A6100),
        bad = Color(0xFFB03030),
        line = Color(0xFFB9DCC5),
        glow = Color(0x330E8F4A),
    )

    BrandTokens.Theme.OTAKU -> if (dark) Palette(
        canvas = Color(0xFF101014),
        canvasAlt = Color(0xFF16161C),
        surface = Color(0xFF1A1A22),
        surfaceStrong = Color(0xFF22222C),
        ink = Color(0xFFFAFAFA),
        inkSoft = Color(0xFFA6A6B4),
        inkFaint = Color(0xFF6E6E7E),
        accent = Color(0xFFFF4D7D),
        accentInk = Color(0xFF1A0A10),
        ok = Color(0xFF57E2A0),
        warn = Color(0xFFFFC24B),
        bad = Color(0xFFFF5B5B),
        line = Color(0xFF33333F),
        glow = Color(0x66FF4D7D),
    ) else Palette(
        canvas = Color(0xFFFDFDFD),
        canvasAlt = Color(0xFFF2F2F4),
        surface = Color(0xFFFFFFFF),
        surfaceStrong = Color(0xFFFFFFFF),
        ink = Color(0xFF0B0B0B),
        inkSoft = Color(0xFF585864),
        inkFaint = Color(0xFF8A8A96),
        accent = Color(0xFFFF3B6B),
        accentInk = Color(0xFFFFFFFF),
        ok = Color(0xFF128F5B),
        warn = Color(0xFF9A6A00),
        bad = Color(0xFFC0283F),
        line = Color(0xFF0B0B0B),
        glow = Color(0x33FF3B6B),
    )
}

private fun metricsFor(theme: BrandTokens.Theme): Metrics = when (theme) {
    BrandTokens.Theme.HALO -> Metrics(
        radiusCard = 28.dp,
        radiusChip = 999.dp,
        radiusSheet = 32.dp,
        border = 1.dp,
        gutter = 20.dp,
        control = 268.dp,
        topBar = 64.dp,
    )

    BrandTokens.Theme.MONO -> Metrics(
        radiusCard = 2.dp,
        radiusChip = 2.dp,
        radiusSheet = 2.dp,
        border = 1.dp,
        gutter = 24.dp,
        control = 252.dp,
        topBar = 72.dp,
    )

    BrandTokens.Theme.VECTOR -> Metrics(
        radiusCard = 4.dp,
        radiusChip = 2.dp,
        radiusSheet = 6.dp,
        border = 1.dp,
        gutter = 16.dp,
        control = 256.dp,
        topBar = 56.dp,
    )

    BrandTokens.Theme.OTAKU -> Metrics(
        radiusCard = 20.dp,
        radiusChip = 999.dp,
        radiusSheet = 28.dp,
        border = 3.dp,
        gutter = 18.dp,
        control = 272.dp,
        topBar = 68.dp,
    )
}

private fun typeFor(theme: BrandTokens.Theme, palette: Palette): TypeScale = when (theme) {
    BrandTokens.Theme.HALO -> TypeScale(
        display = TextStyle(
            fontFamily = FontFamily.SansSerif,
            fontWeight = FontWeight(640),
            fontSize = 34.sp,
            letterSpacing = (-0.7).sp,
        ),
        title = TextStyle(
            fontFamily = FontFamily.SansSerif,
            fontWeight = FontWeight(640),
            fontSize = 27.sp,
            letterSpacing = (-0.9).sp,
        ),
        subtitle = TextStyle(
            fontFamily = FontFamily.SansSerif,
            fontWeight = FontWeight.Normal,
            fontSize = 14.sp,
        ),
        label = TextStyle(
            fontFamily = FontFamily.SansSerif,
            fontWeight = FontWeight.Medium,
            fontSize = 10.sp,
            letterSpacing = 1.8.sp,
        ),
        body = TextStyle(
            fontFamily = FontFamily.SansSerif,
            fontWeight = FontWeight.Normal,
            fontSize = 14.sp,
            lineHeight = 21.sp,
        ),
        mono = TextStyle(
            fontFamily = FontFamily.Monospace,
            fontWeight = FontWeight.Normal,
            fontSize = 12.sp,
            letterSpacing = 0.4.sp,
        ),
    )

    BrandTokens.Theme.MONO -> TypeScale(
        display = TextStyle(
            fontFamily = FontFamily.Serif,
            fontWeight = FontWeight.Normal,
            fontSize = 38.sp,
            letterSpacing = (-0.8).sp,
        ),
        title = TextStyle(
            fontFamily = FontFamily.Serif,
            fontWeight = FontWeight.Normal,
            fontSize = 20.sp,
            letterSpacing = (-0.2).sp,
        ),
        subtitle = TextStyle(
            fontFamily = FontFamily.SansSerif,
            fontWeight = FontWeight.Normal,
            fontSize = 13.sp,
        ),
        label = TextStyle(
            fontFamily = FontFamily.SansSerif,
            fontWeight = FontWeight.Medium,
            fontSize = 9.sp,
            letterSpacing = 2.4.sp,
        ),
        body = TextStyle(
            fontFamily = FontFamily.SansSerif,
            fontWeight = FontWeight.Normal,
            fontSize = 14.sp,
            lineHeight = 22.sp,
        ),
        mono = TextStyle(
            fontFamily = FontFamily.Monospace,
            fontWeight = FontWeight.Normal,
            fontSize = 11.sp,
            letterSpacing = 0.6.sp,
        ),
    )

    BrandTokens.Theme.VECTOR -> TypeScale(
        display = TextStyle(
            fontFamily = FontFamily.Monospace,
            fontWeight = FontWeight.Normal,
            fontSize = 36.sp,
            letterSpacing = 1.sp,
        ),
        title = TextStyle(
            fontFamily = FontFamily.Monospace,
            fontWeight = FontWeight.Bold,
            fontSize = 17.sp,
            letterSpacing = 0.8.sp,
        ),
        subtitle = TextStyle(
            fontFamily = FontFamily.Monospace,
            fontWeight = FontWeight.Normal,
            fontSize = 12.sp,
        ),
        label = TextStyle(
            fontFamily = FontFamily.Monospace,
            fontWeight = FontWeight.Medium,
            fontSize = 9.sp,
            letterSpacing = 1.6.sp,
        ),
        body = TextStyle(
            fontFamily = FontFamily.Monospace,
            fontWeight = FontWeight.Normal,
            fontSize = 12.sp,
            lineHeight = 19.sp,
        ),
        mono = TextStyle(
            fontFamily = FontFamily.Monospace,
            fontWeight = FontWeight.Normal,
            fontSize = 11.sp,
            letterSpacing = 0.2.sp,
        ),
    )

    BrandTokens.Theme.OTAKU -> TypeScale(
        display = TextStyle(
            fontFamily = FontFamily.SansSerif,
            fontWeight = FontWeight.Black,
            fontSize = 40.sp,
            letterSpacing = (-1).sp,
            fontStyle = FontStyle.Italic,
        ),
        title = TextStyle(
            fontFamily = FontFamily.SansSerif,
            fontWeight = FontWeight.Black,
            fontSize = 22.sp,
            letterSpacing = (-0.4).sp,
        ),
        subtitle = TextStyle(
            fontFamily = FontFamily.SansSerif,
            fontWeight = FontWeight.Medium,
            fontSize = 13.sp,
        ),
        label = TextStyle(
            fontFamily = FontFamily.SansSerif,
            fontWeight = FontWeight.Black,
            fontSize = 10.sp,
            letterSpacing = 1.2.sp,
        ),
        body = TextStyle(
            fontFamily = FontFamily.SansSerif,
            fontWeight = FontWeight.Normal,
            fontSize = 14.sp,
            lineHeight = 21.sp,
        ),
        mono = TextStyle(
            fontFamily = FontFamily.Monospace,
            fontWeight = FontWeight.Medium,
            fontSize = 11.sp,
        ),
    )
}
