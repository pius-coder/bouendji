package cm.bouendji.vpn.ui.components

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathFillType
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp

/**
 * Icônes dessinées à la main, en `ImageVector`.
 *
 * Aucune bibliothèque d'icônes n'est ajoutée : le build ne doit pas grossir
 * pour six pictogrammes, et chaque trait est réglable (épaisseur, extrémités).
 * Le trait est noir ; `Icon` applique sa teinte par filtre de couleur.
 */
object BrandIcons {

    val Account: ImageVector = vector("account") {
        stroke {
            circle(12f, 8.4f, 3.4f)
            moveTo(4.6f, 20.2f)
            curveTo(5.2f, 16.4f, 8.4f, 14.6f, 12f, 14.6f)
            curveTo(15.6f, 14.6f, 18.8f, 16.4f, 19.4f, 20.2f)
        }
    }

    val Settings: ImageVector = vector("settings") {
        stroke {
            moveTo(3f, 6.5f); lineTo(21f, 6.5f)
            moveTo(3f, 12f); lineTo(21f, 12f)
            moveTo(3f, 17.5f); lineTo(21f, 17.5f)
            circle(8.4f, 6.5f, 2.1f)
            circle(15.4f, 12f, 2.1f)
            circle(6.6f, 17.5f, 2.1f)
        }
    }

    val Help: ImageVector = vector("help") {
        stroke {
            circle(12f, 12f, 8.6f)
            moveTo(9.4f, 9.3f)
            curveTo(9.6f, 7.4f, 11f, 6.5f, 12.4f, 6.7f)
            curveTo(14f, 6.9f, 14.9f, 8.3f, 14.4f, 9.8f)
            curveTo(13.9f, 11.2f, 12f, 11.4f, 12f, 13.4f)
            moveTo(12f, 16.4f); lineTo(12f, 16.8f)
        }
    }

    val External: ImageVector = vector("external") {
        stroke {
            moveTo(13f, 5f); lineTo(19f, 5f); lineTo(19f, 11f)
            moveTo(19f, 5f); lineTo(11f, 13f)
            moveTo(17f, 14f); lineTo(17f, 19f); lineTo(5f, 19f); lineTo(5f, 7f); lineTo(10f, 7f)
        }
    }

    val Chevron: ImageVector = vector("chevron") {
        stroke {
            moveTo(9f, 5f); lineTo(16f, 12f); lineTo(9f, 19f)
        }
    }

    val Refresh: ImageVector = vector("refresh") {
        stroke {
            moveTo(20f, 12f)
            curveTo(20f, 7.6f, 16.4f, 4f, 12f, 4f)
            curveTo(9.4f, 4f, 7f, 5.3f, 5.5f, 7.3f)
            moveTo(5.5f, 3.4f); lineTo(5.5f, 7.3f); lineTo(9.4f, 7.3f)
            moveTo(4f, 12f)
            curveTo(4f, 16.4f, 7.6f, 20f, 12f, 20f)
            curveTo(14.6f, 20f, 17f, 18.7f, 18.5f, 16.7f)
            moveTo(18.5f, 20.6f); lineTo(18.5f, 16.7f); lineTo(14.6f, 16.7f)
        }
    }

    /* ----------------------------------------------------------- fabrique */

    private fun vector(name: String, block: ImageVector.Builder.() -> Unit): ImageVector =
        ImageVector.Builder(
            name = name,
            defaultWidth = 24.dp,
            defaultHeight = 24.dp,
            viewportWidth = 24f,
            viewportHeight = 24f,
        ).apply(block).build()

    /** Tracé au trait uniquement — la teinte est appliquée par `Icon`. */
    private fun ImageVector.Builder.stroke(block: androidx.compose.ui.graphics.vector.PathBuilder.() -> Unit) {
        path(
            fill = null,
            stroke = SolidColor(Color.Black),
            strokeLineWidth = 1.7f,
            strokeLineCap = StrokeCap.Round,
            strokeLineJoin = StrokeJoin.Round,
            pathFillType = PathFillType.NonZero,
        ) {
            this.block()
        }
    }

    /** Cercle en quatre courbes (rayon [r], centre [cx], [cy]). */
    private fun androidx.compose.ui.graphics.vector.PathBuilder.circle(cx: Float, cy: Float, r: Float) {
        val k = r * 0.5523f
        moveTo(cx, cy - r)
        curveTo(cx + k, cy - r, cx + r, cy - k, cx + r, cy)
        curveTo(cx + r, cy + k, cx + k, cy + r, cx, cy + r)
        curveTo(cx - k, cy + r, cx - r, cy + k, cx - r, cy)
        curveTo(cx - r, cy - k, cx - k, cy - r, cx, cy - r)
        close()
    }
}
