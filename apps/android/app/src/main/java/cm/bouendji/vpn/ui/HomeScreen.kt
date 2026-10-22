package cm.bouendji.vpn.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.scale
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import cm.bouendji.vpn.brand.BrandTokens
import cm.bouendji.vpn.ui.theme.Identity
import cm.bouendji.vpn.vpn.TunnelState
import kotlinx.coroutines.delay

/**
 * L'écran unique de l'application.
 *
 * Il ne raconte que ce que le service a publié : [state] vient de
 * `TunnelStateBus`, [detail] est la phrase du service. Aucun « protégé » n'est
 * affiché tant que le tunnel ne porte pas de trafic.
 */
@Composable
fun VpnHome(
    identity: Identity,
    state: TunnelState,
    detail: String?,
    engineName: String,
    engineAvailable: Boolean,
    hasConfiguration: Boolean,
    dark: Boolean,
    onToggleDark: () -> Unit,
    onToggle: () -> Unit,
    onOpenSupport: () -> Unit,
) {
    var settingsOpen by remember { mutableStateOf(false) }

    val elapsed = rememberElapsedSeconds(state)

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(identity.palette.canvas),
    ) {
        IdentityBackdrop(identity = identity, modifier = Modifier.fillMaxSize())

        Column(
            modifier = Modifier
                .fillMaxSize()
                .statusBarsPadding()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = identity.metrics.gutter),
        ) {
            TopBar(
                identity = identity,
                dark = dark,
                onToggleDark = onToggleDark,
                onSettings = { settingsOpen = true },
                onSupport = onOpenSupport,
            )

            Spacer(Modifier.height(18.dp))

            StatusHeadline(identity = identity, state = state)

            Spacer(Modifier.height(22.dp))

            PowerControl(
                identity = identity,
                state = state,
                elapsedSeconds = elapsed,
                onToggle = onToggle,
                modifier = Modifier.align(Alignment.CenterHorizontally),
            )

            Spacer(Modifier.height(24.dp))

            HonestStatus(
                identity = identity,
                state = state,
                detail = detail,
                hasConfiguration = hasConfiguration,
                engineAvailable = engineAvailable,
            )

            Spacer(Modifier.height(16.dp))

            FactsCard(identity = identity, engineName = engineName)

            Spacer(Modifier.height(28.dp))

            Footer(identity = identity)

            Spacer(Modifier.height(32.dp))
        }

        AnimatedVisibility(
            visible = settingsOpen,
            enter = fadeIn(tween(180)),
            exit = fadeOut(tween(150)),
        ) {
            SettingsOverlay(
                identity = identity,
                engineName = engineName,
                engineAvailable = engineAvailable,
                onClose = { settingsOpen = false },
                onOpenSupport = onOpenSupport,
            )
        }
    }
}

/* ------------------------------------------------------------------ barre */

/**
 * Barre supérieure : **un** élément à gauche, **trois** à droite.
 *
 * Le premier bouton bascule le mode clair/sombre — il ne change pas
 * l'identité, qui est injectée au build (D30) et n'a pas à être choisie par
 * l'utilisateur.
 */
@Composable
private fun TopBar(
    identity: Identity,
    dark: Boolean,
    onToggleDark: () -> Unit,
    onSettings: () -> Unit,
    onSupport: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(identity.metrics.topBar),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(
                modifier = Modifier
                    .size(if (identity.theme == BrandTokens.Theme.OTAKU) 14.dp else 10.dp)
                    .background(identity.palette.accent, RoundedCornerShape(identity.metrics.radiusChip)),
            )
            Spacer(Modifier.width(10.dp))
            Text(
                text = BrandTokens.appName,
                style = identity.type.label.copy(letterSpacing = 1.4.sp),
                color = identity.palette.inkSoft,
            )
        }

        Spacer(Modifier.weight(1f))

        // 1 / 3 — contraste. Il change réellement le mode : l'identité, elle,
        // est injectée au build (D30) et n'est pas un choix de l'utilisateur.
        IconButton(
            identity = identity,
            glyph = Glyph.CONTRAST,
            label = if (dark) "Passer en clair" else "Passer en sombre",
            onClick = onToggleDark,
        )

        // 2 / 3 — support de la marque (D19).
        IconButton(
            identity = identity,
            glyph = Glyph.EXTERNAL,
            label = "Contacter le support",
            onClick = onSupport,
        )

        // 3 / 3 — réglages et mentions.
        IconButton(
            identity = identity,
            glyph = Glyph.SLIDERS,
            label = "Réglages",
            onClick = onSettings,
        )
    }
}

