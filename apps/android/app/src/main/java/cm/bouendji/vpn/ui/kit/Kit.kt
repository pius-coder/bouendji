package cm.bouendji.vpn.ui.kit

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.scale
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import cm.bouendji.vpn.ui.theme.Fonts
import cm.bouendji.vpn.ui.theme.LocalTokens

/* ------------------------------------------------------------------ texte */

@Composable
fun T(
    text: String,
    color: Color = LocalTokens.current.label,
    size: TextUnit = 16.sp,
    weight: FontWeight = FontWeight.Normal,
    family: FontFamily? = null,
    align: TextAlign? = null,
    lineHeight: TextUnit = TextUnit.Unspecified,
    maxLines: Int = Int.MAX_VALUE,
    letterSpacing: TextUnit = TextUnit.Unspecified,
    modifier: Modifier = Modifier,
) = Text(
    text,
    modifier = modifier,
    color = color,
    fontSize = size,
    fontWeight = weight,
    fontFamily = family,
    textAlign = align,
    lineHeight = lineHeight,
    maxLines = maxLines,
    overflow = if (maxLines == Int.MAX_VALUE) TextOverflow.Clip else TextOverflow.Ellipsis,
    letterSpacing = letterSpacing,
)

/** `.large-title` : 34 sp, gras. */
@Composable
fun LargeTitle(text: String) =
    T(text, size = 34.sp, weight = FontWeight.Bold, lineHeight = 38.sp, letterSpacing = (-.7).sp, modifier = Modifier.padding(start = 4.dp, end = 4.dp, top = 4.dp, bottom = 14.dp))

@Composable
fun DisplayTitle(text: String, size: TextUnit = 30.sp, align: TextAlign? = null, color: Color = LocalTokens.current.label) =
    T(text, color = color, size = size, weight = FontWeight.SemiBold, family = Fonts.display, align = align, lineHeight = (size.value * 1.08f).sp, letterSpacing = (-.3).sp)

@Composable
fun Lead(text: String, align: TextAlign? = null) =
    T(text, color = LocalTokens.current.label2, size = 16.sp, align = align, lineHeight = 24.sp, modifier = Modifier.widthIn(max = 340.dp))

@Composable
fun GroupHeader(text: String) =
    T(
        text.uppercase(),
        color = LocalTokens.current.label2,
        size = 13.sp,
        weight = FontWeight.Medium,
        letterSpacing = .4.sp,
        modifier = Modifier.padding(start = 16.dp, end = 16.dp, top = 26.dp, bottom = 7.dp),
    )

@Composable
fun GroupFooter(text: String?, danger: Boolean = false) {
    if (text.isNullOrBlank()) return
    val t = LocalTokens.current
    T(
        text,
        color = if (danger) t.danger else t.label2,
        size = 13.sp,
        weight = if (danger) FontWeight.Medium else FontWeight.Normal,
        lineHeight = 19.sp,
        modifier = Modifier.padding(start = 16.dp, end = 16.dp, top = 8.dp),
    )
}

@Composable
fun FinePrint(text: String) =
    T(text, color = LocalTokens.current.label3, size = 12.5.sp, align = TextAlign.Center, modifier = Modifier.fillMaxWidth().padding(top = 22.dp))

/* ------------------------------------------------------- listes groupées */

/** `.group` : surface arrondie 14 dp, ombre légère en clair. */
@Composable
fun Group(modifier: Modifier = Modifier, content: @Composable ColumnScope.() -> Unit) {
    val t = LocalTokens.current
    val shape = RoundedCornerShape(14.dp)
    Column(
        modifier
            .fillMaxWidth()
            .then(if (t.dark) Modifier else Modifier.shadow(2.dp, shape, ambientColor = Color(0x14142018), spotColor = Color(0x14142018)))
            .clip(shape)
            .background(t.surface),
        content = content,
    )
}

/** Séparateur entre deux rangées ; `inset` 58 dp quand la rangée a une icône. */
@Composable
fun Divider(inset: Dp = 16.dp) {
    Box(
        Modifier
            .fillMaxWidth()
            .padding(start = inset)
            .height(.6.dp)
            .background(LocalTokens.current.separator),
    )
}

