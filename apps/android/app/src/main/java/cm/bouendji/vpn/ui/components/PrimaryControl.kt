package cm.bouendji.vpn.ui.components

import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.InfiniteRepeatableSpec
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import cm.bouendji.vpn.R
import cm.bouendji.vpn.brand.BrandTokens
import cm.bouendji.vpn.ui.ControlState
import cm.bouendji.vpn.ui.theme.LocalBrandTheme
import cm.bouendji.vpn.ui.theme.bodyStyle
import cm.bouendji.vpn.ui.theme.brandTween
import cm.bouendji.vpn.ui.theme.labelStyle
import cm.bouendji.vpn.ui.theme.timeStyle

/**
 * La commande principale — **une seule cible**, qui contient son propre temps.
 *
 * Il n'y a pas de chronomètre à côté : l'état, la durée de session observée et
 * l'action vivent dans la même forme, et cette forme change avec l'identité :
 *
 *  - Halo   : anneau circulaire en verre, arc qui tourne pendant la négociation ;
 *  - Mono   : bloc éditorial, chiffres immenses, filets, barre de progression ;
 *  - Vector : console cathodique, trame, segments, ombre dure et enfoncement ;
 *  - Otaku  : pastille manga, contour épais, halo pointillé qui tourne, rebond.
 *
 * Les quatre états ne sont pas quatre couleurs : à l'arrêt l'anneau est ouvert,
 * en connexion il tourne, connecté il se ferme, dégradé il se brise en tirets.
 * Le texte, lui, vient de `strings.xml` et ne change pas d'une identité à
 * l'autre — une marque change de forme, pas de discours.
 */
@Composable
fun PrimaryControl(
    state: ControlState,
    seconds: Long,
    onToggle: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val stateLabel = stringResource(
        when (state) {
            ControlState.Idle -> R.string.state_idle
            ControlState.Connecting -> R.string.state_connecting
            ControlState.Connected -> R.string.state_connected
            ControlState.Degraded -> R.string.state_degraded
        },
    )
    val actionLabel = stringResource(
        when (state) {
            ControlState.Idle -> R.string.action_connect
            ControlState.Connecting -> R.string.action_cancel
            ControlState.Connected, ControlState.Degraded -> R.string.action_disconnect
        },
    )
    val timer = formatSessionDuration(seconds)

    Box(modifier = modifier, contentAlignment = Alignment.Center) {
        when (LocalBrandTheme.current.identity) {
            BrandTokens.Theme.HALO -> HaloControl(state, timer, stateLabel, actionLabel, onToggle)
            BrandTokens.Theme.MONO -> MonoControl(state, timer, stateLabel, actionLabel, onToggle)
            BrandTokens.Theme.VECTOR -> VectorControl(state, timer, stateLabel, actionLabel, onToggle)
            BrandTokens.Theme.OTAKU -> OtakuControl(state, timer, stateLabel, actionLabel, onToggle)
        }
    }
}

/* -------------------------------------------------------------------- Halo */