@Composable
private fun IconButton(
    identity: Identity,
    glyph: Glyph,
    label: String,
    onClick: () -> Unit,
) {
    Box(
        modifier = Modifier
            .size(44.dp)
            .clip(RoundedCornerShape(identity.metrics.radiusChip))
            .clickable(onClick = onClick)
            .semantics { contentDescription = label },
        contentAlignment = Alignment.Center,
    ) {
        GlyphIcon(
            glyph = glyph,
            tint = identity.palette.inkSoft,
            modifier = Modifier.size(19.dp),
        )
    }
}

/* ---------------------------------------------------------------- titre */

@Composable
private fun StatusHeadline(identity: Identity, state: TunnelState) {
    val (title, overline) = when (state) {
        TunnelState.STOPPED -> "Hors ligne" to "état du tunnel"
        TunnelState.CONNECTING -> "Connexion" to "état du tunnel"
        TunnelState.CONNECTED -> "En ligne" to "état du tunnel"
        TunnelState.RECONNECTING -> "Reconnexion" to "état du tunnel"
        TunnelState.NO_CONNECTION -> "Aucune sortie" to "état du tunnel"
        TunnelState.SUBSCRIPTION_EXPIRED -> "Abonnement expiré" to "état du tunnel"
        TunnelState.DEVICE_REVOKED -> "Appareil révoqué" to "état du tunnel"
    }

    Column {
        Text(
            text = overline.uppercase(),
            style = identity.type.label,
            color = identity.palette.inkFaint,
        )
        Spacer(Modifier.height(6.dp))
        Text(
            text = title,
            style = identity.type.title,
            color = identity.palette.ink,
        )
    }
}

/* --------------------------------------------------------- contrôle principal */

/**
 * Le contrôle principal : un disque, un état, **et le chrono à l'intérieur**.
 *
 * C'est le seul bouton de l'écran. Le temps de connexion n'est pas une
 * statistique décorative : il ne s'affiche que si l'état est `CONNECTED`, et
 * repart de zéro à chaque reconnexion.
 */
