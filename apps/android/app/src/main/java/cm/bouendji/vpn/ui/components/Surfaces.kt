package cm.bouendji.vpn.ui.components

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import cm.bouendji.vpn.brand.BrandTokens
import cm.bouendji.vpn.ui.theme.BrandTheme
import cm.bouendji.vpn.ui.theme.LocalBrandTheme
import cm.bouendji.vpn.ui.theme.bodyStyle
import cm.bouendji.vpn.ui.theme.brandTween
import cm.bouendji.vpn.ui.theme.captionStyle
import cm.bouendji.vpn.ui.theme.labelStyle
import cm.bouendji.vpn.ui.theme.titleStyle
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.sin

/* ------------------------------------------------------------------ fond */

/**
 * Fond d'écran de l'identité : dégradé + motif propre.
 *
 * Aucune image : les halos, filets, trames et points sont dessinés. Chaque
 * motif est statique sauf indication contraire, donc il ne provoque pas de
 * redessin permanent.
 */
@Composable
fun BrandBackground(modifier: Modifier = Modifier, content: @Composable BoxScope.() -> Unit) {
    val theme = LocalBrandTheme.current
    val palette = theme.palette
    Box(
        modifier = modifier
            .fillMaxSize()
            .background(Brush.verticalGradient(listOf(palette.canvasTop, palette.canvasBottom))),
    ) {
        IdentityPattern(theme)
        content()
    }
}

@Composable
private fun IdentityPattern(theme: BrandTheme) {
    val palette = theme.palette
    Canvas(modifier = Modifier.fillMaxSize()) {
        when (theme.identity) {
            BrandTokens.Theme.HALO -> {
                val tint = if (palette.dark) 0.26f else 0.5f
                blob(palette.accent.copy(alpha = tint), Offset(size.width * 0.05f, size.height * 0.02f), size.width * 0.9f)
                blob(palette.accentInk.copy(alpha = tint * 0.7f), Offset(size.width * 1.02f, size.height * 0.22f), size.width * 0.8f)
                blob(palette.accent.copy(alpha = tint * 0.55f), Offset(size.width * 0.2f, size.height * 1.02f), size.width * 0.95f)
            }

            // Grille éditoriale : quatre colonnes, comme une page de journal.
            BrandTokens.Theme.MONO -> {
                val step = size.width / 4f
                var x = step
                while (x < size.width) {
                    drawLine(
                        color = palette.line.copy(alpha = 0.5f),
                        start = Offset(x, 0f),
                        end = Offset(x, size.height),
                        strokeWidth = 1.dp.toPx(),
                    )
                    x += step
                }
            }

            // Trame de balayage cathodique.
            BrandTokens.Theme.VECTOR -> {
                val gap = 4.dp.toPx()
                var y = 0f
                while (y < size.height) {
                    drawLine(
                        color = palette.accent.copy(alpha = 0.07f),
                        start = Offset(0f, y),
                        end = Offset(size.width, y),
                        strokeWidth = 2.dp.toPx(),
                    )
                    y += gap
                }
            }

            // Trame de points en bas, éclat d'encre en haut à droite.
            BrandTokens.Theme.OTAKU -> {
                val gap = 9.dp.toPx()
                val radius = 1.dp.toPx()
                var y = size.height * 0.42f
                while (y < size.height) {
                    var x = 0f
                    while (x < size.width) {
                        drawCircle(palette.ink.copy(alpha = 0.10f), radius, Offset(x, y))
                        x += gap
                    }
                    y += gap
                }
                var angle = 100
                while (angle <= 172) {
                    val radians = angle * PI / 180.0
                    drawLine(
                        color = palette.accent.copy(alpha = 0.10f),
                        start = Offset(size.width, 0f),
                        end = Offset(
                            size.width + (cos(radians) * size.width).toFloat(),
                            (sin(radians) * size.width).toFloat(),
                        ),
                        strokeWidth = 3.dp.toPx(),
                    )
                    angle += 8
                }
            }
        }
    }
}

private fun androidx.compose.ui.graphics.drawscope.DrawScope.blob(color: Color, center: Offset, radius: Float) {
    drawCircle(
        brush = Brush.radialGradient(
            colors = listOf(color, Color.Transparent),
            center = center,
            radius = radius,
        ),
        radius = radius,
        center = center,
    )
}

/* --------------------------------------------------------------- surfaces */

