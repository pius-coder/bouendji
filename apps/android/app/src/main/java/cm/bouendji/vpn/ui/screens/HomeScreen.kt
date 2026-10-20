package cm.bouendji.vpn.ui.screens

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import cm.bouendji.vpn.R
import cm.bouendji.vpn.ui.AppState
import cm.bouendji.vpn.ui.Availability
import cm.bouendji.vpn.ui.ControlState
import cm.bouendji.vpn.ui.NodeSummary
import cm.bouendji.vpn.ui.components.BrandAction
import cm.bouendji.vpn.ui.components.BrandBody
import cm.bouendji.vpn.ui.components.BrandCaption
import cm.bouendji.vpn.ui.components.BrandDivider
import cm.bouendji.vpn.ui.components.BrandKeyValue
import cm.bouendji.vpn.ui.components.BrandLabel
import cm.bouendji.vpn.ui.components.BrandNotice
import cm.bouendji.vpn.ui.components.BrandPanel
import cm.bouendji.vpn.ui.components.BrandScreen
import cm.bouendji.vpn.ui.components.BrandSupportAction
import cm.bouendji.vpn.ui.components.BrandTitle
import cm.bouendji.vpn.ui.components.PrimaryControl
import cm.bouendji.vpn.ui.components.Tone
import cm.bouendji.vpn.ui.components.formatCountdown
import cm.bouendji.vpn.ui.components.formatDate
import cm.bouendji.vpn.vpn.TunnelState
import cm.bouendji.vpn.vpn.VpnTunnelService

/**
 * Écran principal.
 *
 * La commande contient sa durée ; le reste de l'écran ne raconte que trois
 * choses vérifiables : la sortie utilisée, sa région, son échéance. Aucun
 * `vless://`, aucun UUID, aucun nom de tag interne n'apparaît ici.
 *
 * Quand rien ne peut fonctionner, la commande disparaît : appuyer dessus ne
 * changerait rien. Un panneau explique pourquoi, avec le contact de
 * l'administrateur — et si ce build n'a pas de contact, il le dit.
 */
@Composable
fun HomeScreen(state: AppState, onPlans: () -> Unit) {
    val context = LocalContext.current
    val availability by state.availability.collectAsState()
    val control by state.control.collectAsState()
    val tunnel by state.tunnel.collectAsState()
    val detail by state.tunnelDetail.collectAsState()
    val seconds by state.sessionSeconds.collectAsState()
    val nodes by state.nodes.collectAsState()
    val cycle by state.cycleSeconds.collectAsState()

    // Le consentement VPN est un contrat système : il se demande une fois, et
    // refusé, il ne s'annonce pas comme une connexion.
    val consentLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.StartActivityForResult(),
    ) { result ->
        if (result.resultCode == android.app.Activity.RESULT_OK) {
            VpnTunnelService.start(context)
        } else {
            state.refreshAvailability()
        }
    }

    val toggle: () -> Unit = {
        when (control) {
            ControlState.Idle -> {
                if (availability is Availability.Ready) {
                    val consent = VpnTunnelService.consentIntent(context)
                    if (consent == null) {
                        VpnTunnelService.start(context)
                    } else {
                        consentLauncher.launch(consent)
                    }
                } else {
                    state.refreshAll()
                }
            }

            // Une négociation en cours n'est pas un tunnel : on peut l'annuler
            // sans mentir sur ce qui a été établi.
            ControlState.Connecting, ControlState.Connected, ControlState.Degraded ->
                VpnTunnelService.stop(context)
        }
    }

    val blocked = availability as? Availability.Blocked

    BrandScreen {
        when {
            blocked != null -> UnavailablePanel(blocked = blocked, onRetry = { state.refreshAll() })

            tunnel == TunnelState.NO_CONNECTION -> LostPanel(
                detail = detail,
                onRetry = { state.refreshAll() },
            )

            tunnel == TunnelState.SUBSCRIPTION_EXPIRED -> ExpiredPanel(onPlans = onPlans)

            tunnel == TunnelState.DEVICE_REVOKED -> RevokedPanel()

            else -> {
                val titleRes = when (control) {
                    ControlState.Idle -> R.string.home_idle_title
                    ControlState.Connecting -> R.string.home_connecting_title
                    ControlState.Connected -> R.string.home_connected_title
                    ControlState.Degraded -> R.string.home_degraded_title
                }
                val subRes = when (control) {
                    ControlState.Idle -> R.string.home_idle_sub
                    ControlState.Connecting -> R.string.home_connecting_sub
                    ControlState.Connected -> R.string.home_connected_sub
                    ControlState.Degraded -> R.string.home_degraded_sub
                }
                BrandTitle(stringResource(titleRes))
                Spacer(Modifier.height(4.dp))
                BrandBody(stringResource(subRes))
                Spacer(Modifier.height(18.dp))
                PrimaryControl(
                    state = control,
                    seconds = seconds,
                    onToggle = toggle,
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(22.dp))
                SessionCard(
                    control = control,
                    nodes = nodes,
                    cycleSeconds = cycle,
                    sessionSeconds = seconds,
                    onPlans = onPlans,
                )
            }
        }
    }
}