@Composable
private fun PowerControl(
    identity: Identity,
    state: TunnelState,
    elapsedSeconds: Long,
    onToggle: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val palette = identity.palette
    val size = identity.metrics.control
    val accent = stateColor(state, identity)

    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val scale by animateFloatAsState(
        targetValue = if (pressed) 0.965f else 1f,
        animationSpec = tween(120),
        label = "pression",
    )

    val infinite = rememberInfiniteTransition(label = "anneau")
    val turn by infinite.animateFloat(
        initialValue = 0f,
        targetValue = 360f,
        animationSpec = infiniteRepeatable(
            animation = tween(1_400),
            repeatMode = RepeatMode.Restart,
        ),
        label = "rotation",
    )

    val busy = state == TunnelState.CONNECTING || state == TunnelState.RECONNECTING
    val live = state == TunnelState.CONNECTED

    Box(
        modifier = modifier
            .size(size)
            .scale(scale)
            .clickable(
                interactionSource = interaction,
                indication = null,
                onClick = onToggle,
            ),
        contentAlignment = Alignment.Center,
    ) {
        Canvas(Modifier.fillMaxSize()) {
            // Échelle atelier : l'orbe fait 210, l'anneau r = 100, trait 6.
            val u = this.size.width / 210f
            val center = Offset(this.size.width / 2f, this.size.height / 2f)
            val arcBox = Offset(center.x - 100f * u, center.y - 100f * u)
            val arcSize = Size(200f * u, 200f * u)

            // Piste, toujours visible.
            drawCircle(
                color = palette.line,
                radius = 100f * u,
                center = center,
                style = Stroke(width = 6f * u),
            )

            if (live) {
                // Halo en trois passes : l'équivalent du
                // `drop-shadow(0 0 9px rgba(10,124,255,.42))` de l'atelier.
                // Anneau complet : le tunnel est établi, il n'y a aucune
                // « progression » à inventer.
                drawArc(
                    color = accent.copy(alpha = 0.10f),
                    startAngle = 0f,
                    sweepAngle = 360f,
                    useCenter = false,
                    topLeft = arcBox,
                    size = arcSize,
                    style = Stroke(width = 14f * u),
                )
                drawArc(
                    color = accent.copy(alpha = 0.22f),
                    startAngle = 0f,
                    sweepAngle = 360f,
                    useCenter = false,
                    topLeft = arcBox,
                    size = arcSize,
                    style = Stroke(width = 10f * u),
                )
                drawArc(
                    color = accent,
                    startAngle = -90f,
                    sweepAngle = 360f,
                    useCenter = false,
                    topLeft = arcBox,
                    size = arcSize,
                    style = Stroke(width = 6f * u, cap = StrokeCap.Round),
                )
            }

            if (busy) {
                rotate(turn, center) {
                    drawArc(
                        color = accent,
                        startAngle = -90f,
                        sweepAngle = 96f,
                        useCenter = false,
                        topLeft = arcBox,
                        size = arcSize,
                        style = Stroke(width = 6f * u, cap = StrokeCap.Round),
                    )
                }
            }
        }

        // Le disque intérieur : le verre de l'atelier (186/210), jamais un aplat.
        // Dégradés et ombres recopiés de `.halo-orb-in` (atelier.css).
        val discShape = RoundedCornerShape(identity.metrics.radiusChip)
        val discEdge = if (identity.dark) palette.line else Color(0xF2FFFFFF)
        val discSpot = if (identity.dark) Color(0xF2000000) else Color(0x8C143778)
        val discStops = if (identity.dark) {
            arrayOf(
                0f to Color(0xFF22304A),
                0.42f to Color(0xF0182236),
                1f to Color(0xF50E1522),
            )
        } else {
            arrayOf(
                0f to Color(0xFFFFFFFF),
                0.38f to Color(0xD1FFFFFF),
                0.72f to Color(0x9EF0F7FF),
                1f to Color(0x8CE2EEFF),
            )
        }
        Box(
            modifier = Modifier
                .size(size * 0.90f)
                .shadow(
                    elevation = 16.dp,
                    shape = discShape,
                    spotColor = discSpot,
                    ambientColor = discSpot.copy(alpha = 0.5f),
                )
                .clip(discShape)
                .border(
                    width = if (live) 1.5.dp else identity.metrics.border,
                    color = if (live) accent.copy(alpha = 0.65f) else discEdge,
                    shape = discShape,
                ),
            contentAlignment = Alignment.Center,
        ) {
            Canvas(Modifier.fillMaxSize()) {
                val discCenter = Offset(this.size.width / 2f, this.size.height / 2f)
                drawCircle(
                    brush = Brush.radialGradient(
                        colorStops = discStops,
                        center = Offset(this.size.width * 0.28f, this.size.height * 0.08f),
                        radius = this.size.width * 1.2f,
                    ),
                    radius = this.size.minDimension / 2f,
                    center = discCenter,
                )
                // Reflet haut : l'`inset 0 1px 0 #fff` de l'atelier.
                val glare = this.size.minDimension / 2f - 2.dp.toPx()
                drawArc(
                    color = Color.White.copy(alpha = if (identity.dark) 0.22f else 0.9f),
                    startAngle = 200f,
                    sweepAngle = 140f,
                    useCenter = false,
                    topLeft = Offset(discCenter.x - glare, discCenter.y - glare),
                    size = Size(glare * 2f, glare * 2f),
                    style = Stroke(width = 1.5.dp.toPx()),
                )
            }
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center,
            ) {
                when (state) {
                    TunnelState.CONNECTED -> {
                        Text(
                            text = formatElapsed(elapsedSeconds),
                            style = identity.type.display,
                            color = palette.ink,
                            textAlign = TextAlign.Center,
                        )
                        Spacer(Modifier.height(4.dp))
                        Text(
                            text = "TUNNEL ACTIF",
                            style = identity.type.label,
                            color = accent,
                        )
                    }

                    TunnelState.CONNECTING, TunnelState.RECONNECTING -> {
                        Text(
                            text = if (state == TunnelState.CONNECTING) "CONNEXION" else "REPRISE",
                            style = identity.type.label,
                            color = accent,
                        )
                        Spacer(Modifier.height(8.dp))
                        Text(
                            text = "…",
                            style = identity.type.display,
                            color = palette.ink,
                        )
                    }

                    TunnelState.STOPPED -> {
                        GlyphIcon(
                            glyph = Glyph.POWER,
                            tint = accent,
                            modifier = Modifier.size(38.dp),
                            strokeDp = 1.8f,
                        )
                        Spacer(Modifier.height(10.dp))
                        Text(
                            text = "APPUYER",
                            style = identity.type.label,
                            color = palette.inkSoft,
                        )
                    }

                    TunnelState.NO_CONNECTION -> {
                        Text(
                            text = "AUCUNE",
                            style = identity.type.display.copy(fontSize = 28.sp),
                            color = palette.bad,
                        )
                        Text(
                            text = "SORTIE",
                            style = identity.type.display.copy(fontSize = 28.sp),
                            color = palette.bad,
                        )
                    }

                    TunnelState.SUBSCRIPTION_EXPIRED -> {
                        Text(
                            text = "ABONNEMENT",
                            style = identity.type.label,
                            color = palette.bad,
                        )
                        Text(
                            text = "EXPIRÉ",
                            style = identity.type.title,
                            color = palette.bad,
                        )
                    }

                    TunnelState.DEVICE_REVOKED -> {
                        Text(
                            text = "APPAREIL",
                            style = identity.type.label,
                            color = palette.bad,
                        )
                        Text(
                            text = "RÉVOQUÉ",
                            style = identity.type.title,
                            color = palette.bad,
                        )
                    }
                }
            }
        }
    }
}