/**
 * Colonne d'écran : marges constantes, défilement vertical, jamais de hauteur
 * fixe — le contenu doit tenir sur un petit écran comme sur une tablette.
 */
@Composable
fun BrandScreen(
    modifier: Modifier = Modifier,
    content: @Composable ColumnScope.() -> Unit,
) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(start = 16.dp, end = 16.dp, top = 12.dp, bottom = 28.dp),
        content = content,
    )
}

/**
 * Panneau. [shadow] active l'ombre **pleine décalée** des identités Vector et
 * Otaku ; les autres n'ont pas d'ombre dure et gardent une surface plate.
 */
@Composable
fun BrandPanel(
    modifier: Modifier = Modifier,
    shape: Shape = LocalBrandTheme.current.shapes.card,
    fill: Color = LocalBrandTheme.current.palette.surface,
    borderColor: Color = LocalBrandTheme.current.palette.line,
    borderWidth: Dp = LocalBrandTheme.current.shapes.borderWidth,
    shadow: Boolean = true,
    padding: PaddingValues = PaddingValues(18.dp),
    content: @Composable ColumnScope.() -> Unit,
) {
    val theme = LocalBrandTheme.current
    val hardShadow = if (shadow) theme.shapes.hardShadow else 0.dp
    Box(modifier = modifier) {
        if (hardShadow > 0.dp) {
            Box(
                Modifier
                    .matchParentSize()
                    .offset(x = hardShadow, y = hardShadow)
                    .background(theme.palette.ink, shape),
            )
        }
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .clip(shape)
                .background(fill)
                .then(if (borderWidth > 0.dp) Modifier.border(borderWidth, borderColor, shape) else Modifier)
                .padding(padding),
            content = content,
        )
    }
}

@Composable
fun BrandDivider(modifier: Modifier = Modifier) {
    val theme = LocalBrandTheme.current
    Box(
        modifier
            .fillMaxWidth()
            .height(if (theme.identity == BrandTokens.Theme.MONO) 1.5.dp else 1.dp)
            .background(theme.palette.line),
    )
}

/* ------------------------------------------------------------------ texte */

@Composable
fun BrandLabel(
    text: String,
    modifier: Modifier = Modifier,
    color: Color = LocalBrandTheme.current.palette.muted,
    maxLines: Int = 1,
) {
    val theme = LocalBrandTheme.current
    Text(
        text = if (theme.type.caps) text.uppercase() else text,
        modifier = modifier,
        style = theme.labelStyle(color),
        maxLines = maxLines,
        overflow = TextOverflow.Ellipsis,
    )
}

@Composable
fun BrandTitle(
    text: String,
    modifier: Modifier = Modifier,
    color: Color = LocalBrandTheme.current.palette.ink,
    align: TextAlign = TextAlign.Start,
) {
    val theme = LocalBrandTheme.current
    Text(
        text = if (theme.type.caps) text.uppercase() else text,
        modifier = modifier,
        style = theme.titleStyle().copy(color = color, textAlign = align),
    )
}

@Composable
fun BrandBody(
    text: String,
    modifier: Modifier = Modifier,
    color: Color = LocalBrandTheme.current.palette.muted,
    align: TextAlign = TextAlign.Start,
    maxLines: Int = Int.MAX_VALUE,
) {
    val theme = LocalBrandTheme.current
    Text(
        text = text,
        modifier = modifier,
        style = theme.bodyStyle(color).copy(textAlign = align),
        maxLines = maxLines,
        overflow = TextOverflow.Ellipsis,
    )
}

@Composable
fun BrandCaption(
    text: String,
    modifier: Modifier = Modifier,
    color: Color = LocalBrandTheme.current.palette.muted,
) {
    val theme = LocalBrandTheme.current
    Text(text = text, modifier = modifier, style = theme.captionStyle(color))
}

/* ------------------------------------------------------------------- puces */

enum class Tone { NEUTRAL, ACCENT, POSITIVE, WARNING, DANGER }

@Composable
fun toneColor(tone: Tone): Color {
    val palette = LocalBrandTheme.current.palette
    return when (tone) {
        Tone.NEUTRAL -> palette.muted
        Tone.ACCENT -> palette.accentInk
        Tone.POSITIVE -> palette.positive
        Tone.WARNING -> palette.warning
        Tone.DANGER -> palette.danger
    }
}

