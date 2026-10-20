package cm.bouendji.vpn.ui.screens

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import cm.bouendji.vpn.R
import cm.bouendji.vpn.net.ApiClient
import cm.bouendji.vpn.ui.AccountState
import cm.bouendji.vpn.ui.AppState
import cm.bouendji.vpn.ui.Busy
import cm.bouendji.vpn.ui.NodeSummary
import cm.bouendji.vpn.ui.components.BrandAction
import cm.bouendji.vpn.ui.components.BrandBody
import cm.bouendji.vpn.ui.components.BrandCaption
import cm.bouendji.vpn.ui.components.BrandDivider
import cm.bouendji.vpn.ui.components.BrandIcons
import cm.bouendji.vpn.ui.components.BrandKeyValue
import cm.bouendji.vpn.ui.components.BrandLabel
import cm.bouendji.vpn.ui.components.BrandNotice
import cm.bouendji.vpn.ui.components.BrandPanel
import cm.bouendji.vpn.ui.components.BrandPill
import cm.bouendji.vpn.ui.components.BrandScreen
import cm.bouendji.vpn.ui.components.BrandTitle
import cm.bouendji.vpn.ui.components.Tone
import cm.bouendji.vpn.ui.components.formatDate
import cm.bouendji.vpn.ui.theme.LocalBrandTheme

/**
 * Compte.
 *
 * L'enrôlement n'est pas un formulaire : il précède la connexion et se fait
 * tout seul (paire de clés dans le Keystore). L'utilisateur ne voit donc
 * qu'e-mail, mot de passe, puis l'état de son compte et de ses appareils.
 */
@Composable
fun AccountScreen(state: AppState, onPlans: () -> Unit) {
    val account by state.account.collectAsState()
    val busy by state.busy.collectAsState()
    val authError by state.authError.collectAsState()
    val nodes by state.nodes.collectAsState()

    LaunchedEffect(Unit) { state.refreshAccount() }

    BrandScreen {
        when (val current = account) {
            AccountState.Unknown, AccountState.Loading ->
                BrandCaption(stringResource(R.string.account_loading))

            AccountState.SignedOut -> SignInForm(
                state = state,
                signingIn = busy == Busy.ACCOUNT,
                error = authError,
            )

            is AccountState.Failed -> {
                BrandNotice(message = current.message, tone = Tone.DANGER)
                Spacer(Modifier.height(12.dp))
                BrandAction(
                    label = stringResource(R.string.unavailable_retry),
                    onClick = { state.refreshAccount(force = true) },
                    modifier = Modifier.fillMaxWidth(),
                )
            }

            is AccountState.Ready -> Details(
                me = current.me,
                nodes = nodes,
                busy = busy,
                state = state,
                onPlans = onPlans,
            )
        }
    }
}

/* ----------------------------------------------------------------- connexion */

@Composable
private fun SignInForm(state: AppState, signingIn: Boolean, error: String?) {
    val theme = LocalBrandTheme.current

    var email by rememberSaveable { mutableStateOf("") }
    // Le mot de passe reste en mémoire de composition : `rememberSaveable`
    // l'écrirait dans le Bundle d'instance, donc hors du processus.
    var password by remember { mutableStateOf("") }
    var tried by rememberSaveable { mutableStateOf(false) }

    val emailInvalid = tried && email.isBlank()
    val passwordInvalid = tried && password.isBlank()
    val submit: () -> Unit = {
        tried = true
        if (email.isNotBlank() && password.isNotBlank()) {
            state.signIn(email, password)
        }
    }

    BrandBody(stringResource(R.string.account_signed_out))
    Spacer(Modifier.height(16.dp))

    OutlinedTextField(
        value = email,
        onValueChange = { email = it },
        modifier = Modifier.fillMaxWidth(),
        label = { Text(stringResource(R.string.account_email)) },
        singleLine = true,
        isError = emailInvalid,
        textStyle = theme.bodyStyle(theme.palette.ink),
        shape = theme.shapes.field,
        keyboardOptions = KeyboardOptions(
            keyboardType = KeyboardType.Email,
            imeAction = ImeAction.Next,
        ),
    )
    if (emailInvalid) {
        Spacer(Modifier.height(4.dp))
        BrandCaption(stringResource(R.string.field_required))
    }

    Spacer(Modifier.height(10.dp))
    OutlinedTextField(
        value = password,
        onValueChange = { password = it },
        modifier = Modifier.fillMaxWidth(),
        label = { Text(stringResource(R.string.account_password)) },
        singleLine = true,
        isError = passwordInvalid,
        textStyle = theme.bodyStyle(theme.palette.ink),
        shape = theme.shapes.field,
        visualTransformation = PasswordVisualTransformation(),
        keyboardOptions = KeyboardOptions(
            keyboardType = KeyboardType.Password,
            imeAction = ImeAction.Done,
        ),
        keyboardActions = KeyboardActions(onDone = { submit() }),
    )
    if (passwordInvalid) {
        Spacer(Modifier.height(4.dp))
        BrandCaption(stringResource(R.string.field_required))
    }

    if (error != null) {
        Spacer(Modifier.height(12.dp))
        BrandNotice(message = error, tone = Tone.DANGER)
    }

    Spacer(Modifier.height(16.dp))
    BrandAction(
        label = stringResource(if (signingIn) R.string.account_signing_in else R.string.account_sign_in),
        onClick = submit,
        enabled = !signingIn,
        modifier = Modifier.fillMaxWidth(),
    )

    Spacer(Modifier.height(16.dp))
    BrandCaption(stringResource(R.string.account_enrol_hint))
    Spacer(Modifier.height(8.dp))
    BrandCaption(stringResource(R.string.account_security_note))
}

