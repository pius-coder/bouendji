package cm.bouendji.vpn.ui

import androidx.compose.foundation.Canvas
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.unit.dp

/**
 * Pictogrammes dessinés au trait, pas d'`ImageView`, pas de police d'icônes.
 *
 * Raison : une police d'icônes ajoute un fichier par marque et casse le rendu
 * si elle n'est pas chargée ; un trait de 1,6 px se dessine à la taille exacte
 * demandée, avec la couleur du thème.
 */
enum class Glyph { POWER, SLIDERS, CONTRAST, EXTERNAL, CHECK, USER, HELP, SUPPORT, SHIELD, HOME, CARD, BACK, DEVICE, BELL }

@Composable
fun GlyphIcon(
    glyph: Glyph,
    tint: Color,
    modifier: Modifier = Modifier,
    strokeDp: Float = 1.6f,
) {
    Canvas(modifier = modifier) {
        val stroke = strokeDp.dp.toPx()
        val w = size.width
        val h = size.height
        val min = minOf(w, h)
        val strokeStyle = Stroke(width = stroke, cap = StrokeCap.Round)

        when (glyph) {
            Glyph.POWER -> {
                val radius = min * 0.36f
                val center = Offset(w / 2f, h / 2f + min * 0.04f)
                drawArc(
                    color = tint,
                    startAngle = 300f,
                    sweepAngle = 300f,
                    useCenter = false,
                    topLeft = Offset(center.x - radius, center.y - radius),
                    size = androidx.compose.ui.geometry.Size(radius * 2, radius * 2),
                    style = strokeStyle,
                )
                drawLine(
                    color = tint,
                    start = Offset(center.x, center.y - min * 0.42f),
                    end = Offset(center.x, center.y - min * 0.10f),
                    strokeWidth = stroke,
                    cap = StrokeCap.Round,
                )
            }

            Glyph.SLIDERS -> {
                val knobs = listOf(0.62f, 0.38f)
                knobs.forEachIndexed { index, knob ->
                    val y = h * (0.34f + index * 0.34f)
                    drawLine(
                        color = tint,
                        start = Offset(w * 0.14f, y),
                        end = Offset(w * 0.86f, y),
                        strokeWidth = stroke,
                        cap = StrokeCap.Round,
                    )
                    drawCircle(color = tint, radius = stroke * 1.7f, center = Offset(w * knob, y))
                }
            }

            Glyph.CONTRAST -> {
                val radius = min * 0.34f
                val center = Offset(w / 2f, h / 2f)
                drawCircle(color = tint, radius = radius, style = Stroke(width = stroke))
                val half = Path().apply {
                    moveTo(center.x, center.y - radius)
                    arcTo(
                        rect = androidx.compose.ui.geometry.Rect(
                            left = center.x - radius,
                            top = center.y - radius,
                            right = center.x + radius,
                            bottom = center.y + radius,
                        ),
                        startAngleDegrees = 270f,
                        sweepAngleDegrees = 180f,
                        forceMoveTo = false,
                    )
                    close()
                }
                drawPath(path = half, color = tint)
            }

            Glyph.EXTERNAL -> {
                drawLine(
                    color = tint,
                    start = Offset(w * 0.22f, h * 0.78f),
                    end = Offset(w * 0.78f, h * 0.22f),
                    strokeWidth = stroke,
                    cap = StrokeCap.Round,
                )
                drawLine(
                    color = tint,
                    start = Offset(w * 0.46f, h * 0.22f),
                    end = Offset(w * 0.78f, h * 0.22f),
                    strokeWidth = stroke,
                    cap = StrokeCap.Round,
                )
                drawLine(
                    color = tint,
                    start = Offset(w * 0.78f, h * 0.22f),
                    end = Offset(w * 0.78f, h * 0.54f),
                    strokeWidth = stroke,
                    cap = StrokeCap.Round,
                )
            }

            Glyph.CHECK -> {
                val path = Path().apply {
                    moveTo(w * 0.22f, h * 0.54f)
                    lineTo(w * 0.42f, h * 0.74f)
                    lineTo(w * 0.78f, h * 0.28f)
                }
                drawPath(path = path, color = tint, style = strokeStyle)
            }

            Glyph.USER -> {
                drawCircle(color = tint, radius = min * .16f, center = Offset(w / 2f, h * .34f), style = strokeStyle)
                drawArc(color = tint, startAngle = 200f, sweepAngle = 140f, useCenter = false,
                    topLeft = Offset(w * .22f, h * .48f), size = androidx.compose.ui.geometry.Size(w * .56f, h * .42f), style = strokeStyle)
            }

            Glyph.HELP -> {
                drawCircle(color = tint, radius = min * .36f, center = Offset(w / 2f, h / 2f), style = strokeStyle)
                drawArc(color = tint, startAngle = 205f, sweepAngle = 230f, useCenter = false,
                    topLeft = Offset(w * .35f, h * .22f), size = androidx.compose.ui.geometry.Size(w * .30f, h * .30f), style = strokeStyle)
                drawLine(color = tint, start = Offset(w * .50f, h * .50f), end = Offset(w * .50f, h * .62f), strokeWidth = stroke)
                drawCircle(color = tint, radius = stroke, center = Offset(w * .50f, h * .75f))
            }

            Glyph.SUPPORT -> {
                drawCircle(color = tint, radius = min * .35f, center = Offset(w / 2f, h / 2f), style = strokeStyle)
                drawCircle(color = tint, radius = min * .14f, center = Offset(w / 2f, h / 2f), style = strokeStyle)
                drawLine(color = tint, start = Offset(w * .25f, h * .25f), end = Offset(w * .40f, h * .40f), strokeWidth = stroke, cap = StrokeCap.Round)
                drawLine(color = tint, start = Offset(w * .75f, h * .25f), end = Offset(w * .60f, h * .40f), strokeWidth = stroke, cap = StrokeCap.Round)
                drawLine(color = tint, start = Offset(w * .25f, h * .75f), end = Offset(w * .40f, h * .60f), strokeWidth = stroke, cap = StrokeCap.Round)
                drawLine(color = tint, start = Offset(w * .75f, h * .75f), end = Offset(w * .60f, h * .60f), strokeWidth = stroke, cap = StrokeCap.Round)
            }

            Glyph.SHIELD -> {
                val path = Path().apply {
                    moveTo(w * .50f, h * .12f); lineTo(w * .80f, h * .24f); lineTo(w * .80f, h * .48f)
                    cubicTo(w * .80f, h * .68f, w * .67f, h * .82f, w * .50f, h * .90f)
                    cubicTo(w * .33f, h * .82f, w * .20f, h * .68f, w * .20f, h * .48f)
                    lineTo(w * .20f, h * .24f); close()
                }
                drawPath(path, tint, style = strokeStyle)
                drawLine(color = tint, start = Offset(w * .35f, h * .50f), end = Offset(w * .46f, h * .61f), strokeWidth = stroke, cap = StrokeCap.Round)
                drawLine(color = tint, start = Offset(w * .46f, h * .61f), end = Offset(w * .66f, h * .38f), strokeWidth = stroke, cap = StrokeCap.Round)
            }

            Glyph.HOME -> {
                val path = Path().apply {
                    moveTo(w * .16f, h * .48f); lineTo(w * .50f, h * .18f); lineTo(w * .84f, h * .48f)
                    moveTo(w * .26f, h * .42f); lineTo(w * .26f, h * .82f); lineTo(w * .74f, h * .82f); lineTo(w * .74f, h * .42f)
                }
                drawPath(path, tint, style = strokeStyle)
            }

            Glyph.CARD -> {
                drawRoundRect(color = tint, topLeft = Offset(w * .12f, h * .24f),
                    size = androidx.compose.ui.geometry.Size(w * .76f, h * .54f), cornerRadius = androidx.compose.ui.geometry.CornerRadius(min * .08f), style = strokeStyle)
                drawLine(color = tint, start = Offset(w * .14f, h * .42f), end = Offset(w * .86f, h * .42f), strokeWidth = stroke)
            }

            Glyph.BACK -> {
                drawLine(color = tint, start = Offset(w * .72f, h * .18f), end = Offset(w * .28f, h * .50f), strokeWidth = stroke, cap = StrokeCap.Round)
                drawLine(color = tint, start = Offset(w * .28f, h * .50f), end = Offset(w * .72f, h * .82f), strokeWidth = stroke, cap = StrokeCap.Round)
            }

            Glyph.DEVICE -> {
                drawRoundRect(color = tint, topLeft = Offset(w * .27f, h * .10f),
                    size = androidx.compose.ui.geometry.Size(w * .46f, h * .80f), cornerRadius = androidx.compose.ui.geometry.CornerRadius(min * .08f), style = strokeStyle)
                drawCircle(color = tint, radius = stroke, center = Offset(w * .50f, h * .79f))
            }

            Glyph.BELL -> {
                drawArc(color = tint, startAngle = 190f, sweepAngle = 160f, useCenter = false,
                    topLeft = Offset(w * .25f, h * .20f), size = androidx.compose.ui.geometry.Size(w * .50f, h * .54f), style = strokeStyle)
                drawLine(color = tint, start = Offset(w * .22f, h * .72f), end = Offset(w * .78f, h * .72f), strokeWidth = stroke, cap = StrokeCap.Round)
                drawCircle(color = tint, radius = stroke * 1.2f, center = Offset(w * .50f, h * .82f))
            }
        }
    }
}
