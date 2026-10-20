package cm.bouendji.vpn.ui.screens

import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import cm.bouendji.vpn.R
import cm.bouendji.vpn.ui.components.BrandBody
import cm.bouendji.vpn.ui.components.BrandPanel
import cm.bouendji.vpn.ui.components.BrandScreen
import cm.bouendji.vpn.ui.components.BrandSupportAction
import cm.bouendji.vpn.ui.theme.LocalBrandTheme

/**
 * Aide.
 *
 * Elle répond à ce que l'application fait réellement, y compris ce qu'elle ne
 * fait pas : pas de choix de nœud définitif, pas de clé exportable, pas de
 * « protégé » quand le tunnel est mort.
 */
@Composable
fun HelpScreen() {
    BrandScreen {
        BrandBody(stringResource(R.string.help_body))
        Spacer(Modifier.height(18.dp))

        Question(stringResource(R.string.help_q1), stringResource(R.string.help_a1))
        Spacer(Modifier.height(10.dp))
        Question(stringResource(R.string.help_q2), stringResource(R.string.help_a2))
        Spacer(Modifier.height(10.dp))
        Question(stringResource(R.string.help_q3), stringResource(R.string.help_a3))
        Spacer(Modifier.height(10.dp))
        Question(stringResource(R.string.help_q4), stringResource(R.string.help_a4))

        Spacer(Modifier.height(20.dp))
        BrandSupportAction(
            label = stringResource(R.string.help_contact),
            modifier = Modifier.fillMaxWidth(),
        )
    }
}

@Composable
private fun Question(question: String, answer: String) {
    val theme = LocalBrandTheme.current
    BrandPanel(shadow = false) {
        Text(
            text = question,
            style = theme.bodyStyle(theme.palette.ink).copy(
                fontWeight = theme.type.titleWeight,
                fontSize = 15.sp,
            ),
        )
        Spacer(Modifier.height(6.dp))
        BrandBody(answer)
    }
}
