package cm.bouendji.vpn

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

/**
 * Point d'entrée de l'activité.
 *
 * Elle ne contient **rien** de l'écran final : la couche UI précédente a été
 * supprimée pour être réécrite entièrement. Ce fichier n'existe que pour que
 * `AndroidManifest.xml` pointe sur une classe réelle plutôt que sur une classe
 * fantôme, et pour que la chaîne du socle (Keystore, ApiClient, VpnService)
 * reste compilable pendant la réécriture.
 *
 * À remplacer par l'écran réel : c'est la première chose que la nouvelle vague
 * UI doit faire.
 */
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            MaterialTheme {
                Surface(modifier = Modifier.fillMaxSize()) {
                    Placeholder()
                }
            }
        }
    }
}

@Composable
private fun Placeholder() {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(32.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            text = "Écran en cours de réécriture",
            style = MaterialTheme.typography.titleMedium,
        )
        Text(
            text = "La couche d'interface a été retirée volontairement.",
            style = MaterialTheme.typography.bodyMedium,
        )
    }
}