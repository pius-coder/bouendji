package cm.bouendji.vpn.ui.components

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import cm.bouendji.vpn.R
import cm.bouendji.vpn.ui.openSupport
import cm.bouendji.vpn.ui.supportConfigured

/**
 * Bouton de contact. Il n'est dessiné que si la marque a un contact réel : un
 * bouton qui n'ouvre rien serait pire que pas de bouton du tout, et une page
 * `.invalid` encore pire. Le motif d'absence est écrit à la place.
 */
@Composable
fun BrandSupportAction(
    label: String,
    modifier: Modifier = Modifier,
    primary: Boolean = false,
) {
    val context = LocalContext.current
    val missing = stringResource(R.string.notice_brand_contact_missing)
    val noBrowser = stringResource(R.string.notice_no_browser)
    var failure by remember { mutableStateOf<String?>(null) }

    Column(modifier = modifier) {
        if (!supportConfigured()) {
            BrandCaption(missing)
            return@Column
        }
        BrandAction(
            label = label,
            onClick = { if (!openSupport(context)) failure = noBrowser },
            primary = primary,
            icon = BrandIcons.External,
            modifier = Modifier.fillMaxWidth(),
        )
        val problem = failure
        if (problem != null) {
            Spacer(Modifier.height(8.dp))
            BrandCaption(problem)
        }
    }
}