/* ------------------------------------------------------------- état honnête */

@Composable
private fun HonestStatus(
    identity: Identity,
    state: TunnelState,
    detail: String?,
    hasConfiguration: Boolean,
    engineAvailable: Boolean,
) {
    val message = when {
        detail != null -> detail
        !engineAvailable -> "Le moteur sing-box n'est pas chargé dans cette version."
        !hasConfiguration -> "Aucune configuration sur l'appareil. Importez un bundle signé."
        state == TunnelState.CONNECTED -> "Le tunnel est monté et porte le trafic."
        state == TunnelState.STOPPED -> "Le tunnel est arrêté. Rien ne sort par lui."
        else -> null
    }

    Card(identity = identity) {
        Text(
            text = "DIAGNOSTIC",
            style = identity.type.label,
            color = identity.palette.inkFaint,
        )
        Spacer(Modifier.height(10.dp))
        Text(
            text = message ?: "—",
            style = identity.type.body,
            color = if (state == TunnelState.NO_CONNECTION) identity.palette.bad else identity.palette.ink,
        )
    }
}

/* -------------------------------------------------------------------- faits */

@Composable
private fun FactsCard(identity: Identity, engineName: String) {
    Card(identity = identity) {
        Text(
            text = "INTERFACE",
            style = identity.type.label,
            color = identity.palette.inkFaint,
        )
        Spacer(Modifier.height(12.dp))

        FactRow(identity, "Adresse", "172.19.0.1/30")
        FactRow(identity, "MTU", "1500")
        FactRow(identity, "DNS", "1.1.1.1 · 1.0.0.1")
        FactRow(identity, "Moteur", engineName)
    }
}

@Composable
private fun FactRow(identity: Identity, label: String, value: String) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(text = label, style = identity.type.subtitle, color = identity.palette.inkSoft)
        Spacer(Modifier.weight(1f))
        Text(text = value, style = identity.type.mono, color = identity.palette.ink)
    }
}

@Composable
private fun Footer(identity: Identity) {
    Column {
        Text(
            text = identity.promise,
            style = identity.type.subtitle,
            color = identity.palette.inkSoft,
        )
        Spacer(Modifier.height(6.dp))
        Text(
            text = "${BrandTokens.appName} · ${BrandTokens.appVersion}",
            style = identity.type.mono,
            color = identity.palette.inkFaint,
        )
    }
}

/* ------------------------------------------------------------------ carte */

/**
 * Carte commune aux quatre directions.
 *
 * Elle n'a pas d'ombre douce : le relief est un trait. Pour **Otaku**
 * uniquement, une ombre dure est dessinée derrière, décalée — c'est le seul
 * endroit où la direction s'autorise un décalage.
 */
