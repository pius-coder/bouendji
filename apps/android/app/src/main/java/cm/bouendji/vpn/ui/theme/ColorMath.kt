package cm.bouendji.vpn.ui.theme

import androidx.compose.ui.graphics.Color

/**
 * Contraste WCAG, calculé et non estimé.
 *
 * Les palettes des quatre identités ont été mesurées à la main (rapport du
 * lot UI) : le texte principal et le texte secondaire dépassent 4,5:1 dans les
 * deux apparences. Ces fonctions servent au seul cas qui échappe à la mesure
 * statique : un accent injecté au build (`BrandTokens.accent`), dont on ne
 * connaît pas la valeur à l'avance.
 */

private const val AA_NORMAL = 4.5

/** `#RRGGBB` ou `#AARRGGBB` ; `null` si la valeur n'est pas une couleur lisible. */
fun parseHexColor(raw: String?): Color? {
    if (raw == null) return null
    val text = raw.trim().removePrefix("#")
    if (text.length != 6 && text.length != 8) return null
    if (!text.all { it.isDigit() || it.lowercaseChar() in 'a'..'f' }) return null
    val value = text.toLongOrNull(16) ?: return null
    return if (text.length == 6) Color(0xFF000000L or value) else Color(value)
}

fun relativeLuminance(color: Color): Double {
    fun channel(value: Float): Double {
        val v = value.toDouble()
        return if (v <= 0.03928) v / 12.92 else Math.pow((v + 0.055) / 1.055, 2.4)
    }
    return 0.2126 * channel(color.red) +
        0.7152 * channel(color.green) +
        0.0722 * channel(color.blue)
}

fun contrastRatio(a: Color, b: Color): Double {
    val la = relativeLuminance(a)
    val lb = relativeLuminance(b)
    val high = maxOf(la, lb)
    val low = minOf(la, lb)
    return (high + 0.05) / (low + 0.05)
}

/**
 * Encre lisible sur un fond quelconque : blanc ou presque-noir, selon ce qui
 * offre le meilleur rapport. Utilisé pour le texte d'un bouton plein dont la
 * couleur vient de la marque.
 */
fun readableInkOn(background: Color): Color {
    val light = Color(0xFFFFFFFF)
    val dark = Color(0xFF0B1016)
    return if (contrastRatio(light, background) >= contrastRatio(dark, background)) light else dark
}

/** Garde [candidate] comme texte seulement s'il atteint AA sur [surface]. */
fun ensureReadable(candidate: Color, surface: Color, fallback: Color): Color =
    if (contrastRatio(candidate, surface) >= AA_NORMAL) candidate else fallback