@Composable
private fun HaloControl(
    state: ControlState,
    timer: String,
    stateLabel: String,
    actionLabel: String,
    onToggle: () -> Unit,
) {
    val theme = LocalBrandTheme.current
    val palette = theme.palette
    val busy = state == ControlState.Connecting || state == ControlState.Degraded
    val angle = rotatingAngle(active = busy, spec = theme.spinSpec())
    val status = stateColor(state)

    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val scale by animateFloatAsState(
        targetValue = if (pressed) 0.985f else 1f,
        animationSpec = theme.brandTween(theme.motion.fast),
        label = "haloPress",
    )
    val glow by animateFloatAsState(
        targetValue = if (state == ControlState.Connected) 1f else 0f,
        animationSpec = theme.brandTween(theme.motion.slow),
        label = "haloGlow",
    )

    Box(modifier = Modifier.size(272.dp), contentAlignment = Alignment.Center) {
        Canvas(Modifier.matchParentSize()) {
            val radius = size.minDimension / 2f - 2.dp.toPx()
            val middle = Offset(size.width / 2f, size.height / 2f)
            val circle = Size(radius * 2f, radius * 2f)
            val topLeft = Offset(middle.x - radius, middle.y - radius)

            if (glow > 0f) {
                drawCircle(
                    brush = Brush.radialGradient(
                        colors = listOf(palette.accent.copy(alpha = 0.20f * glow), Color.Transparent),
                        center = middle,
                        radius = radius,
                    ),
                    radius = radius,
                    center = middle,
                )
            }

            // Le cercle de repos : fin, il laisse voir le fond.
            drawCircle(
                color = palette.glassBorder,
                radius = radius,
                center = middle,
                style = Stroke(width = 1.dp.toPx()),
            )

            when (state) {
                // Anneau ouvert : la session n'a pas commencé.
                ControlState.Idle -> drawArc(
                    color = palette.accent.copy(alpha = 0.55f),
                    startAngle = -90f,
                    sweepAngle = 10f,
                    useCenter = false,
                    topLeft = topLeft,
                    size = circle,
                    style = Stroke(width = 2.dp.toPx(), cap = StrokeCap.Round),
                )

                // Un arc court qui parcourt l'anneau : la négociation est visible.
                ControlState.Connecting -> drawArc(
                    color = palette.accent,
                    startAngle = angle - 90f,
                    sweepAngle = 96f,
                    useCenter = false,
                    topLeft = topLeft,
                    size = circle,
                    style = Stroke(width = 2.5.dp.toPx(), cap = StrokeCap.Round),
                )

                // Anneau fermé et épaissi : le tunnel porte du trafic.
                ControlState.Connected -> drawArc(
                    color = palette.accent,
                    startAngle = -90f,
                    sweepAngle = 360f,
                    useCenter = false,
                    topLeft = topLeft,
                    size = circle,
                    style = Stroke(width = 3.dp.toPx(), cap = StrokeCap.Round),
                )

                // Anneau brisé : la sortie a lâché, la bascule est en cours.
                ControlState.Degraded -> drawArc(
                    color = palette.warning,
                    startAngle = angle - 90f,
                    sweepAngle = 264f,
                    useCenter = false,
                    topLeft = topLeft,
                    size = circle,
                    style = Stroke(
                        width = 2.5.dp.toPx(),
                        cap = StrokeCap.Round,
                        pathEffect = PathEffect.dashPathEffect(
                            floatArrayOf(7.dp.toPx(), 9.dp.toPx()),
                            0f,
                        ),
                    ),
                )
            }
        }

        Column(
            modifier = Modifier
                .size(232.dp)
                .graphicsLayer {
                    scaleX = scale
                    scaleY = scale
                }
                .clip(CircleShape)
                .background(
                    Brush.linearGradient(
                        listOf(
                            palette.surface.copy(alpha = 0.94f),
                            palette.surfaceAlt.copy(alpha = 0.86f),
                        ),
                    ),
                )
                .border(1.dp, palette.glassBorder, CircleShape)
                .clickable(
                    interactionSource = interaction,
                    indication = null,
                    role = Role.Button,
                    onClickLabel = actionLabel,
                    onClick = onToggle,
                )
                .padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            Text(text = stateLabel.uppercase(), style = theme.labelStyle(status))
            Spacer(Modifier.height(8.dp))
            Text(text = timer, style = theme.timeStyle(palette.ink, 46.sp))
            Spacer(Modifier.height(4.dp))
            Text(
                text = stringResource(R.string.session_duration).uppercase(),
                style = theme.labelStyle(palette.muted),
            )
            Spacer(Modifier.height(18.dp))
            Text(
                text = actionLabel.uppercase(),
                style = theme.labelStyle(if (state == ControlState.Idle) palette.accentInk else status)
                    .copy(fontSize = 11.sp),
            )
        }
    }
}

/* -------------------------------------------------------------------- Mono */

