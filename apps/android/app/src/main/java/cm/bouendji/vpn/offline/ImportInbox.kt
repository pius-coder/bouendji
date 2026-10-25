package cm.bouendji.vpn.offline

import android.content.ContentResolver
import android.net.Uri
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Fichier de secours `.bvpn` reçu par « Ouvrir avec », « Partager vers » ou le
 * sélecteur de fichiers, en attente d'import par l'interface.
 *
 * Le contenu est lu ici, borné à [OfflineBundle.MAX_BYTES] + 1 : au-delà, il est
 * refusé par l'import sans être chargé en entier.
 */
object ImportInbox {

    /** Extension des fichiers de secours. Le contenu, pas le nom, fait foi. */
    const val EXTENSION = "bvpn"

    private val _pending = MutableStateFlow<ByteArray?>(null)
    val pending: StateFlow<ByteArray?> = _pending.asStateFlow()

    fun offer(resolver: ContentResolver, uri: Uri): Boolean {
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
        }.getOrNull() ?: return false
        _pending.value = bytes
        return true
    }

    /** Rend le fichier en attente et vide la boîte : un import ne se rejoue pas. */
    fun take(): ByteArray? {
        val bytes = _pending.value
        _pending.value = null
        return bytes
    }
}
