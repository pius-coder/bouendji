package cm.bouendji.vpn.ui.kit

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.clipRect
import androidx.compose.ui.graphics.drawscope.rotate
import cm.bouendji.vpn.ui.theme.Art
import kotlin.math.cos
import kotlin.math.min
import kotlin.math.sin

/**
 * Fonds graphiques des thèmes autres que « billet » (qui garde son guilloché).
 * Même contrat que [Guilloche] : `kind` dit la forme attendue (anneau, rosette,
 * sceau = rond ; vagues = remplissage d'un rectangle), `color` la teinte de base.
 */
@Composable
fun ThemeArt(art: Art, kind: Guil, color: Color, modifier: Modifier = Modifier, spinSeconds: Int = 0) {
    val angle = if (spinSeconds > 0) {
        val transition = rememberInfiniteTransition(label = "art")
        val value by transition.animateFloat(
            initialValue = 0f,
            targetValue = 360f,
            animationSpec = infiniteRepeatable(tween(spinSeconds * 1_000, easing = LinearEasing), RepeatMode.Restart),
            label = "spin",
        )
        value
    } else {
        0f
    }
    Canvas(modifier) {
        if (kind == Guil.WAVES) {
            clipRect { fill(art, color) }
        } else {
            rotate(angle) { round(art, kind, color) }
        }
    }
}

/* ------------------------------------------------------------ formes rondes */