@Composable
fun BrandPill(text: String, modifier: Modifier = Modifier, tone: Tone = Tone.NEUTRAL) {
    val theme = LocalBrandTheme.current
    val color = toneColor(tone)
    Box(
        modifier = modifier
            .clip(theme.shapes.chip)
            .background(color.copy(alpha = 0.12f))
            .border(if (theme.shapes.hardShadow > 0.dp) theme.shapes.borderWidth / 2 else 1.dp, color.copy(alpha = 0.35f), theme.shapes.chip)
            .padding(horizontal = 10.dp, vertical = 5.dp),
    ) {
        Text(
            text = if (theme.type.caps) text.uppercase() else text,
            style = theme.labelStyle(color).copy(fontSize = 10.sp),
            maxLines = 1,
        )
    }
}

/* ---------------------------------------------------------------- boutons */

/**
 * Bouton principal ou secondaire. Le retour d'appui suit l'identité : enfoncement
 * de 2 dp sur Vector/Otaku, léger retrait sur Halo/Mono — jamais les deux.
 */
@Composable
fun BrandAction(
    label: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    primary: Boolean = true,
    enabled: Boolean = true,
    icon: ImageVector? = null,
) {
    val theme = LocalBrandTheme.current
    val palette = theme.palette
    val shape: Shape = if (theme.identity == BrandTokens.Theme.OTAKU) RoundedCornerShape(14.dp) else theme.shapes.field

    val fill = when {
        !enabled -> palette.surfaceAlt
        primary -> palette.accent
        else -> Color.Transparent
    }
    val contentColor = when {
        !enabled -> palette.muted
        primary -> palette.onAccent
        else -> palette.ink
    }
    val outline = when {
        !enabled -> palette.line
        primary && theme.identity == BrandTokens.Theme.VECTOR -> palette.accent
        primary -> Color.Transparent
        // Halo : le liseré de verre est invisible sur fond clair ; on prend
        // l'encre secondaire pour que le contour du bouton atteigne 3:1.
        theme.identity == BrandTokens.Theme.HALO -> palette.muted
        theme.identity == BrandTokens.Theme.VECTOR -> palette.line
        else -> palette.ink
    }
    val outlineWidth = when {
        outline == Color.Transparent -> 0.dp
        theme.identity == BrandTokens.Theme.VECTOR -> 2.dp
        theme.identity == BrandTokens.Theme.OTAKU -> 3.dp
        else -> theme.shapes.borderWidth
    }
    val height = if (theme.identity == BrandTokens.Theme.VECTOR || theme.identity == BrandTokens.Theme.OTAKU) 56.dp else 52.dp

    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val shift = if (pressed) theme.motion.pressShift else 0.dp
    val scale by animateFloatAsState(
        targetValue = if (pressed && theme.shapes.hardShadow == 0.dp) 0.982f else 1f,
        animationSpec = theme.brandTween(theme.motion.fast),
        label = "pressScale",
    )

    Box(modifier = modifier.height(height)) {
        if (theme.shapes.hardShadow > 0.dp) {
            Box(
                Modifier
                    .matchParentSize()
                    .offset(x = theme.shapes.hardShadow, y = theme.shapes.hardShadow)
                    .background(if (enabled) palette.ink else palette.line, shape),
            )
        }
        Row(
            modifier = Modifier
                .fillMaxSize()
                .offset(x = shift, y = shift)
                .graphicsLayer {
                    scaleX = scale
                    scaleY = scale
                }
                .clip(shape)
                .background(fill)
                .then(if (outlineWidth > 0.dp) Modifier.border(outlineWidth, outline, shape) else Modifier)
                .clickable(
                    interactionSource = interaction,
                    indication = null,
                    enabled = enabled,
                    role = Role.Button,
                    onClick = onClick,
                )
                .padding(horizontal = 18.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.Center,
        ) {
            if (icon != null) {
                Icon(
                    imageVector = icon,
                    contentDescription = null,
                    tint = contentColor,
                    modifier = Modifier.size(19.dp),
                )
                Spacer(Modifier.width(10.dp))
            }
            Text(
                text = if (theme.type.caps) label.uppercase() else label,
                style = theme.bodyStyle(contentColor).copy(
                    fontWeight = if (primary) theme.type.labelWeight else FontWeight.Medium,
                    fontSize = 13.sp,
                    letterSpacing = if (theme.type.caps) 1.2.sp else 0.sp,
                ),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

/** Bouton d'icône de la barre haute (compte, réglages, aide, retour). */
@Composable
fun BrandIconAction(
    icon: ImageVector,
    label: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val theme = LocalBrandTheme.current
    val palette = theme.palette
    val size = if (theme.identity == BrandTokens.Theme.OTAKU) 44.dp else 42.dp
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val shift = if (pressed) theme.motion.pressShift else 0.dp

    Box(modifier = modifier.size(size)) {
        if (theme.shapes.hardShadow > 0.dp) {
            Box(
                Modifier
                    .matchParentSize()
                    .offset(x = theme.shapes.hardShadow / 2, y = theme.shapes.hardShadow / 2)
                    .background(palette.ink, theme.shapes.icon),
            )
        }
        Row(
            modifier = Modifier
                .fillMaxSize()
                .offset(x = shift, y = shift)
                .clip(theme.shapes.icon)
                .background(if (theme.identity == BrandTokens.Theme.HALO) palette.surface.copy(alpha = 0.72f) else palette.surface)
                .border(
                    width = if (theme.identity == BrandTokens.Theme.MONO) 1.dp else theme.shapes.borderWidth,
                    color = if (theme.identity == BrandTokens.Theme.HALO) palette.glassBorder else palette.line,
                    shape = theme.shapes.icon,
                )
                .clickable(
                    interactionSource = interaction,
                    indication = null,
                    role = Role.Button,
                    onClick = onClick,
                ),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.Center,
        ) {
            Icon(
                imageVector = icon,
                contentDescription = label,
                tint = palette.ink,
                modifier = Modifier.size(if (theme.identity == BrandTokens.Theme.VECTOR) 18.dp else 20.dp),
            )
        }
    }
}

/* ---------------------------------------------------------------- notices */

/**
 * Bandeau d'information. Le message vient du service ou de l'API : il est
 * affiché tel quel, il n'est pas reformulé pour rassurer.
 */
@Composable
fun BrandNotice(
    message: String,
    modifier: Modifier = Modifier,
    tone: Tone = Tone.WARNING,
    actionLabel: String? = null,
    onAction: (() -> Unit)? = null,
) {
    val theme = LocalBrandTheme.current
    val color = toneColor(tone)
    BrandPanel(
        modifier = modifier,
        fill = theme.palette.surface,
        borderColor = color.copy(alpha = 0.55f),
        shadow = false,
        padding = PaddingValues(horizontal = 14.dp, vertical = 12.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(
                Modifier
                    .width(3.dp)
                    .height(if (theme.identity == BrandTokens.Theme.OTAKU) 26.dp else 22.dp)
                    .background(color, RoundedCornerShape(2.dp)),
            )
            Spacer(Modifier.width(12.dp))
            BrandBody(text = message, modifier = Modifier.weight(1f), color = theme.palette.ink)
        }
        if (actionLabel != null && onAction != null) {
            Spacer(Modifier.height(10.dp))
            Text(
                text = if (theme.type.caps) actionLabel.uppercase() else actionLabel,
                style = theme.labelStyle(color),
                modifier = Modifier
                    .clip(RoundedCornerShape(4.dp))
                    .clickable(role = Role.Button, onClick = onAction)
                    .padding(vertical = 4.dp, horizontal = 2.dp),
            )
        }
    }
}

/* ------------------------------------------------------------------ lignes */

/** Ligne « libellé / valeur » ; cliquable si [onClick] est fourni. */
@Composable
fun BrandKeyValue(
    label: String,
    value: String,
    modifier: Modifier = Modifier,
    onClick: (() -> Unit)? = null,
    trailingIcon: ImageVector? = null,
) {
    val theme = LocalBrandTheme.current
    Row(
        modifier = modifier
            .fillMaxWidth()
            .then(
                if (onClick != null) {
                    Modifier
                        .clip(theme.shapes.field)
                        .clickable(role = Role.Button, onClick = onClick)
                } else {
                    Modifier
                },
            )
            .padding(vertical = 9.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        BrandLabel(text = label, modifier = Modifier.weight(1f))
        Text(
            text = value,
            style = theme.bodyStyle(theme.palette.ink).copy(fontWeight = FontWeight.SemiBold),
            textAlign = TextAlign.End,
            maxLines = 2,
        )
        if (trailingIcon != null) {
            Spacer(Modifier.width(8.dp))
            Icon(
                imageVector = trailingIcon,
                contentDescription = null,
                tint = theme.palette.muted,
                modifier = Modifier.size(16.dp),
            )
        }
    }
}