/** `.row-icon` : carré arrondi coloré, glyphe blanc. */
@Composable
fun RowIcon(icon: Ic, color: Color) {
    Box(Modifier.size(30.dp).clip(RoundedCornerShape(8.dp)).background(color), contentAlignment = Alignment.Center) {
        Icon(icon, Color.White, size = 18.dp, strokeWidth = 2f)
    }
}

@Composable
fun ListRow(
    label: String,
    modifier: Modifier = Modifier,
    icon: Ic? = null,
    iconColor: Color = LocalTokens.current.accent,
    leading: (@Composable () -> Unit)? = null,
    sub: String? = null,
    value: String? = null,
    chevron: Boolean = false,
    destructive: Boolean = false,
    onClick: (() -> Unit)? = null,
    trailing: (@Composable RowScope.() -> Unit)? = null,
) {
    val t = LocalTokens.current
    Row(
        modifier
            .fillMaxWidth()
            .heightIn(min = 50.dp)
            .then(if (onClick != null) Modifier.clickable(role = Role.Button, onClick = onClick) else Modifier)
            .padding(horizontal = 16.dp, vertical = 9.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = if (destructive) Arrangement.Center else Arrangement.spacedBy(12.dp),
    ) {
        if (icon != null) RowIcon(icon, iconColor)
        leading?.invoke()
        if (destructive) {
            T(label, color = t.danger, weight = FontWeight.SemiBold)
            return@Row
        }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            T(label, maxLines = 2)
            if (sub != null) T(sub, color = t.label2, size = 13.sp, lineHeight = 17.sp, maxLines = 2)
        }
        if (value != null) T(value, color = t.label2, maxLines = 1, modifier = Modifier.widthIn(max = 190.dp))
        trailing?.invoke(this)
        if (chevron) Icon(Ic.ChevronRight, t.label3, size = 17.dp, strokeWidth = 2.4f)
    }
}

