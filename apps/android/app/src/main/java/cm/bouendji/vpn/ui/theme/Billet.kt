package cm.bouendji.vpn.ui.theme

import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import cm.bouendji.vpn.brand.BrandTokens

/**
 * Design system « Le Billet » (prototype lelexxl2a2, `css/styles.css`), D91.
 *
 * Une seule mise en page pour toutes les marques ; seule la palette change avec
 * la communauté (thème injecté au build, D2/D30). Les noms suivent les variables
 * CSS du prototype pour qu'un écart se relise d'un fichier à l'autre.
 */
@Immutable
data class Tokens(
    val dark: Boolean,
    val bg: Color,
    val surface: Color,
    val surfaceElev: Color,
    val fill: Color,
    val separator: Color,
    val label: Color,
    val label2: Color,
    val label3: Color,
    val accent: Color,
    val accentText: Color,
    val accentSoft: Color,
    val accentGlow: Color,
    val onAccent: Color,
    val mint: Color,
    val gold: Color,
    val goldText: Color,
    val goldSoft: Color,
    val danger: Color,
    val dangerSoft: Color,
    val warning: Color,
    val inkIcon: Color,
    val guilloche: Color,
    val guillocheOn: Color,
    val noteStart: Color,
    val noteEnd: Color,
    val noteInk: Color,
    val noteLine: Color,
    val noteEdge: Color,
    val glassStrong: Color,
    val hud: Color,
    val onHud: Color,
    val scrim: Color,
)

object Fonts {
    /** Fraunces dans le prototype ; serif système ici, sans téléchargement de police. */
    val display: FontFamily = FontFamily.Serif
    val mono: FontFamily = FontFamily.Monospace
}

val LocalTokens = staticCompositionLocalOf { tokensFor(BrandTokens.Theme.BILLET, dark = false, accentHex = null) }

/** Graine d'une palette : le reste (remplissages, séparateurs, billet) en découle. */
private data class Seed(
    val bg: Color,
    val surface: Color,
    val surfaceElev: Color,
    val ink: Color,
    val accent: Color,
    val accentText: Color,
    val onAccent: Color,
    val mint: Color,
    val gold: Color,
    val goldText: Color,
    val danger: Color,
    val inkIcon: Color,
    val noteStart: Color,
    val noteEnd: Color,
    val noteInk: Color,
)

fun tokensFor(theme: BrandTokens.Theme, dark: Boolean, accentHex: String?): Tokens {
    val seed = seedFor(theme, dark)
    val accent = accentHex?.let(::parseHex) ?: seed.accent
    val accentText = if (accentHex != null) accent else seed.accentText
    val ink = seed.ink
    return Tokens(
        dark = dark,
        bg = seed.bg,
        surface = seed.surface,
        surfaceElev = seed.surfaceElev,
        fill = ink.copy(alpha = if (dark) .09f else .07f),
        separator = ink.copy(alpha = if (dark) .11f else .13f),
        label = ink,
        label2 = ink.copy(alpha = .62f),
        label3 = ink.copy(alpha = if (dark) .34f else .36f),
        accent = accent,
        accentText = accentText,
        accentSoft = accent.copy(alpha = if (dark) .15f else .11f),
        accentGlow = accent.copy(alpha = if (dark) .30f else .32f),
        onAccent = seed.onAccent,
        mint = seed.mint,
        gold = seed.gold,
        goldText = seed.goldText,
        goldSoft = seed.gold.copy(alpha = if (dark) .16f else .14f),
        danger = seed.danger,
        dangerSoft = seed.danger.copy(alpha = if (dark) .14f else .12f),
        warning = Color(0xFFB7791F),
        inkIcon = seed.inkIcon,
        guilloche = accent.copy(alpha = if (dark) .20f else .30f),
        guillocheOn = accent.copy(alpha = if (dark) .55f else .62f),
        noteStart = seed.noteStart,
        noteEnd = seed.noteEnd,
        noteInk = seed.noteInk,
        noteLine = seed.noteInk.copy(alpha = if (dark) .20f else .26f),
        noteEdge = seed.noteInk.copy(alpha = if (dark) .20f else .22f),
        glassStrong = if (dark) seed.surface.copy(alpha = .86f) else seed.surfaceElev.copy(alpha = .86f),
        hud = if (dark) ink.copy(alpha = .94f) else ink.copy(alpha = .92f),
        onHud = seed.bg,
        scrim = if (dark) Color.Black.copy(alpha = .5f) else Color(0xFF0A120D).copy(alpha = .32f),
    )
}

