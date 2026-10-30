package cm.bouendji.vpn.offline

import android.content.ContentResolver
import android.net.Uri
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * Fichier de secours `.bvpn` reçu par « Ouvrir avec », « Partager vers » ou le
 * sélecteur de fichiers, en attente d'import par l'interface.
 *
 * Le contenu est lu ici, borné à [OfflineBundle.MAX_BYTES] + 1 : au-delà, il est
 * refusé par l'import sans être chargé en entier.
 *
 * La lecture se fait **hors du thread principal** : le fichier peut venir d'un
 * fournisseur lent (WhatsApp, Drive, gestionnaire de fichiers), et bloquer
 * `onCreate`/`onNewIntent` jusqu'à 256 Ko gelait l'interface.
 */
object ImportInbox {

    /** Extension des fichiers de secours. Le contenu, pas le nom, fait foi. */
    const val EXTENSION = "bvpn"

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    private val _pending = MutableStateFlow<ByteArray?>(null)
    val pending: StateFlow<ByteArray?> = _pending.asStateFlow()

    fun offer(resolver: ContentResolver, uri: Uri) {
        scope.launch {
            val bytes = runCatching {
                resolver.openInputStream(uri)?.use { input ->
                    val buffer = ByteArray(OfflineBundle.MAX_BYTES + 1)
                    var read = 0
                    while (read < buffer.size) {
                        val n = input.read(buffer, read, buffer.size - read)
                        if (n < 0) break
                        read += n
                    }
                    buffer.copyOf(read)
                }
            }.getOrNull() ?: return@launch
            _pending.value = bytes
        }
    }

    /** Rend le fichier en attente et vide la boîte : un import ne se rejoue pas. */
    fun take(): ByteArray? {
        val bytes = _pending.value
        _pending.value = null
        return bytes
    }
}
