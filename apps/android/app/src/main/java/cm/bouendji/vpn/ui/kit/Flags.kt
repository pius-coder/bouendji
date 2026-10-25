package cm.bouendji.vpn.ui.kit

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.graphics.vector.PathParser
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import cm.bouendji.vpn.ui.theme.LocalTokens
import java.util.Locale
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.sin

/**
 * Région d'un serveur → pays affiché. Le bundle donne `region` (code ISO à deux
 * lettres quand l'admin le renseigne ainsi) : le nom vient de la locale, pas
 * d'une table recopiée. Le pays affiché est celui que l'admin a déclaré, pas une
 * géolocalisation (choix produit).
 */
object Regions {
    fun code(region: String): String? =
        region.trim().lowercase().takeIf { it.length == 2 && it.all(Char::isLetter) }

    fun countryName(region: String): String {
        val cc = code(region) ?: return region.ifBlank { "Serveur" }.replaceFirstChar { it.uppercase() }
        return Locale("", cc.uppercase()).getDisplayCountry(Locale.FRENCH).ifBlank { cc.uppercase() }
    }
}

private fun DrawScope.v3(a: Color, b: Color, c: Color) {
    drawRect(a, Offset(0f, 0f), Size(10f, 30f)); drawRect(b, Offset(10f, 0f), Size(10f, 30f)); drawRect(c, Offset(20f, 0f), Size(10f, 30f))
}

private fun DrawScope.h3(a: Color, b: Color, c: Color) {
    drawRect(a, Offset(0f, 0f), Size(30f, 10f)); drawRect(b, Offset(0f, 10f), Size(30f, 10f)); drawRect(c, Offset(0f, 20f), Size(30f, 10f))
}

private fun DrawScope.star(cx: Float, cy: Float, r: Float, color: Color) {
    val path = Path()
    for (i in 0 until 10) {
        val a = -PI.toFloat() / 2 + i * PI.toFloat() / 5
        val rr = if (i % 2 == 1) r * .42f else r
        val x = cx + rr * cos(a); val y = cy + rr * sin(a)
        if (i == 0) path.moveTo(x, y) else path.lineTo(x, y)
    }
    path.close()
    drawPath(path, color)
}

private fun p(d: String) = PathParser().parsePathString(d).toPath()

private val GB_X = p("M0 0 30 30M30 0 0 30")
private val GB_PLUS = p("M15 0v30M0 15h30")
private val ZA_Y = p("M0 0 15 15 0 30M15 15h15")
private val ZA_GOLD = p("M0 5 10 15 0 25z")
private val ZA_BLACK = p("M0 7.5 7.5 15 0 22.5z")
private val CA_LEAF = p("M15 8.5l1.4 2.7 1.6-.8-.6 4.1 2.1-2 .5 1.3 2-.4-.8 2.5.9.4-3.5 2.8.4 1.3-3.3-.4V23h-1.4v-2.9l-3.3.4.4-1.3-3.5-2.8.9-.4-.8-2.5 2 .4.5-1.3 2.1 2-.6-4.1 1.6.8z")

private val DRAWN = setOf("fr", "cm", "ci", "sn", "ng", "de", "nl", "jp", "us", "gb", "za", "ca", "be", "it", "ga", "td", "ml", "gn", "bj", "tg")