@Composable
private fun MonoControl(
    state: ControlState,
    timer: String,
    stateLabel: String,
    actionLabel: String,
    onToggle: () -> Unit,
) {
    val theme = LocalBrandTheme.current
    val palette = theme.palette
    val status = stateColor(state)
    val shape = theme.shapes.control
    val progress = when (state) {
        ControlState.Connecting -> loopingProgress(active = true, durationMs = 1_600)
        ControlState.Connected -> 1f
        ControlState.Degraded -> 0.72f
        ControlState.Idle -> 0f
    }

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(shape)
            .background(palette.surface)
            .border(
                width = if (state == ControlState.Connected) 2.5.dp else 1.5.dp,
                color = if (state == ControlState.Idle) palette.ink else status,
                shape = shape,
            )
            .clickable(
                role = Role.Button,
                onClickLabel = actionLabel,
                onClick = onToggle,
            )
            .padding(horizontal = 20.dp, vertical = 18.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(text = stateLabel.uppercase(), style = theme.labelStyle(status))
            Spacer(Modifier.weight(1f))
            Text(
                text = stringResource(R.string.session_duration).uppercase(),
                style = theme.labelStyle(palette.muted),
            )
        }

        Spacer(Modifier.height(10.dp))
        Text(text = timer, style = theme.timeStyle(palette.ink, 58.sp))
        Spacer(Modifier.height(4.dp))

        // Barre de progression : elle existe à chaque état, elle ne ment pas
        // quand rien n'est connecté (zéro, pas une animation décorative).
        Box(Modifier.fillMaxWidth().height(3.dp).background(palette.line)) {
            if (progress > 0f) {
                Box(
                    Modifier
                        .fillMaxWidth(progress.coerceIn(0f, 1f))
                        .height(3.dp)
                        .background(if (state == ControlState.Degraded) palette.warning else palette.accent),
                )
            }
        }

        Spacer(Modifier.height(14.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                text = actionLabel.uppercase(),
                style = theme.bodyStyle(if (state == ControlState.Idle) palette.accentInk else palette.ink)
                    .copy(fontWeight = theme.type.labelWeight, fontSize = 14.sp, letterSpacing = 1.4.sp),
            )
            Spacer(Modifier.weight(1f))
            Text(
                text = "→",
                style = theme.bodyStyle(palette.accentInk).copy(fontSize = 18.sp),
            )
        }
    }
}

/* ------------------------------------------------------------------ Vector */

