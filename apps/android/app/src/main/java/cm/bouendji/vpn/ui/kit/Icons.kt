package cm.bouendji.vpn.ui.kit

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Fill
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.graphics.vector.PathParser
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/**
 * Les icônes du prototype (`index.html`, `<symbol>` 24×24), mêmes tracés.
 * Les cercles et rectangles SVG sont réécrits en chemins.
 */
private fun circle(cx: Float, cy: Float, r: Float) =
    "M${cx - r} $cy a$r $r 0 1 0 ${2 * r} 0 a$r $r 0 1 0 ${-2 * r} 0"

private fun rrect(x: Float, y: Float, w: Float, h: Float, r: Float) =
    "M${x + r} ${y}h${w - 2 * r}a$r $r 0 0 1 $r ${r}v${h - 2 * r}a$r $r 0 0 1 ${-r} ${r}h${-(w - 2 * r)}" +
        "a$r $r 0 0 1 ${-r} ${-r}v${-(h - 2 * r)}a$r $r 0 0 1 $r ${-r}z"

enum class Ic(val paths: List<String>, val filled: Boolean = false) {
    Home(listOf("M3.5 10.2 12 3.5l8.5 6.7V19.5a1 1 0 0 1-1 1h-4.8v-5.8H9.3v5.8H4.5a1 1 0 0 1-1-1z")),
    Globe(listOf(circle(12f, 12f, 9f), "M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z")),
    Nji(listOf("M7 3.5h10l4 5.5-9 11.5L3 9z", "M3 9h18M10 3.5 8.5 9 12 20.5 15.5 9 14 3.5")),
    User(listOf(circle(12f, 8f, 4f), "M4.5 20.5c1.4-3.8 4.3-5.5 7.5-5.5s6.1 1.7 7.5 5.5")),
    ChevronRight(listOf("m9.5 6 6 6-6 6")),
    ChevronLeft(listOf("m15 5-7 7 7 7")),
    ChevronDown(listOf("m6 9.5 6 6 6-6")),
    Check(listOf("m5 12.5 4.5 4.5L19 7.5")),
    Search(listOf(circle(11f, 11f, 6.5f), "m20 20-4.2-4.2")),
    Power(listOf("M12 3.5v8", "M6.6 6.8a7.6 7.6 0 1 0 10.8 0")),
    ArrowDown(listOf("M12 4.5v15M6.5 14l5.5 5.5 5.5-5.5")),
    ArrowUp(listOf("M12 19.5v-15M6.5 10 12 4.5 17.5 10")),
    Lock(listOf(rrect(5f, 10.5f, 14f, 10f, 2.2f), "M8.3 10.5V7.8a3.7 3.7 0 0 1 7.4 0v2.7")),
    Gear(
        listOf(
            "M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z",
            circle(12f, 12f, 3f),
        ),
    ),
    Devices(listOf(rrect(6.5f, 2.5f, 11f, 19f, 2.5f), "M11 18.5h2")),
    Card(listOf(rrect(3f, 5.5f, 18f, 13f, 2.2f), "M3 10h18M7 14.5h4")),
    UserPlus(listOf(circle(9.5f, 8f, 3.8f), "M2.8 20.5c1.2-3.6 3.8-5.3 6.7-5.3s5.5 1.7 6.7 5.3M19 8v6M16 11h6")),
    Help(listOf(circle(12f, 12f, 9f), "M9.3 9.2a2.8 2.8 0 0 1 5.4 1c0 1.9-2.7 2.5-2.7 4", "M12 17.3h.01")),
    X(listOf("M17 7 7 17M7 7l10 10")),
    Star(listOf("m12 3.6 2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8-4.2-4.1 5.8-.8z")),
    Copy(listOf(rrect(8.5f, 8.5f, 12f, 12f, 2f), "M15.5 8.5V5.5a2 2 0 0 0-2-2h-8a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h3")),
    Share(listOf("M12 15V3.5M7.5 8 12 3.5 16.5 8", "M5 12.5v6.5a1.5 1.5 0 0 0 1.5 1.5h11a1.5 1.5 0 0 0 1.5-1.5v-6.5")),
    Shield(listOf("M12 3 4.5 6v5.5c0 4.6 3.1 8.2 7.5 9.5 4.4-1.3 7.5-4.9 7.5-9.5V6z", "m8.8 12 2.3 2.3 4.2-4.6")),
    Key(listOf(circle(8f, 15f, 4.5f), "m11.3 11.7 8.7-8.7M16.5 6.5l2.5 2.5M14 9l2 2")),
    Bolt(listOf("M13 2.5 4.5 13.5h6.5l-1 8 8.5-11h-6.5z")),
    Infinity(listOf("M12 12c-2-2.7-3.6-4-5.5-4a4 4 0 0 0 0 8c1.9 0 3.5-1.3 5.5-4zm0 0c2 2.7 3.6 4 5.5 4a4 4 0 0 0 0-8c-1.9 0-3.5 1.3-5.5 4z")),
    Clock(listOf(circle(12f, 12f, 9f), "M12 7v5l3.2 2")),
    Moon(listOf("M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z")),
    Bell(listOf("M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15z", "M10 20.5a2 2 0 0 0 4 0")),
    EyeOff(
        listOf(
            "M3 3l18 18M10.6 5.1A9.7 9.7 0 0 1 12 5c5 0 8.5 4.5 9.5 7a13 13 0 0 1-2.7 3.8M6.5 6.6C4.5 8 3.1 10 2.5 12c1 2.5 4.5 7 9.5 7 1.6 0 3-.4 4.3-1.1",
            "M9.9 9.9a3 3 0 0 0 4.2 4.2",
        ),
    ),
    Dns(listOf(rrect(4f, 4f, 16f, 6.5f, 1.6f), rrect(4f, 13.5f, 16f, 6.5f, 1.6f), "M7.5 7.25h.01M7.5 16.75h.01")),
    Plug(listOf("M9 3v5M15 3v5M6 8h12v3a6 6 0 0 1-12 0zM12 17v4")),
    Download(listOf("M12 3.5v11M7.5 10l4.5 4.5 4.5-4.5M5 19.5h14")),
    Refresh(listOf("M20 11a8 8 0 0 0-14.6-4.5M4 4v3.5h3.5", "M4 13a8 8 0 0 0 14.6 4.5M20 20v-3.5h-3.5")),
    Whatsapp(
        listOf(
            "M12 2.2a9.8 9.8 0 0 0-8.5 14.7L2.2 21.8l5-1.3A9.8 9.8 0 1 0 12 2.2zm0 1.8a8 8 0 1 1-4.1 14.9l-.3-.2-3 .8.8-2.9-.2-.3A8 8 0 0 1 12 4zM8.6 7.4c-.2 0-.5 0-.7.3-.3.3-1 .9-1 2.3s1 2.7 1.2 2.9c.1.2 2 3.1 4.9 4.3 2.4 1 2.9.8 3.4.7.5 0 1.7-.7 1.9-1.4.2-.7.2-1.3.2-1.4-.1-.1-.3-.2-.6-.4l-1.9-.9c-.3-.1-.5-.1-.7.1l-.9 1.1c-.2.2-.3.2-.6.1-.3-.1-1.2-.5-2.3-1.4-.9-.8-1.4-1.7-1.6-2-.2-.3 0-.4.1-.6l.4-.5.3-.5v-.5l-.9-2.1c-.2-.5-.4-.5-.6-.5z",
        ),
        filled = true,
    ),
    Telegram(
        listOf("M21.2 3.6 2.9 10.7c-1.2.5-1.2 1.2 0 1.6l4.7 1.5 1.8 5.5c.2.6.4.8.9.8.4 0 .6-.2.9-.4l2.3-2.2 4.7 3.5c.9.5 1.5.2 1.7-.8l3.1-14.7c.3-1.3-.5-1.9-1.5-1.5zM9.1 13.4l9.3-5.9c.4-.3.8-.1.5.2l-7.6 6.9-.3 3.3z"),
        filled = true,
    ),
    Mail(listOf(rrect(3f, 5.5f, 18f, 13f, 2.2f), "m3.5 7 8.5 6 8.5-6")),
}

private val pathCache = HashMap<Ic, List<Path>>()

private fun pathsOf(icon: Ic): List<Path> = pathCache.getOrPut(icon) {
    icon.paths.map { PathParser().parsePathString(it).toPath() }
}

@Composable
fun Icon(icon: Ic, color: Color, size: Dp = 20.dp, strokeWidth: Float = 1.8f, filled: Boolean = false, modifier: Modifier = Modifier) {
    val paths = remember(icon) { pathsOf(icon) }
    Canvas(modifier.size(size)) {
        val factor = this.size.minDimension / 24f
        scale(factor, factor, pivot = androidx.compose.ui.geometry.Offset.Zero) {
            for (path in paths) {
                if (icon.filled || filled) drawPath(path, color, style = Fill)
                if (!icon.filled) {
                    drawPath(path, color, style = Stroke(width = strokeWidth, cap = StrokeCap.Round, join = StrokeJoin.Round))
                }
            }
        }
    }
}