/** Rangée de formulaire en ligne (`.form-row`) : libellé fixe 88 dp, champ à droite. */
@Composable
fun FormRow(
    label: String,
    value: String,
    onValue: (String) -> Unit,
    placeholder: String = "",
    keyboard: KeyboardType = KeyboardType.Text,
    password: Boolean = false,
    prefix: String? = null,
    invalid: Boolean = false,
    mono: Boolean = false,
) {
    val t = LocalTokens.current
    Row(
        Modifier
            .fillMaxWidth()
            .heightIn(min = 50.dp)
            .drawBehind { if (invalid) drawRect(t.danger, size = size.copy(width = 3.dp.toPx())) }
            .padding(horizontal = 16.dp, vertical = 9.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        T(label, color = if (invalid) t.danger else t.label, modifier = Modifier.width(88.dp))
        if (prefix != null) T(prefix, color = t.label2, size = 15.sp, weight = FontWeight.Medium, family = Fonts.mono)
        Box(Modifier.weight(1f)) {
            if (value.isEmpty()) T(placeholder, color = t.label3, maxLines = 1)
            BasicTextField(
                value = value,
                onValueChange = onValue,
                singleLine = true,
                textStyle = TextStyle(color = t.label, fontSize = 16.sp, fontFamily = if (mono) Fonts.mono else null, letterSpacing = if (mono) 2.sp else TextUnit.Unspecified),
                cursorBrush = SolidColor(t.accent),
                keyboardOptions = KeyboardOptions(keyboardType = keyboard),
                visualTransformation = if (password) PasswordVisualTransformation() else VisualTransformation.None,
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
}

/* ---------------------------------------------------------------- boutons */

enum class BtnKind { FILLED, TINTED, GRAY, PLAIN }

@Composable
fun Btn(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    kind: BtnKind = BtnKind.FILLED,
    icon: Ic? = null,
    enabled: Boolean = true,
    busy: Boolean = false,
    height: Dp = 52.dp,
) {
    val t = LocalTokens.current
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val scale by animateFloatAsState(if (pressed) .97f else 1f, label = "press")
    val (bg, fg) = when (kind) {
        BtnKind.FILLED -> t.accent to t.onAccent
        BtnKind.TINTED -> t.accentSoft to t.accentText
        BtnKind.GRAY -> t.fill to t.label
        BtnKind.PLAIN -> Color.Transparent to t.accentText
    }
    Row(
        modifier
            .scale(scale)
            .alpha(if (enabled) 1f else .45f)
            .height(height)
            .clip(RoundedCornerShape(50))
            .background(bg)
            .clickable(interaction, indication = null, enabled = enabled && !busy, role = Role.Button, onClick = onClick)
            .padding(horizontal = 24.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.Center,
    ) {
        if (busy) {
            CircularProgressIndicator(color = fg, strokeWidth = 2.dp, modifier = Modifier.size(18.dp))
            Spacer(Modifier.width(10.dp))
        } else if (icon != null) {
            Icon(icon, fg, size = 19.dp, strokeWidth = 2f)
            Spacer(Modifier.width(8.dp))
        }
        T(text, color = fg, size = if (height < 48.dp) 15.sp else 17.sp, weight = if (kind == BtnKind.PLAIN) FontWeight.Medium else FontWeight.SemiBold, maxLines = 1)
    }
}

@Composable
fun BlockBtn(text: String, onClick: () -> Unit, kind: BtnKind = BtnKind.FILLED, icon: Ic? = null, enabled: Boolean = true, busy: Boolean = false) =
    Btn(text, onClick, Modifier.fillMaxWidth(), kind, icon, enabled, busy)

@Composable
fun Stack(content: @Composable ColumnScope.() -> Unit) =
    Column(Modifier.fillMaxWidth().padding(top = 20.dp), verticalArrangement = Arrangement.spacedBy(10.dp), content = content)

/** Bouton icône rond 36 dp (`.icon-btn`). */
@Composable
fun IconBtn(icon: Ic, label: String, onClick: () -> Unit, tinted: Boolean = false) {
    val t = LocalTokens.current
    Box(
        Modifier
            .size(36.dp)
            .clip(CircleShape)
            .background(if (tinted) t.accentSoft else Color.Transparent)
            .clickable(role = Role.Button, onClickLabel = label, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) { Icon(icon, t.accentText, size = if (tinted) 18.dp else 22.dp) }
}

/* -------------------------------------------------------------- contrôles */

/** Interrupteur iOS du prototype (`.switch`), 51×31. */
@Composable
fun PillSwitch(checked: Boolean, onChange: (Boolean) -> Unit, enabled: Boolean = true) {
    val t = LocalTokens.current
    val x by animateDpAsState(if (checked) 20.dp else 0.dp, spring(dampingRatio = .62f, stiffness = Spring.StiffnessMediumLow), label = "knob")
    Box(
        Modifier
            .alpha(if (enabled) 1f else .45f)
            .size(51.dp, 31.dp)
            .clip(RoundedCornerShape(50))
            .background(if (checked) t.accent else t.fill)
            .then(if (checked) Modifier else Modifier.border(1.dp, t.separator, RoundedCornerShape(50)))
            .clickable(enabled = enabled, role = Role.Switch) { onChange(!checked) }
            .padding(2.dp),
    ) {
        Box(Modifier.offset(x = x).size(27.dp).shadow(3.dp, CircleShape).clip(CircleShape).background(Color.White))
    }
}

@Composable
fun Segmented(options: List<String>, selected: Int, onSelect: (Int) -> Unit, modifier: Modifier = Modifier) {
    val t = LocalTokens.current
    Row(
        modifier.fillMaxWidth().height(34.dp).clip(RoundedCornerShape(10.dp)).background(t.fill).padding(2.dp),
        horizontalArrangement = Arrangement.spacedBy(0.dp),
    ) {
        options.forEachIndexed { index, label ->
            val on = index == selected
            Box(
                Modifier
                    .weight(1f)
                    .fillMaxHeight()
                    .then(if (on) Modifier.shadow(3.dp, RoundedCornerShape(8.dp)) else Modifier)
                    .clip(RoundedCornerShape(8.dp))
                    .background(if (on) t.surfaceElev else Color.Transparent)
                    .clickable(role = Role.Tab) { onSelect(index) },
                contentAlignment = Alignment.Center,
            ) { T(label, size = 14.sp, weight = FontWeight.SemiBold) }
        }
    }
}

@Composable
fun SearchField(value: String, onValue: (String) -> Unit, placeholder: String) {
    val t = LocalTokens.current
    Row(
        Modifier.fillMaxWidth().height(38.dp).clip(RoundedCornerShape(11.dp)).background(t.fill).padding(horizontal = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(7.dp),
    ) {
        Icon(Ic.Search, t.label2, size = 17.dp, strokeWidth = 2.2f)
        Box(Modifier.weight(1f)) {
            if (value.isEmpty()) T(placeholder, color = t.label2, maxLines = 1)
            BasicTextField(value, onValue, singleLine = true, textStyle = TextStyle(color = t.label, fontSize = 16.sp), cursorBrush = SolidColor(t.accent), modifier = Modifier.fillMaxWidth())
        }
        if (value.isNotEmpty()) Box(Modifier.clickable { onValue("") }) { Icon(Ic.X, t.label2, size = 16.dp) }
    }
}

/* ----------------------------------------------------------- indicateurs */

/** `.bars` : qualité 0 à 3 d'après la latence mesurée. */
fun quality(latencyMs: Int?): Int = when {
    latencyMs == null -> 0
    latencyMs < 80 -> 3
    latencyMs < 180 -> 2
    else -> 1
}

@Composable
fun Bars(latencyMs: Int?) {
    val t = LocalTokens.current
    val q = quality(latencyMs)
    Row(Modifier.height(11.dp), horizontalArrangement = Arrangement.spacedBy(2.dp), verticalAlignment = Alignment.Bottom) {
        listOf(4.dp, 7.dp, 11.dp).forEachIndexed { index, h ->
            Box(Modifier.width(3.dp).height(h).clip(RoundedCornerShape(1.dp)).background(if (index < q) t.accent else t.label3))
        }
    }
}

/** `.capsule` : pastille du forfait (or) ou d'expiration (rouge). */
@Composable
fun Capsule(text: String, danger: Boolean = false, onClick: (() -> Unit)? = null) {
    val t = LocalTokens.current
    Box(
        Modifier
            .height(32.dp)
            .clip(RoundedCornerShape(50))
            .background(if (danger) t.dangerSoft else t.goldSoft)
            .then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier)
            .padding(horizontal = 12.dp),
        contentAlignment = Alignment.Center,
    ) { T(text, color = if (danger) t.danger else t.goldText, size = 13.sp, weight = FontWeight.SemiBold) }
}

@Composable
fun Tag(text: String, color: Color = LocalTokens.current.accentText, background: Color = LocalTokens.current.accentSoft) {
    Box(Modifier.clip(RoundedCornerShape(50)).background(background).padding(horizontal = 9.dp, vertical = 4.dp)) {
        T(text, color = color, size = 12.sp, weight = FontWeight.SemiBold)
    }
}

@Composable
fun Avatar(initials: String, size: Dp = 34.dp, onClick: (() -> Unit)? = null) {
    val t = LocalTokens.current
    Box(
        Modifier
            .size(size)
            .clip(CircleShape)
            .background(t.accentSoft)
            .then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier),
        contentAlignment = Alignment.Center,
    ) { T(initials, color = t.accentText, size = (size.value * .4f).sp, weight = FontWeight.SemiBold, family = Fonts.display) }
}

fun initialsOf(name: String?): String =
    name.orEmpty().trim().split(Regex("\\s+")).filter { it.isNotEmpty() }.take(2).joinToString("") { it.first().uppercase() }.ifEmpty { "·" }

/** Trois valeurs séparées par des filets (`.metrics`, `.stats`). */
@Composable
fun Triplet(items: List<Triple<String, String, String>>, leadingIcons: List<Ic?> = emptyList(), onClicks: List<(() -> Unit)?> = emptyList()) {
    val t = LocalTokens.current
    Group {
        Row(Modifier.fillMaxWidth().padding(vertical = 14.dp)) {
            items.forEachIndexed { index, (caption, value, unit) ->
                if (index > 0) Box(Modifier.width(1.dp).height(52.dp).background(t.separator))
                val click = onClicks.getOrNull(index)
                Column(
                    Modifier.weight(1f).then(if (click != null) Modifier.clickable(role = Role.Button, onClick = click) else Modifier).padding(horizontal = 6.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                        leadingIcons.getOrNull(index)?.let { Icon(it, t.label2, size = 13.dp, strokeWidth = 2.2f) }
                        T(caption, color = t.label2, size = 12.sp, maxLines = 1)
                    }
                    T(value, size = 19.sp, weight = FontWeight.Medium, family = Fonts.mono, maxLines = 1, modifier = Modifier.padding(top = 4.dp))
                    T(unit, color = t.label3, size = 11.sp, maxLines = 1)
                }
            }
        }
    }
}

/* ------------------------------------------------------------- en-têtes */

/** Barre de navigation (`.nav`) : retour à gauche, actions à droite. */
@Composable
fun NavBar(backLabel: String? = null, onBack: (() -> Unit)? = null, trailing: (@Composable RowScope.() -> Unit)? = null) {
    val t = LocalTokens.current
    Row(
        Modifier.fillMaxWidth().statusBarsPadding().height(44.dp).padding(horizontal = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (onBack != null) {
            Row(
                Modifier.clip(RoundedCornerShape(10.dp)).clickable(role = Role.Button, onClick = onBack).padding(end = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(Ic.ChevronLeft, t.accentText, size = 26.dp, strokeWidth = 2.2f)
                if (backLabel != null) T(backLabel, color = t.accentText, size = 17.sp)
            }
        }
        Spacer(Modifier.weight(1f))
        if (trailing != null) Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically, content = trailing)
    }
}

/* ---------------------------------------------------------------- billet */

fun noteBrush(start: Color, end: Color) = Brush.linearGradient(listOf(start, end), start = Offset.Zero, end = Offset.Infinite)

/** `.banknote` : carte de membre, vagues guillochées, sceau, double filet. */
@Composable
fun Banknote(modifier: Modifier = Modifier, height: Dp = 190.dp, content: @Composable BoxScope.() -> Unit) {
    val t = LocalTokens.current
    val shape = RoundedCornerShape(18.dp)
    Box(
        modifier
            .fillMaxWidth()
            .height(height)
            .clip(shape)
            .background(noteBrush(t.noteStart, t.noteEnd))
            .border(1.dp, t.noteEdge, shape),
    ) {
        Guilloche(Guil.WAVES, t.noteLine, Modifier.fillMaxSize())
        Box(Modifier.fillMaxSize().padding(8.dp).border(1.dp, t.noteEdge, RoundedCornerShape(12.dp)))
        content()
    }
}

/* -------------------------------------------------------------- couches */

/** Feuille modale du bas (`.sheet`) avec voile. */
@Composable
fun Sheet(open: Boolean, onDismiss: () -> Unit, content: @Composable ColumnScope.() -> Unit) {
    val t = LocalTokens.current
    Box(Modifier.fillMaxSize()) {
        AnimatedVisibility(open, enter = fadeIn(), exit = fadeOut()) {
            Box(Modifier.fillMaxSize().background(t.scrim).clickable(remember { MutableInteractionSource() }, null, onClick = onDismiss))
        }
        AnimatedVisibility(
            open,
            modifier = Modifier.align(Alignment.BottomCenter),
            enter = slideInVertically(spring(dampingRatio = .8f)) { it },
            exit = slideOutVertically { it },
        ) {
            Column(
                Modifier
                    .navigationBarsPadding()
                    .padding(8.dp)
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(32.dp))
                    .background(t.bg)
                    .clickable(remember { MutableInteractionSource() }, null) {}
                    .padding(start = 16.dp, end = 16.dp, top = 8.dp, bottom = 18.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Box(Modifier.padding(bottom = 12.dp).size(36.dp, 5.dp).clip(RoundedCornerShape(3.dp)).background(t.label3))
                content()
            }
        }
    }
}

/** HUD du haut (`.toast`). */
@Composable
fun BoxScope.Toast(message: String?) {
    val t = LocalTokens.current
    AnimatedVisibility(
        message != null,
        modifier = Modifier.align(Alignment.TopCenter).statusBarsPadding().padding(top = 6.dp),
        enter = slideInVertically { -it } + fadeIn(),
        exit = slideOutVertically { -it } + fadeOut(),
    ) {
        Box(Modifier.padding(horizontal = 24.dp).shadow(12.dp, RoundedCornerShape(20.dp)).clip(RoundedCornerShape(20.dp)).background(t.hud).padding(horizontal = 18.dp, vertical = 10.dp)) {
            T(message.orEmpty(), color = t.onHud, size = 14.sp, weight = FontWeight.SemiBold, align = TextAlign.Center)
        }
    }
}

/** Bandeau non bloquant (D18, D61) : bascule automatique, plus aucun serveur. */
@Composable
fun NoticeBanner(text: String, danger: Boolean, action: String? = null, onAction: (() -> Unit)? = null, onClose: () -> Unit) {
    val t = LocalTokens.current
    Row(
        Modifier
            .fillMaxWidth()
            .shadow(14.dp, RoundedCornerShape(22.dp))
            .clip(RoundedCornerShape(22.dp))
            .background(t.glassStrong)
            .border(.5.dp, t.separator, RoundedCornerShape(22.dp))
            .padding(start = 14.dp, end = 6.dp, top = 10.dp, bottom = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Box(Modifier.size(10.dp).clip(CircleShape).background(if (danger) t.danger else t.gold))
        T(text, size = 14.sp, weight = FontWeight.Medium, lineHeight = 19.sp, modifier = Modifier.weight(1f))
        if (action != null && onAction != null) Btn(action, onAction, kind = BtnKind.TINTED, height = 34.dp)
        Box(Modifier.size(30.dp).clip(CircleShape).clickable(onClick = onClose), contentAlignment = Alignment.Center) {
            Icon(Ic.X, t.label2, size = 16.dp, strokeWidth = 2.4f)
        }
    }
}

/** Anneau d'état autour de l'icône (`.perm-art`) : rosette tournante + disque plein. */
@Composable
fun PermArt(icon: Ic, size: Dp = 180.dp, pop: Boolean = false) {
    val t = LocalTokens.current
    Box(Modifier.size(size), contentAlignment = Alignment.Center) {
        Guilloche(Guil.SEAL, t.guilloche, Modifier.fillMaxSize(), spinSeconds = 90)
        Box(
            Modifier.size(size * .43f).shadow(18.dp, CircleShape, ambientColor = t.accentGlow, spotColor = t.accentGlow).clip(CircleShape).background(t.accent),
            contentAlignment = Alignment.Center,
        ) { Icon(icon, t.onAccent, size = size * .2f, strokeWidth = 2f) }
    }
}

/** Point d'état (`.status-dot`) avec halo. */
@Composable
fun StatusDot(color: Color, halo: Color) {
    Box(
        Modifier.size(19.dp).drawBehind {
            drawCircle(halo, radius = 9.5.dp.toPx())
            drawCircle(color, radius = 5.5.dp.toPx())
        },
    )
}

/** Barre de progression du billet (`.meter`). */
@Composable
fun Meter(fraction: Float) {
    val t = LocalTokens.current
    Box(Modifier.fillMaxWidth().height(6.dp).clip(RoundedCornerShape(3.dp)).background(t.noteEdge)) {
        Box(Modifier.fillMaxWidth(fraction.coerceIn(0f, 1f)).fillMaxHeight().clip(RoundedCornerShape(3.dp)).background(t.noteInk))
    }
}

/** Cercle numéroté des étapes (`.step`). */
@Composable
fun StepBadge(n: Int) {
    val t = LocalTokens.current
    Box(Modifier.size(28.dp).clip(CircleShape).background(t.accentSoft), contentAlignment = Alignment.Center) {
        T(n.toString(), color = t.accentText, size = 14.sp, weight = FontWeight.Bold)
    }
}

/** Cercle de sélection (`.radio`). */
@Composable
fun RadioDot(checked: Boolean) {
    val t = LocalTokens.current
    Box(
        Modifier.size(24.dp).clip(CircleShape).background(if (checked) t.accent else Color.Transparent).drawBehind {
            if (!checked) drawCircle(t.label3, radius = size.minDimension / 2 - .75.dp.toPx(), style = Stroke(1.5.dp.toPx()))
        },
        contentAlignment = Alignment.Center,
    ) { if (checked) Icon(Ic.Check, t.onAccent, size = 14.dp, strokeWidth = 3f) }
}