@Composable
private fun VectorControl(
    state: ControlState,
    timer: String,
    stateLabel: String,
    actionLabel: String,
    onToggle: () -> Unit,
) {
    val theme = LocalBrandTheme.current
    val palette = theme.palette
    val status = stateColor(state)
    val outline = when (state) {
        ControlState.Idle -> palette.line
        ControlState.Connecting, ControlState.Connected -> palette.accent
        ControlState.Degraded -> palette.warning
    }
    val fill = when (state) {
        ControlState.Connected -> palette.surfaceAlt
        ControlState.Connecting -> palette.surfaceAlt
        else -> palette.surface
    }
    val flow = when (state) {
        ControlState.Connecting -> loopingProgress(active = true, durationMs = 1_100)
        ControlState.Connected -> 1f
        ControlState.Degraded -> 1f
        ControlState.Idle -> 0f
    }

    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val shift = if (pressed) theme.motion.pressShift else 0.dp
    val shadow = (theme.shapes.hardShadow - shift).coerceAtLeast(0.dp)

    Box(Modifier.fillMaxWidth()) {
        // Ombre pleine, pas d'élévation floue : c'est le trait de l'identité.
        Box(
            Modifier
                .matchParentSize()
                .offset(x = shadow, y = shadow)
                .background(palette.ink),
        )
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .offset(x = shift, y = shift)
                .background(fill)
                .border(2.dp, outline)
                .clickable(
                    interactionSource = interaction,
                    indication = null,
                    role = Role.Button,
                    onClickLabel = actionLabel,
                    onClick = onToggle,
                )
                .padding(horizontal = 16.dp, vertical = 16.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(
                    Modifier
                        .size(7.dp)
                        .background(status, CircleShape),
                )
                Spacer(Modifier.size(8.dp))
                Text(
                    text = ">_ ${stateLabel.uppercase()}",
                    style = theme.labelStyle(status).copy(fontSize = 11.sp),
                )
                Spacer(Modifier.weight(1f))
                Text(
                    text = stringResource(R.string.session_duration).uppercase(),
                    style = theme.labelStyle(palette.muted),
                )
            }

            Spacer(Modifier.height(12.dp))
            Text(
                text = timer,
                style = theme.timeStyle(
                    if (state == ControlState.Degraded) palette.warning else palette.accentInk,
                    44.sp,
                ),
            )
            Spacer(Modifier.height(12.dp))

            // Segments : 20 paliers, jamais une barre continue — le mouvement
            // de Vector est un pas, pas une interpolation.
            Canvas(Modifier.fillMaxWidth().height(14.dp)) {
                val count = 20
                val gap = 3.dp.toPx()
                val width = (size.width - gap * (count - 1)) / count
                val lit = when (state) {
                    ControlState.Idle -> 0
                    ControlState.Connecting -> (flow * count).toInt()
                    ControlState.Connected, ControlState.Degraded -> count
                }
                for (index in 0 until count) {
                    val on = index < lit
                    val color = when {
                        !on -> palette.line.copy(alpha = 0.6f)
                        state == ControlState.Degraded -> if (index % 2 == 0) palette.warning else palette.warning.copy(alpha = 0.28f)
                        else -> palette.accent
                    }
                    drawRect(
                        color = color,
                        topLeft = Offset(index * (width + gap), 0f),
                        size = Size(width, size.height),
                    )
                }
            }

            Spacer(Modifier.height(14.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = "[ $actionLabel ]".uppercase(),
                    style = theme.bodyStyle(if (state == ControlState.Idle) palette.accentInk else palette.ink)
                        .copy(fontWeight = theme.type.labelWeight, fontSize = 13.sp, letterSpacing = 1.2.sp),
                )
                Spacer(Modifier.weight(1f))
                Text(
                    text = if (state == ControlState.Connected) "● ON" else "○ OFF",
                    style = theme.labelStyle(if (state == ControlState.Connected) palette.accent else palette.muted),
                )
            }
        }
    }
}

/* ------------------------------------------------------------------- Otaku */

