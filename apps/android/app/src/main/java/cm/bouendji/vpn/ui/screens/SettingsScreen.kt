package cm.bouendji.vpn.ui.screens

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import cm.bouendji.vpn.R
import cm.bouendji.vpn.brand.BrandTokens
import cm.bouendji.vpn.ui.AppState
import cm.bouendji.vpn.ui.Appearance
import cm.bouendji.vpn.ui.components.BrandAction
import cm.bouendji.vpn.ui.components.BrandBody
import cm.bouendji.vpn.ui.components.BrandCaption
import cm.bouendji.vpn.ui.components.BrandKeyValue
import cm.bouendji.vpn.ui.components.BrandLabel
import cm.bouendji.vpn.ui.components.BrandPanel
import cm.bouendji.vpn.ui.components.BrandScreen
import cm.bouendji.vpn.ui.components.BrandSupportAction
import cm.bouendji.vpn.ui.components.BrandTitle
import cm.bouendji.vpn.ui.openVpnSettings
import cm.bouendji.vpn.ui.theme.LocalBrandTheme
import cm.bouendji.vpn.ui.theme.displayName
import cm.bouendji.vpn.vpn.TunnelState

/**
 * Réglages.
 *
 * Rien ici ne configure le tunnel : les sorties viennent du bundle signé, et
 * aucun champ ne permet d'injecter une URI. Les réglages sont ceux que
 * l'utilisateur peut réellement tenir : apparence, mouvement, notifications,
 * contact, effacement local.
 */
