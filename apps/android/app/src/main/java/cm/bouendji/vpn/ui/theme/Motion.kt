package cm.bouendji.vpn.ui.theme

import androidx.compose.animation.core.FiniteAnimationSpec
import androidx.compose.animation.core.InfiniteRepeatableSpec
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.TweenSpec
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween

/**
 * Spécifications d'animation dérivées des jetons d'identité.
 *
 * Toutes passent par [duration], donc par le réglage « réduire les animations ».
 * Une durée nulle n'est pas un cas dégénéré : c'est un état final immédiat.
 */

fun <T> BrandTheme.brandTween(durationMs: Int): TweenSpec<T> =
    tween(durationMillis = duration(durationMs), easing = motion.easing)

/** Rebond (Otaku) ; retombe sur une transition immédiate si le mouvement est réduit. */
fun <T> BrandTheme.bounceSpec(): FiniteAnimationSpec<T> =
    if (reduceMotion) tween(durationMillis = 0) else spring(dampingRatio = 0.55f, stiffness = 420f)

/** Rotation continue des anneaux (Halo, Otaku). */
fun BrandTheme.spinSpec(): InfiniteRepeatableSpec<Float> = infiniteRepeatable(
    animation = tween(
        durationMillis = motion.spinSeconds.coerceAtLeast(1) * 1_000,
        easing = LinearEasing,
    ),
    repeatMode = RepeatMode.Restart,
)
