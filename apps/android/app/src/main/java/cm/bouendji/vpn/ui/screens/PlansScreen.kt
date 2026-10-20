package cm.bouendji.vpn.ui.screens

import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import cm.bouendji.vpn.R
import cm.bouendji.vpn.net.ApiClient
import cm.bouendji.vpn.ui.AppState
import cm.bouendji.vpn.ui.Busy
import cm.bouendji.vpn.ui.PlansState
import cm.bouendji.vpn.ui.components.BrandAction
import cm.bouendji.vpn.ui.components.BrandBody
import cm.bouendji.vpn.ui.components.BrandCaption
import cm.bouendji.vpn.ui.components.BrandDivider
import cm.bouendji.vpn.ui.components.BrandKeyValue
import cm.bouendji.vpn.ui.components.BrandLabel
import cm.bouendji.vpn.ui.components.BrandNotice
import cm.bouendji.vpn.ui.components.BrandPanel
import cm.bouendji.vpn.ui.components.BrandPill
import cm.bouendji.vpn.ui.components.BrandScreen
import cm.bouendji.vpn.ui.components.BrandSupportAction
import cm.bouendji.vpn.ui.components.BrandTitle
import cm.bouendji.vpn.ui.components.Tone
import cm.bouendji.vpn.ui.components.formatIsoDate

/**
 * Forfaits.
 *
 * Une seule route existe : `GET /v1/me/subscription`. **Aucun catalogue de
 * formules n'est exposé par l'API** — on ne peut donc pas afficher de prix ni
 * de liste à choisir, et cette version de l'application ne prétend pas le
 * faire. L'écran montre la formule réellement attachée au compte, son échéance
 * et la limite d'appareils, puis renvoie vers l'administrateur.
 */
@Composable
fun PlansScreen(
    state: AppState,
    onAccount: () -> Unit,
    onRetry: () -> Unit = {},
) {
    val plans by state.plans.collectAsState()
    val busy by state.busy.collectAsState()

    LaunchedEffect(Unit) { state.refreshPlans() }

    BrandScreen {
        when (val current = plans) {
            PlansState.Unknown, PlansState.Loading ->
                BrandCaption(stringResource(R.string.plans_loading))

            PlansState.SignedOut -> {
                BrandBody(stringResource(R.string.plans_signed_out))
                Spacer(Modifier.height(12.dp))
                BrandAction(
                    label = stringResource(R.string.account_sign_in),
                    onClick = onAccount,
                    modifier = Modifier.fillMaxWidth(),
                )
            }

            is PlansState.Failed -> {
                BrandNotice(message = current.message, tone = Tone.DANGER)
                Spacer(Modifier.height(12.dp))
                BrandAction(
                    label = stringResource(R.string.unavailable_retry),
                    onClick = {
                        onRetry()
                        state.refreshPlans(force = true)
                    },
                    modifier = Modifier.fillMaxWidth(),
                )
            }

            is PlansState.Ready -> CurrentPlan(plans = current.subscription, busy = busy)
        }
    }
}

@Composable
private fun CurrentPlan(plans: ApiClient.SubscriptionResponse, busy: Busy?) {
    val entitlement = plans.entitlement
    val subscription = plans.subscription
    val name = entitlement.planName ?: subscription?.planName ?: stringResource(R.string.plans_none)

    BrandPanel {
        Row(verticalAlignment = Alignment.CenterVertically) {
            BrandLabel(stringResource(R.string.plans_current))
            Spacer(Modifier.weight(1f))
            BrandPill(
                text = stringResource(if (entitlement.active) R.string.plans_active else R.string.plans_inactive),
                tone = if (entitlement.active) Tone.POSITIVE else Tone.NEUTRAL,
            )
        }
        Spacer(Modifier.height(6.dp))
        BrandTitle(name)

        if (entitlement.active && entitlement.daysRemaining > 0) {
            Spacer(Modifier.height(4.dp))
            BrandBody(
                pluralStringResource(
                    R.plurals.plan_days,
                    entitlement.daysRemaining,
                    entitlement.daysRemaining,
                ),
            )
        }

        Spacer(Modifier.height(12.dp))
        BrandDivider()
        Spacer(Modifier.height(6.dp))

        if (subscription != null) {
            BrandKeyValue(
                label = stringResource(R.string.plans_starts),
                value = formatIsoDate(subscription.startsAt) ?: subscription.startsAt,
            )
            BrandKeyValue(
                label = stringResource(R.string.plans_ends),
                value = formatIsoDate(subscription.endsAt) ?: subscription.endsAt,
            )
        } else {
            BrandBody(stringResource(R.string.plans_none))
        }

        Spacer(Modifier.height(6.dp))
        BrandCaption(
            stringResource(
                R.string.plans_devices,
                subscription?.deviceLimit ?: entitlement.deviceLimit,
            ),
        )
    }

    Spacer(Modifier.height(14.dp))
    BrandPanel(shadow = false) {
        BrandBody(stringResource(R.string.plans_no_catalog))
        Spacer(Modifier.height(12.dp))
        BrandSupportAction(
            label = stringResource(R.string.plans_contact),
            modifier = Modifier.fillMaxWidth(),
            primary = busy == null,
        )
    }
}
