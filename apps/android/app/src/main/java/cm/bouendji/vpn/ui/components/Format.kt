package cm.bouendji.vpn.ui.components

import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

/**
 * Formatage visible. Les durées sont en chiffres tabulaires pour que la
 * minuterie ne bouge pas d'un pixel à chaque seconde.
 */

private val DATE_FR: DateTimeFormatter =
    DateTimeFormatter.ofPattern("d MMM yyyy", Locale.FRENCH)

/** `mm:ss`, ou `h:mm:ss` au-delà d'une heure. */
fun formatSessionDuration(seconds: Long): String {
    val total = seconds.coerceAtLeast(0L)
    val hours = total / 3_600L
    val minutes = (total % 3_600L) / 60L
    val secs = total % 60L
    return if (hours > 0L) {
        String.format(Locale.ROOT, "%d:%02d:%02d", hours, minutes, secs)
    } else {
        String.format(Locale.ROOT, "%02d:%02d", minutes, secs)
    }
}

/** `mm:ss` sans heures — pour un compte à rebours court. */
fun formatCountdown(seconds: Long): String {
    val total = seconds.coerceAtLeast(0L)
    return String.format(Locale.ROOT, "%02d:%02d", total / 60L, total % 60L)
}

fun formatDate(epochMs: Long): String =
    DATE_FR.format(Instant.ofEpochMilli(epochMs).atZone(ZoneId.systemDefault()))

/** Date ISO-8601 du serveur, ou `null` si elle est illisible. */
fun formatIsoDate(iso: String?): String? {
    if (iso.isNullOrBlank()) return null
    return runCatching { formatDate(Instant.parse(iso).toEpochMilli()) }.getOrNull()
}