/* --------------------------------------------------------------- carte sortie */

@Composable
private fun SessionCard(
    control: ControlState,
    nodes: List<NodeSummary>,
    cycleSeconds: Long,
    sessionSeconds: Long,
    onPlans: () -> Unit,
) {
    val node = nodes.firstOrNull()
    val automatic = nodes.size > 1

    BrandPanel {
        BrandLabel(stringResource(R.string.node_label))
        Spacer(Modifier.height(6.dp))
        BrandTitle(
            text = when {
                automatic -> stringResource(R.string.node_auto)
                node != null -> node.label
                else -> stringResource(R.string.node_none)
            },
        )
        Spacer(Modifier.height(4.dp))
        BrandKeyValue(
            label = stringResource(R.string.region_label),
            value = when {
                automatic -> stringResource(R.string.region_unknown)
                node != null -> node.region.ifBlank { stringResource(R.string.region_unknown) }
                else -> stringResource(R.string.region_unknown)
            },
        )

        if (node != null) {
            Spacer(Modifier.height(8.dp))
            BrandCaption(stringResource(R.string.expires_on, formatDate(node.expiresAtMs)))
        }
        if (nodes.isNotEmpty()) {
            Spacer(Modifier.height(4.dp))
            BrandCaption(pluralStringResource(R.plurals.node_count, nodes.size, nodes.size))
        }

        // Le renouvellement préventif est piloté par le bundle (D25). On
        // l'affiche seulement quand il est calculable et que le tunnel vit.
        if (cycleSeconds > 0L && (control == ControlState.Connected || control == ControlState.Degraded)) {
            val left = (cycleSeconds - sessionSeconds).coerceAtLeast(0L)
            if (left > 0L) {
                Spacer(Modifier.height(6.dp))
                BrandCaption(stringResource(R.string.renewal_in, formatCountdown(left)))
            }
        }

        Spacer(Modifier.height(14.dp))
        BrandDivider()
        Spacer(Modifier.height(12.dp))
        BrandAction(
            label = stringResource(R.string.see_plans),
            onClick = onPlans,
            primary = false,
            modifier = Modifier.fillMaxWidth(),
        )
    }
}

/* ------------------------------------------------------------------ panneaux */

@Composable
private fun UnavailablePanel(blocked: Availability.Blocked, onRetry: () -> Unit) {
    val reason = stringResource(blocked.reasonRes)
    BrandPanel(shadow = false) {
        BrandTitle(stringResource(R.string.unavailable_title))
        Spacer(Modifier.height(10.dp))
        BrandBody(stringResource(R.string.unavailable_body))
        Spacer(Modifier.height(12.dp))
        BrandNotice(message = reason, tone = Tone.WARNING)
        val extra = blocked.detail
        if (!extra.isNullOrBlank() && extra != reason) {
            Spacer(Modifier.height(8.dp))
            BrandCaption(extra)
        }
        Spacer(Modifier.height(16.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            BrandAction(
                label = stringResource(R.string.unavailable_retry),
                onClick = onRetry,
                modifier = Modifier.weight(1f),
            )
            BrandSupportAction(
                label = stringResource(R.string.unavailable_contact),
                modifier = Modifier.weight(1f),
            )
        }
        Spacer(Modifier.height(12.dp))
        BrandCaption(stringResource(R.string.unavailable_hint))
    }
}

@Composable
private fun LostPanel(detail: String?, onRetry: () -> Unit) {
    BrandPanel(shadow = false) {
        BrandTitle(stringResource(R.string.unavailable_title))
        Spacer(Modifier.height(10.dp))
        BrandBody(stringResource(R.string.unavailable_body))
        if (!detail.isNullOrBlank()) {
            Spacer(Modifier.height(12.dp))
            BrandNotice(message = detail, tone = Tone.WARNING)
        }
        Spacer(Modifier.height(16.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            BrandAction(
                label = stringResource(R.string.unavailable_retry),
                onClick = onRetry,
                modifier = Modifier.weight(1f),
            )
            BrandSupportAction(
                label = stringResource(R.string.unavailable_contact),
                modifier = Modifier.weight(1f),
            )
        }
    }
}

@Composable
private fun ExpiredPanel(onPlans: () -> Unit) {
    BrandPanel(shadow = false) {
        BrandTitle(stringResource(R.string.expired_title))
        Spacer(Modifier.height(10.dp))
        BrandBody(stringResource(R.string.expired_body))
        Spacer(Modifier.height(16.dp))
        BrandAction(
            label = stringResource(R.string.see_plans),
            onClick = onPlans,
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.height(10.dp))
        BrandSupportAction(
            label = stringResource(R.string.unavailable_contact),
            modifier = Modifier.fillMaxWidth(),
        )
    }
}

@Composable
private fun RevokedPanel() {
    BrandPanel(shadow = false) {
        BrandTitle(stringResource(R.string.revoked_title))
        Spacer(Modifier.height(10.dp))
        BrandBody(stringResource(R.string.revoked_body))
        Spacer(Modifier.height(16.dp))
        BrandSupportAction(
            label = stringResource(R.string.unavailable_contact),
            modifier = Modifier.fillMaxWidth(),
        )
    }
}
