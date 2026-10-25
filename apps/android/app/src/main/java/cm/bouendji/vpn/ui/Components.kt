package cm.bouendji.vpn.ui

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import cm.bouendji.vpn.ui.theme.Identity
import cm.bouendji.vpn.ui.theme.LocalIdentity
import cm.bouendji.vpn.vpn.TunnelState

/*
 * Composants de l'application. Règles tenues ici, pour toutes les marques :
 *
 * - aucune ombre, aucune élévation : la hiérarchie vient de la typographie, de
 *   l'espace et d'un filet (`palette.line`) ;
 * - pas de carte par défaut : les contenus sont des listes à filets ;
 * - cibles tactiles ≥ 48 dp (Android) — au-delà des 44 pt du HIG ;
 * - champs sobres façon Apple : fond plein discret, libellé au-dessus, pas de
 *   contour au repos, contour d'accent seulement au focus (visibilité du focus) ;
 * - toutes les couleurs viennent de [Identity] (marque injectée au build).
 */

private val Hairline: Dp = 1.dp

@Composable
fun IdentityTheme(identity: Identity, content: @Composable () -> Unit) {
    val p = identity.palette
    val scheme = if (identity.dark) {
        darkColorScheme(
            primary = p.accent, onPrimary = p.accentInk, background = p.canvas, onBackground = p.ink,
            surface = p.canvasAlt, onSurface = p.ink, surfaceVariant = p.surface, onSurfaceVariant = p.inkSoft,
            surfaceTint = p.canvasAlt, error = p.bad, outline = p.line, outlineVariant = p.line,
            surfaceContainerHigh = p.canvasAlt, surfaceContainerHighest = p.canvasAlt,
        )
    } else {
        lightColorScheme(
            primary = p.accent, onPrimary = p.accentInk, background = p.canvas, onBackground = p.ink,
            surface = p.surfaceStrong, onSurface = p.ink, surfaceVariant = p.surface, onSurfaceVariant = p.inkSoft,
            surfaceTint = p.surfaceStrong, error = p.bad, outline = p.line, outlineVariant = p.line,
            surfaceContainerHigh = p.surfaceStrong, surfaceContainerHighest = p.surfaceStrong,
        )
    }
    MaterialTheme(colorScheme = scheme) {
        CompositionLocalProvider(LocalIdentity provides identity, content = content)
    }
}

/* ------------------------------------------------------------------ mise en page */

/**
 * Page défilante : titre large aligné à gauche (HIG « large title »), retour
 * optionnel. Les barres système sont gérées par l'appelant (insets).
 */
@Composable
fun Page(
    title: String,
    onBack: (() -> Unit)? = null,
    trailing: (@Composable () -> Unit)? = null,
    content: @Composable ColumnScope.() -> Unit,
) {
    val id = LocalIdentity.current
    Column(Modifier.fillMaxSize()) {
        Row(
            Modifier.fillMaxWidth().height(52.dp).padding(horizontal = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (onBack != null) IconAction(Glyph.BACK, "Retour", onBack) else Spacer(Modifier.width(16.dp))
            Spacer(Modifier.weight(1f))
            trailing?.invoke()
        }
        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState()).imePadding()
                .padding(horizontal = 20.dp),
        ) {
            Text(
                title,
                style = id.type.title.copy(fontSize = 30.sp, lineHeight = 36.sp),
                color = id.palette.ink,
                modifier = Modifier.semantics { heading() },
            )
            Spacer(Modifier.height(20.dp))
            content()
            Spacer(Modifier.height(32.dp))
        }
    }
}

@Composable
fun SectionHeader(text: String, modifier: Modifier = Modifier) {
    val id = LocalIdentity.current
    Text(
        text.uppercase(),
        style = id.type.label.copy(fontSize = 12.sp, letterSpacing = 0.8.sp),
        color = id.palette.inkSoft,
        modifier = modifier.padding(top = 24.dp, bottom = 6.dp).semantics { heading() },
    )
}

@Composable
fun Divider(inset: Dp = 0.dp) {
    val id = LocalIdentity.current
    Box(Modifier.fillMaxWidth().padding(start = inset).height(Hairline).background(id.palette.line))
}

