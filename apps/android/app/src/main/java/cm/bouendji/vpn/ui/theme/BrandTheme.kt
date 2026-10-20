package cm.bouendji.vpn.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.remember
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

/**
 * Thème courant. `static` : une identité ne change pas en cours d'écran — elle
 * est fixée au build, et seule l'apparence clair/sombre peut basculer.
 */
val LocalBrandTheme = staticCompositionLocalOf<BrandTheme> {
    error("LocalBrandTheme absent : envelopper l'écran dans BouendjiTheme.")
}

/**
 * Applique les jetons d'identité à Material 3 **et** expose [LocalBrandTheme]
 * aux composants qui ont besoin de la forme (anneau, ombre dure, trames).
 *
 * Material 3 ne sert ici que de plomberie (indication de clic, styles de texte,
 * champs) : aucun composant Material n'est utilisé pour la mise en page, car
 * quatre identités ne tiennent pas dans un seul jeu de rayons.
 */
@Composable
fun BouendjiTheme(theme: BrandTheme, content: @Composable () -> Unit) {
    val scheme = remember(theme) {
        val palette = theme.palette
        // Les surcharges communes ; `darkColorScheme`/`lightColorScheme` gardent
        // leurs valeurs par défaut pour tout ce que l'UI n'utilise pas.
        val onError = readableInkOn(palette.danger)
        if (palette.dark) {
            darkColorScheme(
                primary = palette.accent,
                onPrimary = palette.onAccent,
                primaryContainer = palette.surfaceAlt,
                onPrimaryContainer = palette.ink,
                secondary = palette.muted,
                onSecondary = palette.surface,
                background = palette.canvasTop,
                onBackground = palette.ink,
                surface = palette.surface,
                onSurface = palette.ink,
                surfaceVariant = palette.surfaceAlt,
                onSurfaceVariant = palette.muted,
                error = palette.danger,
                onError = onError,
                outline = palette.line,
                outlineVariant = palette.line,
            )
        } else {
            lightColorScheme(
                primary = palette.accent,
                onPrimary = palette.onAccent,
                primaryContainer = palette.surfaceAlt,
                onPrimaryContainer = palette.ink,
                secondary = palette.muted,
                onSecondary = palette.surface,
                background = palette.canvasTop,
                onBackground = palette.ink,
                surface = palette.surface,
                onSurface = palette.ink,
                surfaceVariant = palette.surfaceAlt,
                onSurfaceVariant = palette.muted,
                error = palette.danger,
                onError = onError,
                outline = palette.line,
                outlineVariant = palette.line,
            )
        }
    }

    val typography = remember(theme) {
        Typography(defaultFontFamily = theme.type.body)
    }

    val shapes = remember(theme) {
        Shapes(
            extraSmall = theme.shapes.chip,
            small = theme.shapes.icon,
            medium = theme.shapes.card,
            large = theme.shapes.card,
            extraLarge = theme.shapes.card,
        )
    }

    CompositionLocalProvider(LocalBrandTheme provides theme) {
        MaterialTheme(
            colorScheme = scheme,
            typography = typography,
            shapes = shapes,
            content = content,
        )
    }
}

/* --------------------------------------------------------------- styles de texte */

/** Titre d'écran. Capitales seulement pour Mono et Vector (jeton [TypeScale.caps]). */
fun BrandTheme.titleStyle(): TextStyle = TextStyle(
    fontFamily = type.display,
    fontSize = type.titleSize,
    lineHeight = type.titleSize * 1.12f,
    fontWeight = type.titleWeight,
    letterSpacing = if (type.caps) type.labelTracking / 2 else (-0.4).sp,
)

/** Étiquette capitale, très interlettrée. À passer en majuscules par l'appelant. */
fun BrandTheme.labelStyle(color: Color = palette.muted): TextStyle = TextStyle(
    fontFamily = if (type.caps) type.display else type.body,
    fontSize = 10.sp,
    lineHeight = 13.sp,
    fontWeight = type.labelWeight,
    letterSpacing = type.labelTracking,
    color = color,
)

/** Corps de texte. */
fun BrandTheme.bodyStyle(color: Color = palette.ink): TextStyle = TextStyle(
    fontFamily = type.body,
    fontSize = type.bodySize,
    lineHeight = type.lineHeight,
    fontWeight = type.bodyWeight,
    letterSpacing = if (type.caps) 0.2.sp else 0.sp,
    color = color,
)

/** Chiffres alignés — la minuterie ne doit pas tressaillir à chaque seconde. */
fun BrandTheme.timeStyle(color: Color = palette.ink, size: androidx.compose.ui.unit.TextUnit = type.timeSize): TextStyle = TextStyle(
    fontFamily = type.numeric,
    fontSize = size,
    lineHeight = size * 1.04f,
    fontWeight = type.displayWeight,
    fontFeatureSettings = "tnum",
    letterSpacing = if (type.caps) 0.6.sp else (-0.6).sp,
    color = color,
)

/** Petit texte fonctionnel (aide, mention légale). */
fun BrandTheme.captionStyle(color: Color = palette.muted): TextStyle = bodyStyle(color).copy(
    fontSize = (type.bodySize.value * 0.86f).sp,
    lineHeight = (type.lineHeight.value * 0.92f).sp,
    fontWeight = if (type.caps) FontWeight.Normal else type.bodyWeight,
)