private fun DrawScope.flag(cc: String) {
    val w = Color.White
    when (cc) {
        "fr" -> v3(Color(0xFF0055A4), w, Color(0xFFEF4135))
        "be" -> v3(Color(0xFF111111), Color(0xFFFDDA24), Color(0xFFEF3340))
        "it" -> v3(Color(0xFF009246), w, Color(0xFFCE2B37))
        "cm" -> { v3(Color(0xFF007A5E), Color(0xFFCE1126), Color(0xFFFCD116)); star(15f, 15f, 4.2f, Color(0xFFFCD116)) }
        "ci" -> v3(Color(0xFFF77F00), w, Color(0xFF009E60))
        "td" -> v3(Color(0xFF002664), Color(0xFFFECB00), Color(0xFFC60C30))
        "ml" -> v3(Color(0xFF14B53A), Color(0xFFFCD116), Color(0xFFCE1126))
        "gn" -> v3(Color(0xFFCE1126), Color(0xFFFCD116), Color(0xFF009460))
        "sn" -> { v3(Color(0xFF00853F), Color(0xFFFDEF42), Color(0xFFE31B23)); star(15f, 15f, 4f, Color(0xFF00853F)) }
        "ng" -> v3(Color(0xFF008751), w, Color(0xFF008751))
        "ga" -> h3(Color(0xFF009E60), Color(0xFFFCD116), Color(0xFF3A75C4))
        "de" -> h3(Color(0xFF111111), Color(0xFFDD0000), Color(0xFFFFCE00))
        "nl" -> h3(Color(0xFFAE1C28), w, Color(0xFF21468B))
        "bj" -> { drawRect(Color(0xFF008751), Offset.Zero, Size(12f, 30f)); drawRect(Color(0xFFFCD116), Offset(12f, 0f), Size(18f, 15f)); drawRect(Color(0xFFE8112D), Offset(12f, 15f), Size(18f, 15f)) }
        "tg" -> {
            for (i in 0 until 5) drawRect(if (i % 2 == 0) Color(0xFF006A4E) else Color(0xFFFFCE00), Offset(0f, i * 6f), Size(30f, 6f))
            drawRect(Color(0xFFD21034), Offset.Zero, Size(14f, 12f)); star(7f, 6f, 3.4f, w)
        }
        "jp" -> { drawRect(w, Offset.Zero, Size(30f, 30f)); drawCircle(Color(0xFFBC002D), 7f, Offset(15f, 15f)) }
        "us" -> {
            drawRect(w, Offset.Zero, Size(30f, 30f))
            for (i in intArrayOf(0, 2, 4, 6, 8, 10, 12)) drawRect(Color(0xFFB22234), Offset(0f, i * 2.31f), Size(30f, 2.31f))
            drawRect(Color(0xFF3C3B6E), Offset.Zero, Size(15f, 16.2f))
            for ((x, y) in listOf(4 to 4, 8 to 4, 12 to 4, 6 to 8, 10 to 8, 4 to 12, 8 to 12, 12 to 12)) drawCircle(w, .9f, Offset(x.toFloat(), y.toFloat()))
        }
        "gb" -> {
            drawRect(Color(0xFF012169), Offset.Zero, Size(30f, 30f))
            drawPath(GB_X, w, style = Stroke(6f)); drawPath(GB_X, Color(0xFFC8102E), style = Stroke(2f))
            drawPath(GB_PLUS, w, style = Stroke(10f)); drawPath(GB_PLUS, Color(0xFFC8102E), style = Stroke(6f))
        }
        "za" -> {
            drawRect(Color(0xFFE03C31), Offset.Zero, Size(30f, 15f)); drawRect(Color(0xFF001489), Offset(0f, 15f), Size(30f, 15f))
            drawPath(ZA_Y, w, style = Stroke(10f, cap = StrokeCap.Butt)); drawPath(ZA_Y, Color(0xFF007749), style = Stroke(6f))
            drawPath(ZA_GOLD, Color(0xFFFFB81C)); drawPath(ZA_BLACK, Color.Black)
        }
        "ca" -> {
            drawRect(w, Offset.Zero, Size(30f, 30f)); drawRect(Color(0xFFD80621), Offset.Zero, Size(8f, 30f))
            drawRect(Color(0xFFD80621), Offset(22f, 0f), Size(8f, 30f)); drawPath(CA_LEAF, Color(0xFFD80621))
        }
    }
}

/** Pastille ronde 30 dp du prototype (`.flag`). Pays non dessiné : ses deux lettres. */
@Composable
fun Flag(region: String, size: Dp = 30.dp) {
    val t = LocalTokens.current
    val cc = Regions.code(region)
    val shape = CircleShape
    if (cc != null && cc in DRAWN) {
        Canvas(
            Modifier.size(size).clip(shape).border(.5.dp, Color.Black.copy(alpha = .15f), shape),
        ) {
            val factor = this.size.minDimension / 30f
            scale(factor, factor, pivot = Offset.Zero) { flag(cc) }
        }
    } else {
        Box(Modifier.size(size).clip(shape).background(t.accentSoft), contentAlignment = Alignment.Center) {
            Text(
                (cc ?: region.take(2)).uppercase(),
                color = t.accentText,
                fontSize = 11.sp,
                fontWeight = FontWeight.Bold,
            )
        }
    }
}
