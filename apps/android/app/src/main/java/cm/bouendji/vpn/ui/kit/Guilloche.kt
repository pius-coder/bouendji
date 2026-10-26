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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.clipRect
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.graphics.drawscope.translate
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.sin

/**
 * Motifs de billet du prototype (`app.js`, `GUILLOCHE`) : mêmes équations
 * polaires, même viewBox 200×200 (vagues : 400×220).
 */
enum class Guil { RING, ROSETTE, SEAL, WAVES }

private class Shape(val paths: List<Path>, val stroke: Float, val width: Float, val height: Float)

private fun polar(base: Float, amp: Float, k: Float, phase: Float, steps: Int = 720): Path {
    val path = Path()
    for (i in 0..steps) {
        val t = i.toFloat() / steps * 2f * PI.toFloat()
        val r = base + amp * sin(k * t + phase)
        val x = 100f + r * cos(t)
        val y = 100f + r * sin(t)
        if (i == 0) path.moveTo(x, y) else path.lineTo(x, y)
    }
    path.close()
    return path
}

private fun band(base: Float, amp: Float, k: Float, n: Int): List<Path> =
    (0 until n).map { j -> polar(base, amp, k, j * 2f * PI.toFloat() / n) }

private fun ringPath(r: Float): Path = Path().apply {
    addOval(androidx.compose.ui.geometry.Rect(100f - r, 100f - r, 100f + r, 100f + r))
}

private val shapes = HashMap<Guil, Shape>()

private fun shapeOf(kind: Guil): Shape = shapes.getOrPut(kind) {
    when (kind) {
        Guil.RING -> Shape(band(90f, 6f, 30f, 6) + band(75f, 6f, 40f, 5) + band(62f, 4f, 60f, 4) + ringPath(98.5f) + ringPath(56f), .4f, 200f, 200f)
        Guil.ROSETTE -> Shape(band(74f, 22f, 14f, 12) + band(42f, 12f, 10f, 8) + ringPath(98f), .3f, 200f, 200f)
        Guil.SEAL -> Shape(band(82f, 12f, 24f, 8) + band(60f, 6f, 16f, 6) + ringPath(98f) + ringPath(46f), .45f, 200f, 200f)
        Guil.WAVES -> {
            val paths = ArrayList<Path>()
            for (i in 0 until 20) {
                for (off in floatArrayOf(0f, PI.toFloat())) {
                    val path = Path()
                    val y0 = i * 11f + 4f
                    var x = 0
                    while (x <= 400) {
                        val y = y0 + 4.5f * sin(x * .045f + i * .55f + off) + 1.6f * sin(x * .12f + i)
                        if (x == 0) path.moveTo(0f, y) else path.lineTo(x.toFloat(), y)
                        x += 4
                    }
                    paths += path
                }
            }
            Shape(paths, .55f, 400f, 220f)
        }
    }
}

/**
 * @param spinSeconds période de rotation (0 = immobile). Le prototype : 120 s au
 *   splash, 80 s tunnel actif, 5 s pendant la connexion.
 */
@Composable
fun Guilloche(kind: Guil, color: Color, modifier: Modifier = Modifier, spinSeconds: Int = 0) {
    // Chaque thème a son propre fond ; le guilloché reste celui du thème « billet ».
    val art = cm.bouendji.vpn.ui.theme.LocalStyle.current.art
    if (art != cm.bouendji.vpn.ui.theme.Art.GUILLOCHE) {
        ThemeArt(art, kind, color, modifier, spinSeconds)
        return
    }
    val shape = shapeOf(kind)
    val angle = if (spinSeconds > 0) {
        val transition = rememberInfiniteTransition(label = "guilloche")
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
            // `preserveAspectRatio="xMidYMid slice"` : on couvre, on rogne.
            val factor = max(size.width / shape.width, size.height / shape.height)
            val dx = (size.width - shape.width * factor) / 2f
            val dy = (size.height - shape.height * factor) / 2f
            clipRect {
                translate(dx, dy) {
                    scale(factor, factor, pivot = Offset.Zero) {
                        shape.paths.forEach { drawPath(it, color, style = Stroke(width = shape.stroke)) }
                    }
                }
            }
        } else {
            val factor = size.minDimension / 200f
            val dx = (size.width - 200f * factor) / 2f
            val dy = (size.height - 200f * factor) / 2f
            rotate(angle) {
                translate(dx, dy) {
                    scale(factor, factor, pivot = Offset.Zero) {
                        shape.paths.forEach { drawPath(it, color, style = Stroke(width = shape.stroke)) }
                    }
                }
            }
        }
    }
}
