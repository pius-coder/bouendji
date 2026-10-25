package cm.bouendji.vpn.util

import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/**
 * Dates sans `java.time`.
 *
 * `java.time.Instant` n'existe qu'à partir d'Android 8 (API 26,
 * `api-versions.xml`). L'application vise l'API 23 (marché camerounais,
 * appareils anciens) : on lit donc nous-mêmes la seule forme que le serveur
 * écrit, `Date.prototype.toISOString()` (`2026-10-24T09:15:00.000Z`), en
 * acceptant aussi un décalage `±HH:MM` et une fraction de 0 à 9 chiffres.
 *
 * Testé contre `java.time.Instant.parse` sur la JVM (`IsoTimeTest`).
 */
object IsoTime {

    private val ISO = Regex(
        "^(\\d{4})-(\\d{2})-(\\d{2})[Tt ](\\d{2}):(\\d{2}):(\\d{2})(?:\\.(\\d{1,9}))?(Z|z|[+-]\\d{2}:?\\d{2})$",
    )

    /** Millisecondes epoch, ou `null` si la chaîne n'est pas une date ISO-8601 complète. */
    fun parseMs(value: String?): Long? {
        if (value == null) return null
        val match = ISO.matchEntire(value.trim()) ?: return null
        val g = match.groupValues
        val year = g[1].toInt()
        val month = g[2].toInt()
        val day = g[3].toInt()
        val hour = g[4].toInt()
        val minute = g[5].toInt()
        val second = g[6].toInt()
        if (month !in 1..12 || day !in 1..daysInMonth(year, month)) return null
        if (hour > 23 || minute > 59 || second > 59) return null

        val millis = if (g[7].isEmpty()) 0 else (g[7] + "00").substring(0, 3).toInt()
        val offsetMinutes = when (val zone = g[8]) {
            "Z", "z" -> 0
            else -> {
                val sign = if (zone[0] == '-') -1 else 1
                val digits = zone.substring(1).replace(":", "")
                val oh = digits.substring(0, 2).toInt()
                val om = digits.substring(2, 4).toInt()
                if (oh > 23 || om > 59) return null
                sign * (oh * 60 + om)
            }
        }

        val days = daysFromCivil(year, month, day)
        val seconds = days * 86_400L + hour * 3_600L + minute * 60L + second - offsetMinutes * 60L
        return seconds * 1_000L + millis
    }

    /** Forme écrite par le serveur : toujours UTC, millisecondes, `Z`. */
    fun formatUtc(ms: Long): String {
        val format = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US)
        format.timeZone = TimeZone.getTimeZone("UTC")
        return format.format(Date(ms))
    }

    /** `AAAA-MM-JJ` dans le fuseau du téléphone (jour de télémétrie, `telemetry.ts` règle 3). */
    fun localDay(ms: Long, zone: TimeZone = TimeZone.getDefault()): String {
        val format = SimpleDateFormat("yyyy-MM-dd", Locale.US)
        format.timeZone = zone
        return format.format(Date(ms))
    }

    /** En-tête HTTP `Date` (RFC 1123), ex. `Sat, 24 Oct 2026 09:15:00 GMT`. */
    fun parseHttpDate(value: String?): Long? {
        if (value.isNullOrBlank()) return null
        return runCatching {
            val format = SimpleDateFormat("EEE, dd MMM yyyy HH:mm:ss zzz", Locale.US)
            format.timeZone = TimeZone.getTimeZone("GMT")
            format.isLenient = false
            format.parse(value.trim())?.time
        }.getOrNull()
    }

    private fun isLeap(year: Int) = (year % 4 == 0 && year % 100 != 0) || year % 400 == 0

    private fun daysInMonth(year: Int, month: Int): Int = when (month) {
        2 -> if (isLeap(year)) 29 else 28
        4, 6, 9, 11 -> 30
        else -> 31
    }

    /** Jours depuis 1970-01-01 (algorithme « days_from_civil » de H. Hinnant). */
    private fun daysFromCivil(yearIn: Int, month: Int, day: Int): Long {
        val year = if (month <= 2) yearIn - 1 else yearIn
        val era = (if (year >= 0) year else year - 399) / 400
        val yoe = year - era * 400
        val mp = (month + 9) % 12
        val doy = (153 * mp + 2) / 5 + day - 1
        val doe = yoe * 365 + yoe / 4 - yoe / 100 + doy
        return era * 146_097L + doe - 719_468L
    }
}