@Composable
private fun OtakuControl(
    state: ControlState,
    timer: String,
    stateLabel: String,
    actionLabel: String,
    onToggle: () -> Unit,
) {
    val theme = LocalBrandTheme.current
    val palette = theme.palette
    val busy = state == ControlState.Connecting || state == ControlState.Degraded
    val angle = rotatingAngle(active = busy, spec = theme.spinSpec())
    val pulse = pulseScale(
        active = state == ControlState.Connected && theme.motion.pulses && !theme.reduceMotion,
    )
    val status = stateColor(state)

    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val shift = if (pressed) theme.motion.pressShift else 0.dp
    val scale by animateFloatAsState(
        targetValue = if (pressed) 0.96f else 1f,
        animationSpec = theme.bounceSpec(),
        label = "otakuPress",
    )

    Box(Modifier.size(276.dp), contentAlignment = Alignment.Center) {
        // Ombre pleine décalée : la pastille a une épaisseur, pas un flou.
        Box(
            Modifier
                .size(236.dp)
                .offset(x = 5.dp + shift, y = 5.dp + shift)
                .background(palette.ink, CircleShape),
        )

        // Halo pointillé : il tourne seulement quand quelque chose se passe.
        Canvas(Modifier.size(262.dp)) {
            val radius = size.minDimension / 2f - 2.dp.toPx()
            val middle = Offset(size.width / 2f, size.height / 2f)
            val topLeft = Offset(middle.x - radius, middle.y - radius)
            val ring = Size(radius * 2f, radius * 2f)
            if (busy || state == ControlState.Connected) {
                drawArc(
                    color = if (state == ControlState.Degraded) palette.warning else palette.accent,
                    startAngle = angle,
                    sweepAngle = 300f,
                    useCenter = false,
                    topLeft = topLeft,
                    size = ring,
                    style = Stroke(
                        width = 3.dp.toPx(),
                        cap = StrokeCap.Round,
                        pathEffect = PathEffect.dashPathEffect(
                            floatArrayOf(5.dp.toPx(), 11.dp.toPx()),
                            0f,
                        ),
                    ),
                )
            }
        }

        Column(
            modifier = Modifier
                .size(236.dp)
                .graphicsLayer {
                    scaleX = scale * pulse
                    scaleY = scale * pulse
                }
                .rotate(theme.shapes.tilt)
                .clip(CircleShape)
                .background(palette.surface)
                .border(3.dp, palette.ink, CircleShape)
                .clickable(
                    interactionSource = interaction,
                    indication = null,
                    role = Role.Button,
                    onClickLabel = actionLabel,
                    onClick = onToggle,
                )
                .padding(22.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            Text(
                text = stateLabel.uppercase(),
                style = theme.labelStyle(if (state == ControlState.Degraded) palette.warning else palette.accentInk)
                    .copy(fontWeight = theme.type.labelWeight, fontSize = 11.sp),
            )
            Spacer(Modifier.height(6.dp))
            Text(text = timer, style = theme.timeStyle(palette.ink, 42.sp))
            Spacer(Modifier.height(14.dp))
            Box(
                modifier = Modifier
                    .clip(theme.shapes.chip)
                    .background(if (state == ControlState.Degraded) palette.warning else palette.accent)
                    .border(2.dp, palette.ink, theme.shapes.chip)
                    .padding(horizontal = 16.dp, vertical = 7.dp),
            ) {
                Text(
                    text = actionLabel.uppercase(),
                    style = theme.bodyStyle(palette.onAccent)
                        .copy(fontWeight = theme.type.labelWeight, fontSize = 11.sp, letterSpacing = 1.1.sp),
                )
            }
        }

        // Étoile de coin : repère de marque, pas une icône d'action.
        Box(
            modifier = Modifier
                .align(Alignment.TopEnd)
                .offset(x = (-14).dp, y = 14.dp)
                .size(30.dp)
                .rotate(12f)
                .clip(CircleShape)
                .background(Color(0xFFFFD84D))
                .border(2.dp, palette.ink, CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = "★",
                style = theme.bodyStyle(palette.ink).copy(fontWeight = theme.type.displayWeight, fontSize = 12.sp),
            )
        }
    }
}

/* ------------------------------------------------------------------ outils */

@Composable
private fun stateColor(state: ControlState): Color {
    val palette = LocalBrandTheme.current.palette
    return when (state) {
        ControlState.Idle -> palette.muted
        ControlState.Connecting -> palette.accentInk
        ControlState.Connected -> palette.positive
        ControlState.Degraded -> palette.warning
    }
}

/**
 * Angle de rotation, ou 0 quand rien ne tourne. La transition infinie n'est
 * créée que si elle sert : un écran au repos ne consomme aucune frame.
 */
@Composable
private fun rotatingAngle(active: Boolean, spec: InfiniteRepeatableSpec<Float>): Float {
    if (!active) return 0f
    val transition = rememberInfiniteTransition(label = "rotation")
    val angle by transition.animateFloat(
        initialValue = 0f,
        targetValue = 360f,
        animationSpec = spec,
        label = "rotationAngle",
    )
    return angle
}

/** Progression en boucle, pour les barres et les segments des états actifs. */
@Composable
private fun loopingProgress(active: Boolean, durationMs: Int): Float {
    if (!active) return 0f
    val transition = rememberInfiniteTransition(label = "progression")
    val value by transition.animateFloat(
        initialValue = 0f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = durationMs, easing = LinearEasing),
            repeatMode = RepeatMode.Restart,
        ),
        label = "progressionValue",
    )
    return value
}

/** Battement de la pastille connectée (Otaku), désactivé si le mouvement est réduit. */
@Composable
private fun pulseScale(active: Boolean): Float {
    if (!active) return 1f
    val transition = rememberInfiniteTransition(label = "battement")
    val value by transition.animateFloat(
        initialValue = 1f,
        targetValue = 1.028f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 1_200, easing = FastOutSlowInEasing),
            repeatMode = RepeatMode.Reverse,
        ),
        label = "battementValue",
    )
    return value
}
