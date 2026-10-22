package cm.bouendji.vpn

import android.Manifest
import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.core.view.WindowCompat
import cm.bouendji.vpn.brand.BrandTokens
import cm.bouendji.vpn.ui.VpnApp
import cm.bouendji.vpn.vpn.TunnelState
import cm.bouendji.vpn.vpn.TunnelStateBus
import cm.bouendji.vpn.vpn.VpnTunnelService
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class MainActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        setContent {
            val container = (application as VpnApplication).container
            val state by TunnelStateBus.state.collectAsState()
            val detail by TunnelStateBus.detail.collectAsState()
            var engineAvailable by remember { mutableStateOf(false) }
            var hasConfiguration by remember { mutableStateOf(false) }

            LaunchedEffect(Unit) {
                withContext(Dispatchers.IO) {
                    engineAvailable = runCatching { container.tunnelEngine.isAvailable() }.getOrDefault(false)
                    hasConfiguration = runCatching { container.vault.read() != null }.getOrDefault(false)
                }
            }

            val vpnConsent = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
                if (result.resultCode == RESULT_OK) VpnTunnelService.start(this@MainActivity)
            }
            val notifications = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { }

            VpnApp(
                container = container,
                tunnelState = state,
                tunnelDetail = detail,
                engineAvailable = engineAvailable,
                initialHasConfiguration = hasConfiguration,
                systemDark = isSystemInDarkTheme(),
                onTunnelToggle = {
                    when (state) {
                        TunnelState.CONNECTED, TunnelState.CONNECTING, TunnelState.RECONNECTING -> VpnTunnelService.stop(this@MainActivity)
                        else -> {
                            val request = VpnTunnelService.consentIntent(this@MainActivity)
                            if (request == null) VpnTunnelService.start(this@MainActivity) else vpnConsent.launch(request)
                        }
                    }
                },
                onOpenSupport = ::openSupport,
                onOpenUrl = ::openUrl,
                onOpenVpnSettings = { startActivity(Intent(Settings.ACTION_VPN_SETTINGS)) },
                onRequestNotifications = {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) notifications.launch(Manifest.permission.POST_NOTIFICATIONS)
                    else startActivity(Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, packageName))
                },
                onSystemBars = { dark ->
                    WindowCompat.getInsetsController(window, window.decorView).apply {
                        isAppearanceLightStatusBars = !dark
                        isAppearanceLightNavigationBars = !dark
                    }
                },
            )
        }
    }

    private fun openSupport() = openUrl(BrandTokens.supportUrl)

    private fun openUrl(url: String) {
        if (url.isBlank()) return
        try {
            startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
        } catch (_: ActivityNotFoundException) {
            // Aucun navigateur disponible : l'interface reste dans l'app.
        }
    }
}