@Composable
private fun Card(
    identity: Identity,
    modifier: Modifier = Modifier,
    content: @Composable ColumnScope.() -> Unit,
) {
    val shape = RoundedCornerShape(identity.metrics.radiusCard)
    val hardShadow = identity.theme == BrandTokens.Theme.OTAKU

    Box(modifier = modifier.fillMaxWidth()) {
        if (hardShadow) {
            Box(
                modifier = Modifier
                    .matchParentSize()
                    .padding(start = 5.dp, top = 5.dp)
                    .clip(shape)
                    .background(identity.palette.ink),
            )
        }

        Column(
            modifier = Modifier
                .fillMaxWidth()
                .clip(shape)
                .background(identity.palette.surface)
                .border(identity.metrics.border, identity.palette.line, shape)
                .padding(18.dp),
            content = content,
        )
    }
}

/* ---------------------------------------------------------------- réglages */

@Composable
private fun SettingsOverlay(
    identity: Identity,
    engineName: String,
    engineAvailable: Boolean,
    onClose: () -> Unit,
    onOpenSupport: () -> Unit,
) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Black.copy(alpha = 0.45f))
            .clickable(onClick = onClose),
    ) {
        Column(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .fillMaxWidth()
                .padding(12.dp)
                .clip(RoundedCornerShape(identity.metrics.radiusSheet))
                .background(identity.palette.surfaceStrong)
                .border(identity.metrics.border, identity.palette.line, RoundedCornerShape(identity.metrics.radiusSheet))
                .padding(22.dp)
                .clickable(
                    interactionSource = remember { MutableInteractionSource() },
                    indication = null,
                ) { /* les clics sur la feuille ne la ferment pas */ },
        ) {
            Text(
                text = "RÉGLAGES",
                style = identity.type.label,
                color = identity.palette.inkFaint,
            )
            Spacer(Modifier.height(14.dp))

            FactRow(identity, "Direction", identity.direction)
            FactRow(identity, "Moteur", engineName)
            FactRow(identity, "Bibliothèque", if (engineAvailable) "chargée" else "absente")
            FactRow(identity, "Version", BrandTokens.appVersion)
            FactRow(identity, "Locale", BrandTokens.defaultLocale)

            Spacer(Modifier.height(18.dp))

            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(identity.metrics.radiusChip))
                    .background(identity.palette.accent)
                    .clickable(onClick = onOpenSupport)
                    .padding(vertical = 14.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = "Contacter le support",
                    style = identity.type.title.copy(fontSize = 14.sp),
                    color = identity.palette.accentInk,
                )
            }

            Spacer(Modifier.height(10.dp))

            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(identity.metrics.radiusChip))
                    .border(identity.metrics.border, identity.palette.line, RoundedCornerShape(identity.metrics.radiusChip))
                    .clickable(onClick = onClose)
                    .padding(vertical = 14.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = "Fermer",
                    style = identity.type.subtitle,
                    color = identity.palette.inkSoft,
                )
            }
        }
    }
}

/* ------------------------------------------------------------------ outils */

@Composable
private fun rememberElapsedSeconds(state: TunnelState): Long {
    var since by remember { mutableStateOf<Long?>(null) }
    var elapsed by remember { mutableStateOf(0L) }

    LaunchedEffect(state) {
        if (state == TunnelState.CONNECTED) {
            if (since == null) since = System.currentTimeMillis()
        } else {
            since = null
            elapsed = 0L
        }
    }

    LaunchedEffect(since) {
        val start = since ?: return@LaunchedEffect
        while (true) {
            elapsed = ((System.currentTimeMillis() - start) / 1000L).coerceAtLeast(0L)
            delay(1_000)
        }
    }

    return elapsed
}

private fun formatElapsed(seconds: Long): String {
    val hours = seconds / 3600
    val minutes = (seconds % 3600) / 60
    val rest = seconds % 60
    return if (hours > 0) {
        "%d:%02d:%02d".format(hours, minutes, rest)
    } else {
        "%02d:%02d".format(minutes, rest)
    }
}

private fun stateColor(state: TunnelState, identity: Identity): Color {
    val palette = identity.palette
    return when (state) {
        TunnelState.CONNECTED -> palette.ok
        TunnelState.CONNECTING, TunnelState.RECONNECTING -> palette.warn
        TunnelState.NO_CONNECTION,
        TunnelState.SUBSCRIPTION_EXPIRED,
        TunnelState.DEVICE_REVOKED,
        -> palette.bad

        TunnelState.STOPPED -> palette.accent
    }
}