/** Ligne de liste : titre, détail, valeur à droite, chevron si navigable. */
@Composable
fun ListRow(
    title: String,
    subtitle: String? = null,
    value: String? = null,
    destructive: Boolean = false,
    showChevron: Boolean = false,
    leading: Glyph? = null,
    enabled: Boolean = true,
    onClick: (() -> Unit)? = null,
    trailing: (@Composable () -> Unit)? = null,
) {
    val id = LocalIdentity.current
    val base = Modifier.fillMaxWidth().heightIn(min = 52.dp)
    val clickable = if (onClick != null) base.clickable(enabled = enabled, role = Role.Button, onClick = onClick) else base
    Row(clickable.padding(vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
        if (leading != null) {
            GlyphIcon(leading, if (destructive) id.palette.bad else id.palette.inkSoft, Modifier.size(22.dp))
            Spacer(Modifier.width(14.dp))
        }
        Column(Modifier.weight(1f)) {
            Text(
                title,
                style = id.type.body.copy(fontSize = 16.sp, lineHeight = 21.sp),
                color = when {
                    !enabled -> id.palette.inkFaint
                    destructive -> id.palette.bad
                    onClick != null && leading == null && trailing == null && value == null && !showChevron -> id.palette.accent
                    else -> id.palette.ink
                },
            )
            if (subtitle != null) {
                Spacer(Modifier.height(2.dp))
                Text(subtitle, style = id.type.body.copy(fontSize = 13.sp, lineHeight = 18.sp), color = id.palette.inkSoft)
            }
        }
        if (value != null) {
            Spacer(Modifier.width(12.dp))
            Text(value, style = id.type.body.copy(fontSize = 15.sp), color = id.palette.inkSoft, textAlign = TextAlign.End, maxLines = 2)
        }
        trailing?.let { Spacer(Modifier.width(8.dp)); it() }
        if (showChevron) {
            Spacer(Modifier.width(6.dp))
            Text("›", color = id.palette.inkFaint, fontSize = 22.sp)
        }
    }
}

@Composable
fun SwitchRow(title: String, subtitle: String?, checked: Boolean, onChecked: (Boolean) -> Unit) {
    val id = LocalIdentity.current
    ListRow(title = title, subtitle = subtitle, onClick = { onChecked(!checked) }, trailing = {
        Switch(
            checked = checked, onCheckedChange = onChecked,
            colors = SwitchDefaults.colors(
                checkedTrackColor = id.palette.accent, checkedThumbColor = id.palette.accentInk,
                uncheckedTrackColor = id.palette.surface, uncheckedBorderColor = id.palette.line,
                uncheckedThumbColor = id.palette.inkFaint,
            ),
        )
    })
}

/* ------------------------------------------------------------------- actions */

@Composable
fun PrimaryButton(label: String, onClick: () -> Unit, enabled: Boolean = true, loading: Boolean = false, modifier: Modifier = Modifier) {
    val id = LocalIdentity.current
    val active = enabled && !loading
    Box(
        modifier.fillMaxWidth().height(52.dp).clip(RoundedCornerShape(14.dp))
            .background(if (active) id.palette.accent else id.palette.surface)
            .clickable(enabled = active, role = Role.Button, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        if (loading) {
            CircularProgressIndicator(color = id.palette.inkSoft, strokeWidth = 2.dp, modifier = Modifier.size(20.dp))
        } else {
            Text(label, color = if (active) id.palette.accentInk else id.palette.inkFaint, fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
        }
    }
}

@Composable
fun TextAction(label: String, onClick: () -> Unit, destructive: Boolean = false, enabled: Boolean = true, modifier: Modifier = Modifier) {
    val id = LocalIdentity.current
    Box(
        modifier.heightIn(min = 48.dp).clip(RoundedCornerShape(10.dp))
            .clickable(enabled = enabled, role = Role.Button, onClick = onClick).padding(horizontal = 8.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            label, fontSize = 16.sp, fontWeight = FontWeight.Medium,
            color = when { !enabled -> id.palette.inkFaint; destructive -> id.palette.bad; else -> id.palette.accent },
        )
    }
}

@Composable
fun IconAction(glyph: Glyph, label: String, onClick: () -> Unit) {
    val id = LocalIdentity.current
    Box(
        Modifier.size(48.dp).clip(CircleShape).clickable(role = Role.Button, onClick = onClick)
            .semantics { contentDescription = label },
        contentAlignment = Alignment.Center,
    ) { GlyphIcon(glyph, id.palette.ink, Modifier.size(22.dp)) }
}

/* -------------------------------------------------------------------- saisie */

/**
 * Champ de saisie sobre : libellé au-dessus, fond plein discret, aucun contour
 * au repos ; filet d'accent au focus, message d'erreur dessous.
 */
@Composable
fun TextInput(
    label: String,
    value: String,
    onValueChange: (String) -> Unit,
    keyboardType: KeyboardType = KeyboardType.Text,
    password: Boolean = false,
    error: String? = null,
    hint: String? = null,
    imeAction: ImeAction = ImeAction.Next,
    onImeAction: (() -> Unit)? = null,
) {
    val id = LocalIdentity.current
    val interaction = remember { MutableInteractionSource() }
    val focused by interaction.collectIsFocusedAsState()
    var reveal by rememberSaveable { mutableStateOf(false) }
    Column(Modifier.fillMaxWidth().padding(bottom = 14.dp)) {
        Text(label, style = id.type.body.copy(fontSize = 13.sp), color = id.palette.inkSoft)
        Spacer(Modifier.height(6.dp))
        Row(
            Modifier.fillMaxWidth().heightIn(min = 52.dp).clip(RoundedCornerShape(12.dp))
                .background(id.palette.surface)
                .border(
                    width = if (focused || error != null) 1.5.dp else 0.dp,
                    color = when { error != null -> id.palette.bad; focused -> id.palette.accent; else -> Color.Transparent },
                    shape = RoundedCornerShape(12.dp),
                )
                .padding(start = 14.dp, end = if (password) 0.dp else 14.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            BasicTextField(
                value = value,
                onValueChange = onValueChange,
                singleLine = true,
                interactionSource = interaction,
                textStyle = TextStyle(color = id.palette.ink, fontSize = 16.sp),
                cursorBrush = SolidColor(id.palette.accent),
                visualTransformation = if (password && !reveal) PasswordVisualTransformation() else VisualTransformation.None,
                keyboardOptions = KeyboardOptions(keyboardType = keyboardType, imeAction = imeAction, autoCorrect = false),
                keyboardActions = KeyboardActions(onAny = { onImeAction?.invoke() }),
                modifier = Modifier.weight(1f).padding(vertical = 14.dp).semantics { contentDescription = label },
            )
            if (password) {
                TextAction(if (reveal) "Masquer" else "Afficher", onClick = { reveal = !reveal })
            }
        }
        val below = error ?: hint
        if (below != null) {
            Spacer(Modifier.height(4.dp))
            Text(below, style = id.type.body.copy(fontSize = 13.sp, lineHeight = 17.sp), color = if (error != null) id.palette.bad else id.palette.inkFaint)
        }
    }
}

/** Contrôle segmenté (HIG) : piste pleine, segment choisi teinté, pas d'ombre. */
@Composable
fun Segmented(options: List<String>, selectedIndex: Int, onSelect: (Int) -> Unit) {
    val id = LocalIdentity.current
    Row(
        Modifier.fillMaxWidth().height(44.dp).clip(RoundedCornerShape(12.dp)).background(id.palette.surface).padding(3.dp),
    ) {
        options.forEachIndexed { index, option ->
            val chosen = index == selectedIndex
            Box(
                Modifier.weight(1f).fillMaxSize().clip(RoundedCornerShape(9.dp))
                    .background(if (chosen) id.palette.canvas else Color.Transparent)
                    .border(if (chosen) Hairline else 0.dp, if (chosen) id.palette.line else Color.Transparent, RoundedCornerShape(9.dp))
                    .clickable(role = Role.Tab) { onSelect(index) }
                    .semantics { selected = chosen },
                contentAlignment = Alignment.Center,
            ) {
                Text(option, fontSize = 14.sp, fontWeight = if (chosen) FontWeight.SemiBold else FontWeight.Normal,
                    color = if (chosen) id.palette.ink else id.palette.inkSoft, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
    }
}

/* ------------------------------------------------------------------- signaux */

enum class Tone { INFO, WARN, BAD, OK }

/** Bandeau non bloquant (D61) : fond teinté léger, pas d'ombre, une action au plus. */
@Composable
fun Banner(text: String, tone: Tone = Tone.WARN, action: String? = null, onAction: (() -> Unit)? = null) {
    val id = LocalIdentity.current
    val color = when (tone) { Tone.INFO -> id.palette.accent; Tone.WARN -> id.palette.warn; Tone.BAD -> id.palette.bad; Tone.OK -> id.palette.ok }
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(color.copy(alpha = 0.12f))
            .padding(start = 14.dp, end = 6.dp, top = 10.dp, bottom = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(8.dp).background(color, CircleShape))
        Spacer(Modifier.width(10.dp))
        Text(text, style = id.type.body.copy(fontSize = 14.sp, lineHeight = 19.sp), color = id.palette.ink, modifier = Modifier.weight(1f))
        if (action != null && onAction != null) TextAction(action, onAction)
    }
}

/**
 * Bouton d'alimentation. Un seul geste, un état lisible sans couleur (libellé +
 * `stateDescription`). Aucune ombre ni lueur : un anneau, plein quand le
 * tunnel porte du trafic.
 */
@Composable
fun PowerButton(state: TunnelState, enabled: Boolean, reduceMotion: Boolean, onClick: () -> Unit) {
    val id = LocalIdentity.current
    val connected = state == TunnelState.CONNECTED
    val working = state == TunnelState.CONNECTING || state == TunnelState.RECONNECTING
    val sweep = if (working && !reduceMotion) {
        val transition = rememberInfiniteTransition(label = "power")
        transition.animateFloat(0f, 360f, infiniteRepeatable(tween(1_100, easing = LinearEasing), RepeatMode.Restart), label = "spin").value
    } else 0f
    Box(
        Modifier.size(176.dp).clip(CircleShape)
            .background(if (connected) id.palette.accent else id.palette.surface)
            .clickable(enabled = enabled, role = Role.Button, onClick = onClick)
            .semantics {
                contentDescription = if (connected || working) "Déconnecter le VPN" else "Connecter le VPN"
                stateDescription = when { connected -> "Connecté"; working -> "Connexion en cours"; else -> "Déconnecté" }
            },
        contentAlignment = Alignment.Center,
    ) {
        Canvas(Modifier.fillMaxSize().padding(6.dp)) {
            val stroke = 3.dp.toPx()
            if (!connected) drawCircle(color = id.palette.line, style = Stroke(stroke))
            if (working) {
                drawArc(
                    color = id.palette.accent, startAngle = sweep - 90f, sweepAngle = if (reduceMotion) 360f else 90f,
                    useCenter = false, topLeft = Offset(stroke / 2, stroke / 2),
                    size = Size(size.width - stroke, size.height - stroke), style = Stroke(stroke, cap = StrokeCap.Round),
                )
            }
        }
        GlyphIcon(
            Glyph.POWER,
            when { connected -> id.palette.accentInk; enabled -> id.palette.ink; else -> id.palette.inkFaint },
            Modifier.size(56.dp),
            strokeDp = 3f,
        )
    }
}

/** Barre d'onglets basse : libellés visibles, filet supérieur, pas de flou ni d'ombre. */
@Composable
fun TabBar(items: List<Triple<Glyph, String, Boolean>>, onSelect: (Int) -> Unit) {
    val id = LocalIdentity.current
    Column(Modifier.fillMaxWidth().background(id.palette.canvas).navigationBarsPadding()) {
        Divider()
        Row(Modifier.fillMaxWidth().height(58.dp)) {
            items.forEachIndexed { index, (glyph, label, selected) ->
                Column(
                    Modifier.weight(1f).fillMaxSize().clickable(role = Role.Tab) { onSelect(index) }
                        .semantics { this.selected = selected },
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.Center,
                ) {
                    GlyphIcon(glyph, if (selected) id.palette.accent else id.palette.inkSoft, Modifier.size(22.dp))
                    Spacer(Modifier.height(3.dp))
                    Text(label, fontSize = 11.sp, fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Medium,
                        color = if (selected) id.palette.accent else id.palette.inkSoft)
                }
            }
        }
    }
}

/** Fond de l'application : une couleur pleine, et les barres système par-dessus. */
@Composable
fun Backdrop(content: @Composable () -> Unit) {
    val id = LocalIdentity.current
    Box(Modifier.fillMaxSize().background(id.palette.canvas).statusBarsPadding()) { content() }
}
