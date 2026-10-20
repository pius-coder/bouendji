package cm.bouendji.vpn.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import cm.bouendji.vpn.R
import cm.bouendji.vpn.brand.BrandTokens
import cm.bouendji.vpn.ui.theme.LocalBrandTheme

/**
 * Barre haute : **un élément à gauche, trois à droite**.
 *
 * À gauche, l'identité de la marque — ou le retour quand on est sur un
 * sous-écran. À droite, trois actions qui ont toutes une fonction réelle :
 * compte, réglages, aide. Rien d'autre : pas de menu, pas de badge décoratif,
 * pas de quatrième icône.
 */
@Composable
fun BrandTopBar(
    title: String,
    showBack: Boolean,
    onBack: () -> Unit,
    onAccount: () -> Unit,
    onSettings: () -> Unit,
    onHelp: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val theme = LocalBrandTheme.current
    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(start = 16.dp, end = 12.dp, top = 8.dp, bottom = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (showBack) {
            BrandIconAction(
                icon = BrandIcons.Chevron,
                label = stringResource(R.string.action_back),
                onClick = onBack,
                modifier = Modifier.rotate(180f),
            )
            Spacer(Modifier.width(12.dp))
            Text(
                text = if (theme.type.caps) title.uppercase() else title,
                style = theme.bodyStyle(theme.palette.ink).copy(
                    fontWeight = FontWeight.SemiBold,
                    fontSize = 15.sp,
                    letterSpacing = if (theme.type.caps) 1.2.sp else 0.sp,
                ),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
        } else {
            BrandMark()
            Spacer(Modifier.width(10.dp))
            Text(
                text = if (theme.type.caps) BrandTokens.appName.uppercase() else BrandTokens.appName,
                style = theme.bodyStyle(theme.palette.ink).copy(
                    fontWeight = theme.type.labelWeight,
                    fontSize = 14.sp,
                    letterSpacing = if (theme.type.caps) 1.4.sp else (-0.2).sp,
                ),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
        }

        if (!showBack) Spacer(Modifier.weight(1f))

        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            BrandIconAction(BrandIcons.Account, stringResource(R.string.top_account), onAccount)
            BrandIconAction(BrandIcons.Settings, stringResource(R.string.top_settings), onSettings)
            BrandIconAction(BrandIcons.Help, stringResource(R.string.top_help), onHelp)
        }
    }
}

/** Marque : quatre traitements, quatre formes — pas quatre couleurs du même rond. */
@Composable
private fun BrandMark() {
    val theme = LocalBrandTheme.current
    val palette = theme.palette
    val initial = BrandTokens.appName.trim().firstOrNull()?.uppercaseChar()?.toString() ?: "V"

    when (theme.identity) {
        BrandTokens.Theme.HALO -> Box(
            modifier = Modifier
                .size(40.dp)
                .clip(CircleShape)
                .background(Brush.linearGradient(listOf(palette.surface, palette.surfaceAlt)))
                .border(1.dp, palette.glassBorder, CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = initial,
                style = theme.bodyStyle(palette.accentInk).copy(
                    fontWeight = FontWeight.Bold,
                    fontSize = 16.sp,
                ),
            )
        }

        BrandTokens.Theme.MONO -> Box(
            modifier = Modifier
                .size(40.dp)
                .background(palette.surface)
                .border(1.5.dp, palette.ink),
            contentAlignment = Alignment.Center,
        ) {
            Box(Modifier.size(11.dp).background(palette.accent))
        }

        BrandTokens.Theme.VECTOR -> Box(
            modifier = Modifier.size(40.dp),
            contentAlignment = Alignment.Center,
        ) {
            Canvas(Modifier.size(20.dp)) {
                val cell = size.minDimension / 3f
                val gap = cell * 0.18f
                for (row in 0 until 3) {
                    for (column in 0 until 3) {
                        val dim = (row == 0 && column == 1) || (row == 1 && column == 0) || (row == 2 && column == 2)
                        drawRect(
                            color = if (dim) palette.accent.copy(alpha = 0.22f) else palette.accent,
                            topLeft = Offset(column * cell + gap / 2f, row * cell + gap / 2f),
                            size = androidx.compose.ui.geometry.Size(cell - gap, cell - gap),
                        )
                    }
                }
            }
        }

        BrandTokens.Theme.OTAKU -> Box(
            modifier = Modifier
                .size(44.dp)
                .rotate(-4f)
                .clip(CircleShape)
                .background(Color(0xFFFFD84D))
                .border(3.dp, palette.ink, CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = "★",
                style = theme.bodyStyle(palette.ink).copy(
                    fontWeight = FontWeight.Black,
                    fontSize = 17.sp,
                ),
            )
        }
    }
}