private fun seedFor(theme: BrandTokens.Theme, dark: Boolean): Seed = when (theme) {
    // Valeurs exactes du prototype (`:root` et `[data-theme="dark"]`).
    BrandTokens.Theme.BILLET -> if (dark) Seed(
        bg = Color(0xFF0B100D), surface = Color(0xFF151C17), surfaceElev = Color(0xFF202923),
        ink = Color(0xFFEEF2EC), accent = Color(0xFF8CC56E), accentText = Color(0xFFA6D68C),
        onAccent = Color(0xFF0B1A10), mint = Color(0xFF5E9445), gold = Color(0xFFC9A24E),
        goldText = Color(0xFFDDBA6A), danger = Color(0xFFFF6B57), inkIcon = Color(0xFF4A5A4F),
        noteStart = Color(0xFF1B2D20), noteEnd = Color(0xFF0F1D14), noteInk = Color(0xFFC3E5AE),
    ) else Seed(
        bg = Color(0xFFF6F4EC), surface = Color(0xFFFFFEFA), surfaceElev = Color(0xFFFFFFFF),
        ink = Color(0xFF121A15), accent = Color(0xFF1E6B41), accentText = Color(0xFF175634),
        onAccent = Color.White, mint = Color(0xFF6FA552), gold = Color(0xFFA8822E),
        goldText = Color(0xFF87661F), danger = Color(0xFFC2412D), inkIcon = Color(0xFF2E3D33),
        noteStart = Color(0xFFE7EFDC), noteEnd = Color(0xFFD3E3C5), noteInk = Color(0xFF164A2B),
    )
    // Halo : bleu verre dépoli (identité Halo v2).
    BrandTokens.Theme.HALO -> if (dark) Seed(
        bg = Color(0xFF070A12), surface = Color(0xFF111827), surfaceElev = Color(0xFF1B2436),
        ink = Color(0xFFF3F7FF), accent = Color(0xFF4C9BFF), accentText = Color(0xFF7DB6FF),
        onAccent = Color(0xFF041026), mint = Color(0xFF38BDF8), gold = Color(0xFFC9A24E),
        goldText = Color(0xFFDDBA6A), danger = Color(0xFFFF6B6B), inkIcon = Color(0xFF3B4A66),
        noteStart = Color(0xFF15233D), noteEnd = Color(0xFF0B1426), noteInk = Color(0xFFBBD7FF),
    ) else Seed(
        bg = Color(0xFFEDF1F8), surface = Color(0xFFFFFFFF), surfaceElev = Color(0xFFFFFFFF),
        ink = Color(0xFF0A1020), accent = Color(0xFF0A6CE0), accentText = Color(0xFF0A5BC0),
        onAccent = Color.White, mint = Color(0xFF0EA5E9), gold = Color(0xFFA8822E),
        goldText = Color(0xFF87661F), danger = Color(0xFFC9302C), inkIcon = Color(0xFF2A3550),
        noteStart = Color(0xFFDCE8FB), noteEnd = Color(0xFFC6D9F5), noteInk = Color(0xFF0B3470),
    )
    // Mono : éditorial noir et papier.
    BrandTokens.Theme.MONO -> if (dark) Seed(
        bg = Color(0xFF0B0B0B), surface = Color(0xFF151515), surfaceElev = Color(0xFF1F1F1F),
        ink = Color(0xFFF4F1EA), accent = Color(0xFFF4F1EA), accentText = Color(0xFFF4F1EA),
        onAccent = Color(0xFF0B0B0B), mint = Color(0xFFA3A3A3), gold = Color(0xFFC8B98F),
        goldText = Color(0xFFD9CCA6), danger = Color(0xFFFF6B57), inkIcon = Color(0xFF3A3A3A),
        noteStart = Color(0xFF222222), noteEnd = Color(0xFF141414), noteInk = Color(0xFFEDE7DA),
    ) else Seed(
        bg = Color(0xFFF6F3EC), surface = Color(0xFFFFFEFA), surfaceElev = Color(0xFFFFFFFF),
        ink = Color(0xFF141210), accent = Color(0xFF141210), accentText = Color(0xFF141210),
        onAccent = Color(0xFFF6F3EC), mint = Color(0xFF6B6B6B), gold = Color(0xFF8A7444),
        goldText = Color(0xFF6E5C35), danger = Color(0xFFB3261E), inkIcon = Color(0xFF3A3632),
        noteStart = Color(0xFFEDE8DC), noteEnd = Color(0xFFDDD6C6), noteInk = Color(0xFF2A2621),
    )
    // Vector : vert phosphore.
    BrandTokens.Theme.VECTOR -> if (dark) Seed(
        bg = Color(0xFF04070A), surface = Color(0xFF08130F), surfaceElev = Color(0xFF0F1F18),
        ink = Color(0xFFC9FFDA), accent = Color(0xFF39FF88), accentText = Color(0xFF6BFFA6),
        onAccent = Color(0xFF02140A), mint = Color(0xFF22C55E), gold = Color(0xFFE6D36A),
        goldText = Color(0xFFF0E08A), danger = Color(0xFFFF5C5C), inkIcon = Color(0xFF1F3A2C),
        noteStart = Color(0xFF0C2418), noteEnd = Color(0xFF06140D), noteInk = Color(0xFF8DFFB8),
    ) else Seed(
        bg = Color(0xFFE9F6ED), surface = Color(0xFFF3FCF6), surfaceElev = Color(0xFFFFFFFF),
        ink = Color(0xFF0A2415), accent = Color(0xFF0E8F4A), accentText = Color(0xFF0B7038),
        onAccent = Color.White, mint = Color(0xFF16A34A), gold = Color(0xFF8F7A1E),
        goldText = Color(0xFF6F5F14), danger = Color(0xFFB03030), inkIcon = Color(0xFF1E3A2A),
        noteStart = Color(0xFFD6F0DF), noteEnd = Color(0xFFBFE5CC), noteInk = Color(0xFF0A4A26),
    )
    // Otaku : rose vif, contraste manga.
    BrandTokens.Theme.OTAKU -> if (dark) Seed(
        bg = Color(0xFF101014), surface = Color(0xFF1A1A22), surfaceElev = Color(0xFF24242E),
        ink = Color(0xFFFAFAFA), accent = Color(0xFFFF4D7D), accentText = Color(0xFFFF7A9C),
        onAccent = Color(0xFF1A0610), mint = Color(0xFF8B5CF6), gold = Color(0xFFFACC15),
        goldText = Color(0xFFFDE047), danger = Color(0xFFFF5B5B), inkIcon = Color(0xFF3A3A48),
        noteStart = Color(0xFF2A1420), noteEnd = Color(0xFF180B12), noteInk = Color(0xFFFFC2D3),
    ) else Seed(
        bg = Color(0xFFFDFDFD), surface = Color(0xFFFFFFFF), surfaceElev = Color(0xFFFFFFFF),
        ink = Color(0xFF0B0B0B), accent = Color(0xFFE11D5A), accentText = Color(0xFFC0184C),
        onAccent = Color.White, mint = Color(0xFF7C3AED), gold = Color(0xFFB7791F),
        goldText = Color(0xFF8F5E14), danger = Color(0xFFC0283F), inkIcon = Color(0xFF2B2B33),
        noteStart = Color(0xFFFFE4EC), noteEnd = Color(0xFFFFCCDA), noteInk = Color(0xFF7A0E30),
    )
    // Sahel : terre cuite, ocre, indigo.
    BrandTokens.Theme.SAHEL -> if (dark) Seed(
        bg = Color(0xFF1A0F0A), surface = Color(0xFF26170F), surfaceElev = Color(0xFF332015),
        ink = Color(0xFFFBEBDD), accent = Color(0xFFF08A3E), accentText = Color(0xFFF6A867),
        onAccent = Color(0xFF241005), mint = Color(0xFF5B7BD5), gold = Color(0xFFE8B34B),
        goldText = Color(0xFFF2C76E), danger = Color(0xFFFF6B57), inkIcon = Color(0xFF5A3A28),
        noteStart = Color(0xFF3A1F12), noteEnd = Color(0xFF22130B), noteInk = Color(0xFFFFCFA3),
    ) else Seed(
        bg = Color(0xFFFBF3EA), surface = Color(0xFFFFFBF6), surfaceElev = Color(0xFFFFFFFF),
        ink = Color(0xFF2A160B), accent = Color(0xFFC2541B), accentText = Color(0xFFA44514),
        onAccent = Color.White, mint = Color(0xFF2F4FA8), gold = Color(0xFFB7801F),
        goldText = Color(0xFF8F6114), danger = Color(0xFFB3261E), inkIcon = Color(0xFF4A2C1B),
        noteStart = Color(0xFFF8DFC7), noteEnd = Color(0xFFF0C9A4), noteInk = Color(0xFF6E2C0C),
    )
    // Nebula : violet profond, magenta, poussière d'étoiles.
    BrandTokens.Theme.NEBULA -> if (dark) Seed(
        bg = Color(0xFF0B0716), surface = Color(0xFF151027), surfaceElev = Color(0xFF1F1838),
        ink = Color(0xFFF2EDFF), accent = Color(0xFFA78BFA), accentText = Color(0xFFC4B5FD),
        onAccent = Color(0xFF14082E), mint = Color(0xFFF472B6), gold = Color(0xFFFDE68A),
        goldText = Color(0xFFFEF3C7), danger = Color(0xFFFF6B8B), inkIcon = Color(0xFF3B2F5C),
        noteStart = Color(0xFF2A1B4F), noteEnd = Color(0xFF150D2B), noteInk = Color(0xFFD9CCFF),
    ) else Seed(
        bg = Color(0xFFF3F0FB), surface = Color(0xFFFFFFFF), surfaceElev = Color(0xFFFFFFFF),
        ink = Color(0xFF160E2E), accent = Color(0xFF6D28D9), accentText = Color(0xFF5B21B6),
        onAccent = Color.White, mint = Color(0xFFDB2777), gold = Color(0xFFB7791F),
        goldText = Color(0xFF8F5E14), danger = Color(0xFFBE123C), inkIcon = Color(0xFF2E2350),
        noteStart = Color(0xFFE6DDFB), noteEnd = Color(0xFFD3C4F7), noteInk = Color(0xFF3B1782),
    )
    // Glacier : blanc de neige, cyan glacé, bleu nuit.
    BrandTokens.Theme.GLACIER -> if (dark) Seed(
        bg = Color(0xFF06131C), surface = Color(0xFF0C1E2B), surfaceElev = Color(0xFF13293A),
        ink = Color(0xFFEAF8FF), accent = Color(0xFF5CE1FF), accentText = Color(0xFF8DEBFF),
        onAccent = Color(0xFF02161F), mint = Color(0xFFA5F3FC), gold = Color(0xFFCBD5E1),
        goldText = Color(0xFFE2E8F0), danger = Color(0xFFFF7A7A), inkIcon = Color(0xFF26445A),
        noteStart = Color(0xFF12324A), noteEnd = Color(0xFF0A1C2A), noteInk = Color(0xFFCFF4FF),
    ) else Seed(
        bg = Color(0xFFF2F9FC), surface = Color(0xFFFFFFFF), surfaceElev = Color(0xFFFFFFFF),
        ink = Color(0xFF0B2233), accent = Color(0xFF0891B2), accentText = Color(0xFF0E7490),
        onAccent = Color.White, mint = Color(0xFF06B6D4), gold = Color(0xFF64748B),
        goldText = Color(0xFF475569), danger = Color(0xFFC0283F), inkIcon = Color(0xFF1E3A4C),
        noteStart = Color(0xFFDDF3FA), noteEnd = Color(0xFFC3E7F3), noteInk = Color(0xFF0B4A5E),
    )
    // Ligne (Solo) : blanc, bleu #0A5CF0 ; en sombre l'accent passe à #4D8BFF (spec §1, §5).
    BrandTokens.Theme.LIGNE -> if (dark) Seed(
        bg = Color(0xFF070B14), surface = Color(0xFF111827), surfaceElev = Color(0xFF111827),
        ink = Color(0xFFEEF2FA), accent = Color(0xFF4D8BFF), accentText = Color(0xFF4D8BFF),
        onAccent = Color(0xFF070B14), mint = Color(0xFF12805C), gold = Color(0xFF9AA4B8),
        goldText = Color(0xFF9AA4B8), danger = Color(0xFFD92D20), inkIcon = Color(0xFF9AA4B8),
        noteStart = Color(0xFF111827), noteEnd = Color(0xFF111827), noteInk = Color(0xFFEEF2FA),
    ) else Seed(
        bg = Color(0xFFFFFFFF), surface = Color(0xFFF5F7FB), surfaceElev = Color(0xFFFFFFFF),
        ink = Color(0xFF0B1220), accent = Color(0xFF0A5CF0), accentText = Color(0xFF0848BF),
        onAccent = Color.White, mint = Color(0xFF12805C), gold = Color(0xFF5A6478),
        goldText = Color(0xFF5A6478), danger = Color(0xFFD92D20), inkIcon = Color(0xFF5A6478),
        noteStart = Color(0xFFE6EEFE), noteEnd = Color(0xFFE6EEFE), noteInk = Color(0xFF0B1220),
    )
}

private fun parseHex(hex: String): Color? = runCatching {
    Color(android.graphics.Color.parseColor(hex))
}.getOrNull()