private fun DrawScope.round(art: Art, kind: Guil, color: Color) {
    val c = Offset(size.width / 2, size.height / 2)
    val r = min(size.width, size.height) / 2
    val px = r / 100f
    when (art) {
        // Halo : anneaux de lumière et satellites.
        Art.ORBITS -> {
            drawCircle(Brush.radialGradient(listOf(color.copy(alpha = color.alpha * .9f), Color.Transparent), c, r), r, c)
            val rings = if (kind == Guil.SEAL) 3 else 5
            for (i in 1..rings) {
                val rr = r * (.42f + .58f * i / rings)
                drawCircle(color, rr, c, style = Stroke(width = (1.2f + (rings - i) * .5f) * px))
                val a = Math.toRadians((i * 67).toDouble())
                drawCircle(color.copy(alpha = 1f), (2.2f + i * .4f) * px, Offset(c.x + rr * cos(a).toFloat(), c.y + rr * sin(a).toFloat()))
            }
        }
        // Mono : cadran de tampon, graduations nettes.
        Art.TYPE -> {
            drawCircle(color, r * .98f, c, style = Stroke(width = 3.5f * px))
            drawCircle(color, r * .86f, c, style = Stroke(width = 1f * px))
            val ticks = if (kind == Guil.RING) 60 else 36
            for (i in 0 until ticks) {
                val a = Math.toRadians(i * 360.0 / ticks)
                val long = i % 5 == 0
                val r1 = r * .86f
                val r2 = r * if (long) .74f else .80f
                drawLine(
                    color,
                    Offset(c.x + r1 * cos(a).toFloat(), c.y + r1 * sin(a).toFloat()),
                    Offset(c.x + r2 * cos(a).toFloat(), c.y + r2 * sin(a).toFloat()),
                    (if (long) 2.2f else 1f) * px,
                )
            }
        }
        // Vector : écran radar, réticule et balayage.
        Art.RADAR -> {
            for (i in 1..4) drawCircle(color, r * i / 4f, c, style = Stroke(width = 1f * px))
            drawLine(color, Offset(c.x - r, c.y), Offset(c.x + r, c.y), 1f * px)
            drawLine(color, Offset(c.x, c.y - r), Offset(c.x, c.y + r), 1f * px)
            val sweep = Path().apply {
                moveTo(c.x, c.y)
                lineTo(c.x + r, c.y)
                arcTo(androidx.compose.ui.geometry.Rect(c, r), 0f, -38f, false)
                close()
            }
            drawPath(sweep, Brush.sweepGradient(listOf(Color.Transparent, color.copy(alpha = 1f), Color.Transparent), c))
            drawCircle(color.copy(alpha = 1f), 3f * px, Offset(c.x + r * .55f, c.y - r * .3f))
            drawCircle(color.copy(alpha = 1f), 2.4f * px, Offset(c.x - r * .4f, c.y + r * .5f))
        }
        // Otaku : éclat manga, rayons alternés et trame de points.
        Art.BURST -> {
            val rays = if (kind == Guil.SEAL) 16 else 24
            for (i in 0 until rays) {
                val a0 = Math.toRadians(i * 360.0 / rays)
                val a1 = Math.toRadians((i + .5) * 360.0 / rays)
                val ray = Path().apply {
                    moveTo(c.x, c.y)
                    lineTo(c.x + r * cos(a0).toFloat(), c.y + r * sin(a0).toFloat())
                    lineTo(c.x + r * cos(a1).toFloat(), c.y + r * sin(a1).toFloat())
                    close()
                }
                drawPath(ray, color.copy(alpha = color.alpha * .55f))
            }
            for (ring in 1..3) {
                val rr = r * (.55f + ring * .13f)
                val dots = 18 + ring * 8
                for (i in 0 until dots) {
                    val a = Math.toRadians(i * 360.0 / dots)
                    drawCircle(color, (1.4f + ring * .5f) * px, Offset(c.x + rr * cos(a).toFloat(), c.y + rr * sin(a).toFloat()))
                }
            }
        }
        // Sahel : médaillon de losanges et de chevrons, comme un tissage.
        Art.KENTE -> {
            for (ring in 0..3) {
                val rr = r * (1f - ring * .2f)
                val diamond = Path().apply {
                    moveTo(c.x, c.y - rr); lineTo(c.x + rr, c.y); lineTo(c.x, c.y + rr); lineTo(c.x - rr, c.y); close()
                }
                drawPath(diamond, color, style = Stroke(width = (if (ring % 2 == 0) 3.2f else 1.4f) * px))
            }
            val teeth = if (kind == Guil.SEAL) 12 else 20
            for (i in 0 until teeth) {
                val a0 = Math.toRadians(i * 360.0 / teeth)
                val a1 = Math.toRadians((i + .5) * 360.0 / teeth)
                val a2 = Math.toRadians((i + 1) * 360.0 / teeth)
                val zig = Path().apply {
                    moveTo(c.x + r * .9f * cos(a0).toFloat(), c.y + r * .9f * sin(a0).toFloat())
                    lineTo(c.x + r * cos(a1).toFloat(), c.y + r * sin(a1).toFloat())
                    lineTo(c.x + r * .9f * cos(a2).toFloat(), c.y + r * .9f * sin(a2).toFloat())
                }
                drawPath(zig, color, style = Stroke(width = 2f * px))
            }
        }
        // Nebula : nuage lumineux et étoiles à quatre branches.
        Art.STARS -> {
            drawCircle(Brush.radialGradient(listOf(color, Color.Transparent), Offset(c.x - r * .2f, c.y - r * .25f), r * .9f), r, c)
            val stars = if (kind == Guil.SEAL) 14 else 26
            for (i in 0 until stars) {
                val a = Math.toRadians(i * 137.5)
                val d = r * (.25f + .75f * ((i * 37) % 100) / 100f)
                val p = Offset(c.x + d * cos(a).toFloat(), c.y + d * sin(a).toFloat())
                val s = (if (i % 5 == 0) 7f else 2.6f) * px
                if (i % 5 == 0) {
                    val star = Path().apply {
                        moveTo(p.x, p.y - s); quadraticTo(p.x, p.y, p.x + s, p.y); quadraticTo(p.x, p.y, p.x, p.y + s)
                        quadraticTo(p.x, p.y, p.x - s, p.y); quadraticTo(p.x, p.y, p.x, p.y - s); close()
                    }
                    drawPath(star, color.copy(alpha = 1f))
                } else {
                    drawCircle(color.copy(alpha = 1f), s * .5f, p)
                }
            }
            drawCircle(color, r * .98f, c, style = Stroke(width = 1f * px))
        }
        // Glacier : cristal hexagonal à facettes.
        Art.FACETS -> {
            val outer = (0 until 6).map { i ->
                val a = Math.toRadians(-90.0 + i * 60)
                Offset(c.x + r * cos(a).toFloat(), c.y + r * sin(a).toFloat())
            }
            val inner = outer.map { Offset(c.x + (it.x - c.x) * .55f, c.y + (it.y - c.y) * .55f) }
            val hex = Path().apply { moveTo(outer[0].x, outer[0].y); outer.drop(1).forEach { lineTo(it.x, it.y) }; close() }
            drawPath(hex, color, style = Stroke(width = 2.4f * px))
            val core = Path().apply { moveTo(inner[0].x, inner[0].y); inner.drop(1).forEach { lineTo(it.x, it.y) }; close() }
            drawPath(core, color.copy(alpha = color.alpha * .6f))
            for (i in 0 until 6) {
                drawLine(color, outer[i], inner[i], 1.4f * px)
                drawLine(color, inner[i], c, 1f * px)
                drawLine(color, outer[i], inner[(i + 1) % 6], 1f * px)
            }
        }
        Art.GUILLOCHE, Art.LINE -> Unit
    }
}