@Composable
fun SettingsScreen(state: AppState) {
    val appearance by state.appearance.collectAsState()
    val reduceMotion by state.reduceMotion.collectAsState()
    val tunnel by state.tunnel.collectAsState()
    val context = LocalContext.current

    var notificationsGranted by remember { mutableStateOf(notificationsAllowed(context)) }
    val permissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission(),
    ) { granted -> notificationsGranted = granted }

    var confirmingClear by rememberSaveable { mutableStateOf(false) }
    val tunnelActive = tunnel == TunnelState.CONNECTING ||
        tunnel == TunnelState.CONNECTED ||
        tunnel == TunnelState.RECONNECTING

    BrandScreen {
        BrandLabel(stringResource(R.string.settings_appearance))
        Spacer(Modifier.height(8.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            BrandAction(
                label = stringResource(R.string.appearance_auto),
                onClick = { state.setAppearance(Appearance.AUTO) },
                primary = appearance == Appearance.AUTO,
                modifier = Modifier.weight(1f),
            )
            BrandAction(
                label = stringResource(R.string.appearance_light),
                onClick = { state.setAppearance(Appearance.LIGHT) },
                primary = appearance == Appearance.LIGHT,
                modifier = Modifier.weight(1f),
            )
            BrandAction(
                label = stringResource(R.string.appearance_dark),
                onClick = { state.setAppearance(Appearance.DARK) },
                primary = appearance == Appearance.DARK,
                modifier = Modifier.weight(1f),
            )
        }

        Spacer(Modifier.height(14.dp))
        BrandPanel(
            shadow = false,
            padding = PaddingValues(horizontal = 14.dp, vertical = 12.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    BrandBody(
                        text = stringResource(R.string.settings_motion),
                        color = LocalBrandTheme.current.palette.ink,
                    )
                    Spacer(Modifier.height(2.dp))
                    BrandCaption(stringResource(R.string.settings_motion_hint))
                }
                Spacer(Modifier.width(12.dp))
                val palette = LocalBrandTheme.current.palette
                Switch(
                    checked = reduceMotion,
                    onCheckedChange = { state.setReduceMotion(it) },
                    colors = SwitchDefaults.colors(
                        checkedThumbColor = palette.onAccent,
                        checkedTrackColor = palette.accent,
                        uncheckedThumbColor = palette.muted,
                        uncheckedTrackColor = palette.surfaceAlt,
                    ),
                )
            }
        }

        Spacer(Modifier.height(22.dp))
        BrandLabel(stringResource(R.string.settings_identity))
        Spacer(Modifier.height(6.dp))
        BrandPanel(shadow = false) {
            BrandTitle(BrandTokens.theme.displayName())
            Spacer(Modifier.height(4.dp))
            BrandBody(identityDescription(BrandTokens.theme))
            Spacer(Modifier.height(8.dp))
            BrandCaption(stringResource(R.string.settings_identity_hint))
        }

        Spacer(Modifier.height(22.dp))
        BrandLabel(stringResource(R.string.settings_notifications))
        Spacer(Modifier.height(6.dp))
        BrandPanel(shadow = false) {
            BrandBody(stringResource(R.string.settings_notifications_hint))
            Spacer(Modifier.height(6.dp))
            BrandCaption(
                stringResource(
                    if (notificationsGranted) R.string.settings_notifications_granted
                    else R.string.settings_notifications_denied,
                ),
            )
            if (!notificationsGranted && Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                Spacer(Modifier.height(10.dp))
                BrandAction(
                    label = stringResource(R.string.settings_notifications_grant),
                    onClick = { permissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS) },
                    primary = false,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        }

        Spacer(Modifier.height(22.dp))
        BrandLabel(stringResource(R.string.settings_always_on))
        Spacer(Modifier.height(6.dp))
        BrandPanel(shadow = false) {
            BrandBody(stringResource(R.string.settings_always_on_hint))
            Spacer(Modifier.height(10.dp))
            BrandAction(
                label = stringResource(R.string.settings_open_vpn_settings),
                onClick = { openVpnSettings(context) },
                primary = false,
                modifier = Modifier.fillMaxWidth(),
            )
        }

        Spacer(Modifier.height(22.dp))
        BrandLabel(stringResource(R.string.settings_support))
        Spacer(Modifier.height(6.dp))
        BrandCaption(stringResource(R.string.settings_support_hint))
        Spacer(Modifier.height(8.dp))
        BrandSupportAction(
            label = stringResource(R.string.unavailable_contact),
            modifier = Modifier.fillMaxWidth(),
        )

        Spacer(Modifier.height(22.dp))
        BrandLabel(stringResource(R.string.settings_clear))
        Spacer(Modifier.height(6.dp))
        BrandCaption(stringResource(R.string.settings_clear_hint))
        Spacer(Modifier.height(8.dp))
        if (confirmingClear) {
            BrandPanel(shadow = false) {
                BrandTitle(stringResource(R.string.settings_clear_confirm_title))
                Spacer(Modifier.height(8.dp))
                BrandBody(stringResource(R.string.settings_clear_confirm_body))
                Spacer(Modifier.height(12.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    BrandAction(
                        label = stringResource(R.string.action_cancel),
                        onClick = { confirmingClear = false },
                        primary = false,
                        modifier = Modifier.weight(1f),
                    )
                    BrandAction(
                        label = stringResource(R.string.action_clear),
                        onClick = {
                            state.clearAccess()
                            confirmingClear = false
                        },
                        modifier = Modifier.weight(1f),
                    )
                }
            }
        } else {
            BrandAction(
                label = stringResource(R.string.settings_clear),
                onClick = { confirmingClear = true },
                primary = false,
                enabled = !tunnelActive,
                modifier = Modifier.fillMaxWidth(),
            )
            if (tunnelActive) {
                Spacer(Modifier.height(6.dp))
                BrandCaption(stringResource(R.string.settings_clear_unavailable))
            }
        }

        Spacer(Modifier.height(22.dp))
        BrandKeyValue(
            label = stringResource(R.string.settings_version),
            value = stringResource(
                R.string.settings_version_value,
                BrandTokens.appVersion,
                BrandTokens.theme.displayName(),
            ),
        )
        Spacer(Modifier.height(8.dp))
        BrandCaption(stringResource(R.string.settings_privacy))
    }
}

/* ------------------------------------------------------------------ outils */

private fun notificationsAllowed(context: Context): Boolean =
    Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
        ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.POST_NOTIFICATIONS,
        ) == PackageManager.PERMISSION_GRANTED

@Composable
private fun identityDescription(identity: BrandTokens.Theme): String = stringResource(
    when (identity) {
        BrandTokens.Theme.HALO -> R.string.identity_halo_desc
        BrandTokens.Theme.MONO -> R.string.identity_mono_desc
        BrandTokens.Theme.VECTOR -> R.string.identity_vector_desc
        BrandTokens.Theme.OTAKU -> R.string.identity_otaku_desc
    },
)
