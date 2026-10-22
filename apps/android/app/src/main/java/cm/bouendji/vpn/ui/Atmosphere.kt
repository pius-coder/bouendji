package cm.bouendji.vpn.ui

import androidx.compose.foundation.Canvas
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.unit.dp
import cm.bouendji.vpn.ui.theme.Identity

/**
 * Le fond de chaque identité, dessiné au `Canvas` — aucune image, aucun
 * bitmap, donc aucun poids mort dans l'APK et un rendu net à toutes les
 * densités.
 *
 * Chaque direction a un motif qui lui appartient :
 * - **Halo** : halos radiaux, comme une lumière derrière du verre ;
 * - **Mono** : filets verticaux et une masse d'encre, comme une page composée ;
 * - **Vector** : lignes de balayage et trame, comme un tube cathodique ;
 * - **Otaku** : trame de points et lignes de vitesse, comme une planche.
 */
@Composable
fun IdentityBackdrop(identity: Identity, modifier: Modifier = Modifier) {
    Canvas(modifier = modifier) {
        when (identity.theme) {
            cm.bouendji.vpn.brand.BrandTokens.Theme.HALO -> haloBackdrop(identity)
            cm.bouendji.vpn.brand.BrandTokens.Theme.MONO -> monoBackdrop(identity)
            cm.bouendji.vpn.brand.BrandTokens.Theme.VECTOR -> vectorBackdrop(identity)
            cm.bouendji.vpn.brand.BrandTokens.Theme.OTAKU -> otakuBackdrop(identity)
        }
    }
}

private fun DrawScope.haloBackdrop(identity: Identity) {
    // Base : le dégradé vertical de l'atelier, pas un aplat.
    drawRect(
        brush = Brush.verticalGradient(
            colors = if (identity.dark) {
                listOf(Color(0xFF080B12), Color(0xFF0A0F1A), Color(0xFF070A10))
            } else {
                listOf(Color(0xFFF8FBFF), Color(0xFFEEF3FB), Color(0xFFE9EEF8))
            },
        ),
    )

    // Aurore : les trois blobs de l'atelier (`atelier.css`, `.halo-aurora i`).
    // En sombre, le conteneur est à opacité .34 : les alphas ci-dessous sont
    // les alphas clair multipliés par .34, pas des valeurs inventées.
    val blobs = if (identity.dark) {
        listOf(
            Triple(0.18f to 0.10f, 0.85f, Color(0xFFA9CCFF).copy(alpha = 0.22f)),
            Triple(0.92f to 0.42f, 0.70f, Color(0xFFCBB8FF).copy(alpha = 0.22f)),
            Triple(0.75f to 0.95f, 0.80f, Color(0xFFBFE4FF).copy(alpha = 0.17f)),
        )
    } else {
        listOf(
            Triple(0.18f to 0.10f, 0.85f, Color(0xFFA9CCFF).copy(alpha = 0.65f)),
            Triple(0.92f to 0.42f, 0.70f, Color(0xFFCBB8FF).copy(alpha = 0.65f)),
            Triple(0.75f to 0.95f, 0.80f, Color(0xFFBFE4FF).copy(alpha = 0.50f)),
        )
    }
    for ((pos, radiusFrac, color) in blobs) {
        val center = Offset(size.width * pos.first, size.height * pos.second)
        val radius = size.minDimension * radiusFrac
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
}

private fun DrawScope.monoBackdrop(identity: Identity) {
    val line = identity.palette.line
    val width = identity.metrics.border.toPx().coerceAtLeast(1f)

    for (fraction in listOf(0.08f, 0.5f, 0.92f)) {
        val x = size.width * fraction
        drawLine(color = line, start = Offset(x, 0f), end = Offset(x, size.height), strokeWidth = width)
    }

    // Masse d'encre : une bande pleine, franche, jamais un dégradé.
    drawRect(
        color = identity.palette.ink.copy(alpha = 0.045f),
        topLeft = Offset(0f, size.height * 0.62f),
        size = Size(size.width, size.height * 0.06f),
    )
}

private fun DrawScope.vectorBackdrop(identity: Identity) {
    val accent = identity.palette.accent
    val line = identity.palette.line

    val scanStep = 3.dp.toPx()
    var y = 0f
    while (y < size.height) {
        drawLine(color = accent.copy(alpha = 0.035f), start = Offset(0f, y), end = Offset(size.width, y), strokeWidth = 1f)
        y += scanStep
    }

    val columnStep = 24.dp.toPx()
    var x = 0f
    while (x < size.width) {
        drawLine(color = line.copy(alpha = 0.35f), start = Offset(x, 0f), end = Offset(x, size.height), strokeWidth = 1f)
        x += columnStep
    }

    drawRect(
        brush = Brush.verticalGradient(
            colors = listOf(Color.Black.copy(alpha = 0.35f), Color.Transparent, Color.Black.copy(alpha = 0.45f)),
        ),
    )
}

private fun DrawScope.otakuBackdrop(identity: Identity) {
    val ink = identity.palette.ink
    val accent = identity.palette.accent

    val step = 14.dp.toPx()
    val radius = 1.6.dp.toPx()
    var row = 0
    var y = step / 2f
    while (y < size.height * 0.55f) {
        val offset = if (row % 2 == 0) 0f else step / 2f
        var x = step / 2f + offset
        while (x < size.width) {
            drawCircle(color = ink.copy(alpha = 0.10f), radius = radius, center = Offset(x, y))
            x += step
        }
        row++
        y += step
    }

    // Lignes de vitesse, en haut à droite.
    val count = 7
    for (index in 0 until count) {
        val shift = index * 8.dp.toPx()
        drawLine(
            color = accent.copy(alpha = 0.16f),
            start = Offset(size.width * 0.55f + shift, 0f),
            end = Offset(size.width * 0.92f + shift, size.height * 0.22f),
            strokeWidth = 2.dp.toPx(),
        )
    }
}