/* --------------------------------------------------------- remplissage (vagues) */

private fun DrawScope.fill(art: Art, color: Color) {
    val w = size.width
    val h = size.height
    val d = density
    when (art) {
        Art.ORBITS -> {
            drawCircle(Brush.radialGradient(listOf(color, Color.Transparent), Offset(w * .85f, h * .1f), h), h, Offset(w * .85f, h * .1f))
            drawCircle(Brush.radialGradient(listOf(color, Color.Transparent), Offset(w * .1f, h), h * .8f), h * .8f, Offset(w * .1f, h))
            for (i in 1..4) drawCircle(color, h * .25f * i, Offset(w * .85f, h * .1f), style = Stroke(width = d))
        }
        Art.TYPE -> {
            val step = 9 * d
            var y = step
            while (y < h) {
                drawLine(color, Offset(0f, y), Offset(w, y), 1f)
                y += step
            }
        }
        Art.RADAR -> {
            val step = 14 * d
            var x = 0f
            while (x < w) { drawLine(color, Offset(x, 0f), Offset(x, h), 1f); x += step }
            var y = 0f
            while (y < h) { drawLine(color, Offset(0f, y), Offset(w, y), 1f); y += step }
        }
        Art.BURST -> {
            val step = 12 * d
            var y = 0f
            var row = 0
            while (y < h + step) {
                var x = if (row % 2 == 0) 0f else step / 2
                while (x < w + step) {
                    // Trame qui grossit vers le coin : effet sérigraphie.
                    val k = ((x / w) + (1f - y / h)) / 2f
                    drawCircle(color, d + 2.6f * d * k, Offset(x, y))
                    x += step
                }
                y += step
                row++
            }
        }
        Art.KENTE -> {
            // Bandes tissées : chevrons sur des rangées alternées.
            val band = 18 * d
            var y = 0f
            var row = 0
            while (y < h) {
                if (row % 2 == 0) drawRect(color.copy(alpha = color.alpha * .35f), Offset(0f, y), androidx.compose.ui.geometry.Size(w, band))
                var x = 0f
                while (x < w) {
                    val zig = Path().apply { moveTo(x, y + band); lineTo(x + band / 2, y); lineTo(x + band, y + band) }
                    drawPath(zig, color, style = Stroke(width = 1.4f * d))
                    x += band
                }
                y += band
                row++
            }
        }
        Art.STARS -> {
            drawCircle(Brush.radialGradient(listOf(color, Color.Transparent), Offset(w * .2f, h * .3f), h * .9f), h * .9f, Offset(w * .2f, h * .3f))
            for (i in 0 until 60) {
                val x = (i * 97 % 100) / 100f * w
                val y = (i * 53 % 100) / 100f * h
                drawCircle(color.copy(alpha = 1f), if (i % 9 == 0) 2.2f * d else .9f * d, Offset(x, y))
            }
        }
        Art.FACETS -> {
            // Pavage de triangles, comme une surface de glace taillée.
            val s = 26 * d
            var y = 0f
            var row = 0
            while (y < h + s) {
                var x = if (row % 2 == 0) 0f else -s / 2
                while (x < w + s) {
                    val tri = Path().apply { moveTo(x, y + s); lineTo(x + s / 2, y); lineTo(x + s, y + s); close() }
                    drawPath(tri, color, style = Stroke(width = .8f * d))
                    x += s
                }
                y += s
                row++
            }
        }
        // Ligne (Solo) : le fil vertical, 3 dp, à 24 dp du bord gauche.
        Art.LINE -> {
            val x = 24f * d
            drawLine(color, Offset(x, 0f), Offset(x, h), 3f * d)
        }
        Art.GUILLOCHE -> Unit
    }
}