/* -------------------------------------------------------------------- compte */

@Composable
private fun Details(
    me: ApiClient.MeResponse,
    nodes: List<NodeSummary>,
    busy: Busy?,
    state: AppState,
    onPlans: () -> Unit,
) {
    val entitlement = me.entitlement

    BrandPanel {
        Row(verticalAlignment = Alignment.CenterVertically) {
            BrandLabel(stringResource(R.string.account_name))
            Spacer(Modifier.weight(1f))
            BrandPill(
                text = stringResource(if (entitlement.active) R.string.plans_active else R.string.plans_inactive),
                tone = if (entitlement.active) Tone.POSITIVE else Tone.NEUTRAL,
            )
        }
        Spacer(Modifier.height(6.dp))
        BrandTitle(me.user.name.ifBlank { me.user.email })
        Spacer(Modifier.height(4.dp))
        BrandBody(me.user.email)
        Spacer(Modifier.height(12.dp))
        BrandDivider()
        Spacer(Modifier.height(6.dp))
        BrandKeyValue(
            label = stringResource(R.string.plan_label),
            value = entitlement.planName ?: stringResource(R.string.plan_none),
        )
        BrandKeyValue(
            label = stringResource(R.string.account_devices),
            value = stringResource(
                R.string.account_devices_value,
                me.devicesUsed,
                me.devicesLimit,
            ),
        )
        BrandKeyValue(
            label = stringResource(R.string.account_device_current),
            value = me.device.name,
        )
    }

    if (entitlement.activationPending) {
        Spacer(Modifier.height(12.dp))
        BrandNotice(message = stringResource(R.string.account_activation_pending), tone = Tone.ACCENT)
        Spacer(Modifier.height(10.dp))
        BrandAction(
            label = stringResource(R.string.account_activate),
            onClick = { state.activateCurrentDevice() },
            enabled = busy == null,
            modifier = Modifier.fillMaxWidth(),
        )
    }

    Spacer(Modifier.height(18.dp))
    BrandTitle(stringResource(R.string.account_access_title))
    Spacer(Modifier.height(8.dp))

    BrandPanel(shadow = false) {
        if (nodes.isEmpty()) {
            BrandBody(stringResource(R.string.account_access_none))
        } else {
            nodes.forEachIndexed { index, node ->
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column(Modifier.weight(1f)) {
                        Text(
                            text = node.label,
                            style = LocalBrandTheme.current.bodyStyle(LocalBrandTheme.current.palette.ink)
                                .copy(fontWeight = FontWeight.SemiBold),
                        )
                        BrandCaption(
                            node.region.ifBlank { stringResource(R.string.region_unknown) },
                        )
                    }
                    Spacer(Modifier.width(10.dp))
                    BrandCaption(formatDate(node.expiresAtMs))
                }
                if (index < nodes.lastIndex) BrandDivider()
            }
        }
    }

    Spacer(Modifier.height(14.dp))
    BrandAction(
        label = stringResource(R.string.account_refresh_access),
        onClick = { state.refreshAccess() },
        primary = false,
        enabled = busy == null,
        icon = BrandIcons.Refresh,
        modifier = Modifier.fillMaxWidth(),
    )
    Spacer(Modifier.height(8.dp))
    BrandAction(
        label = stringResource(R.string.see_plans),
        onClick = onPlans,
        primary = false,
        modifier = Modifier.fillMaxWidth(),
    )
    Spacer(Modifier.height(8.dp))
    BrandAction(
        label = stringResource(R.string.account_sign_out),
        onClick = { state.signOut() },
        primary = false,
        enabled = busy == null,
        modifier = Modifier.fillMaxWidth(),
    )

    Spacer(Modifier.height(16.dp))
    BrandCaption(stringResource(R.string.account_security_note))
}
