package cm.bouendji.vpn.ui.kit

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.CutCornerShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.drawOutline
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import cm.bouendji.vpn.ui.theme.Decor
import cm.bouendji.vpn.ui.theme.LocalStyle
import cm.bouendji.vpn.ui.theme.LocalTokens

/** Forme des cartes du thème : arrondie, carrée (éditorial) ou à angles coupés (terminal). */
@Composable
fun cardShape(radius: Dp = LocalStyle.current.radius): Shape = when (LocalStyle.current.decor) {
    Decor.TERMINAL -> CutCornerShape(minOf(radius * 2, 18.dp))
    Decor.RULE -> RoundedCornerShape(0.dp)
    else -> RoundedCornerShape(radius)
}

/** Forme d'une pastille ronde (sélection, étape) : carrée en éditorial, coupée en terminal. */
@Composable
fun dotShape(): Shape = when (LocalStyle.current.decor) {
    Decor.RULE -> RoundedCornerShape(0.dp)
    Decor.TERMINAL -> CutCornerShape(30)
    else -> CircleShape
}

/** Ombre portée dure, décalée (style autocollant). Se dessine hors du cadre, avant le clip. */
fun Modifier.hardShadow(shape: Shape, color: Color, offset: Dp = 4.dp): Modifier = drawBehind {
    val outline = shape.createOutline(size, layoutDirection, this)
    translate(offset.toPx(), offset.toPx()) { drawOutline(outline, color) }
}

/**
 * Surface d'une carte selon le thème : ombre douce (billet), verre (halo),
 * filets d'encre sans fond (éditorial), cadre d'accent (terminal), trait
 * épais et ombre dure (autocollant).
 */
@Composable
fun Modifier.themedSurface(shape: Shape = cardShape(), fill: Color = LocalTokens.current.surface): Modifier {
    val t = LocalTokens.current
    val s = LocalStyle.current
    return when (s.decor) {
        Decor.SHADOW -> this
            .then(if (t.dark) Modifier else Modifier.shadow(2.dp, shape, ambientColor = Color(0x14142018), spotColor = Color(0x14142018)))
            .clip(shape)
            .background(fill)
        Decor.GLASS -> this
            .clip(shape)
            .background(fill.copy(alpha = if (t.dark) .62f else .78f))
            .border(1.dp, if (t.dark) Color.White.copy(alpha = .12f) else Color.White.copy(alpha = .9f), shape)
        Decor.RULE -> this
            .drawBehind {
                val w = s.stroke.toPx()
                drawLine(t.label, Offset(0f, w / 2), Offset(size.width, w / 2), w)
                drawLine(t.label, Offset(0f, size.height - w / 2), Offset(size.width, size.height - w / 2), w)
            }
        Decor.TERMINAL -> this
            .clip(shape)
            .background(fill)
            .border(1.dp, t.accent.copy(alpha = .55f), shape)
        Decor.STICKER -> this
            .hardShadow(shape, t.label)
            .clip(shape)
            .background(fill)
            .border(s.stroke, t.label, shape)
    }
}
