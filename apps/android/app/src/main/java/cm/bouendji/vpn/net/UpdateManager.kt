package cm.bouendji.vpn.net

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.content.FileProvider
import cm.bouendji.vpn.MainActivity
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File
import java.security.MessageDigest

/**
 * Mise à jour de l'application hors Play Store, sur le modèle de Geny VPN :
 * l'API publie la dernière version signée, l'app la télécharge, vérifie
 * l'empreinte **et la signature** avant de confier l'APK à l'installateur
 * Android.
 *
 * La vérification de signature est la garde essentielle : un APK téléchargé
 * depuis un serveur compromis ne doit jamais pouvoir remplacer l'application
 * s'il n'est pas signé par le même certificat.
 */
class UpdateManager(
    private val context: Context,
    private val http: OkHttpClient,
) {
    data class Target(
        val versionCode: Int,
        val versionName: String?,
        val url: String,
        val sha256: String?,
    )

    sealed interface Result {
        data object Started : Result
        data class Failed(val message: String) : Result
    }

    /** Notification locale « mise à jour disponible ». Pas de FCM : l'app publie elle-même. */
    fun notifyAvailable(versionName: String?) {
        val manager = context.getSystemService(NotificationManager::class.java) ?: return
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Mises à jour",
                NotificationManager.IMPORTANCE_DEFAULT,
            ).apply { description = "Nouvelle version de l'application." }
            manager.createNotificationChannel(channel)
        }
        if (Build.VERSION.SDK_INT >= 33 &&
            context.checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            return
        }
        val open = PendingIntent.getActivity(
            context,
            2,
            Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.stat_sys_download_done)
            .setContentTitle("Mise à jour disponible")
            .setContentText(versionName?.let { "Version $it prête à installer." } ?: "Une nouvelle version est disponible.")
            .setContentIntent(open)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .build()
        runCatching { manager.notify(NOTIFICATION_ID, notification) }
    }

    suspend fun downloadAndInstall(target: Target): Result = withContext(Dispatchers.IO) {
        if (target.url.isBlank()) return@withContext Result.Failed("Aucune adresse de mise à jour.")
        val dir = File(context.cacheDir, "updates").apply { mkdirs() }
        val apk = File(dir, "update.apk")
        runCatching {
            val response = http.newCall(Request.Builder().url(target.url).build()).execute()
            response.use {
                if (!it.isSuccessful) error("Téléchargement refusé (HTTP ${it.code}).")
                val body = it.body ?: error("Réponse vide.")
                apk.outputStream().use { out -> body.byteStream().copyTo(out) }
            }
        }.onFailure { return@withContext Result.Failed("Téléchargement impossible : ${it.message}") }

        target.sha256?.takeIf { it.isNotBlank() }?.let { expected ->
            val actual = sha256(apk)
            if (!actual.equals(expected, ignoreCase = true)) {
                apk.delete()
                return@withContext Result.Failed("APK corrompu : l'empreinte ne correspond pas.")
            }
        }
        if (!sameSigner(apk)) {
            apk.delete()
            return@withContext Result.Failed("Cet APK n'est pas signé par l'éditeur de l'application.")
        }
        val uri = FileProvider.getUriForFile(context, "${context.packageName}.files", apk)
        val intent = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, "application/vnd.android.package-archive")
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        runCatching { context.startActivity(intent) }.fold(
            onSuccess = { Result.Started },
            onFailure = { Result.Failed("Aucun installateur disponible : ${it.message}") },
        )
    }

    @Suppress("DEPRECATION")
    private fun sameSigner(apk: File): Boolean {
        val pm = context.packageManager
        val installed = runCatching {
            pm.getPackageInfo(context.packageName, PackageManager.GET_SIGNATURES)
        }.getOrNull() ?: return false
        val archive = runCatching {
            pm.getPackageArchiveInfo(apk.absolutePath, PackageManager.GET_SIGNATURES)
        }.getOrNull() ?: return false
        val a = installed.signatures?.firstOrNull()?.toByteArray() ?: return false
        val b = archive.signatures?.firstOrNull()?.toByteArray() ?: return false
        return a.contentEquals(b)
    }

    private fun sha256(file: File): String {
        val digest = MessageDigest.getInstance("SHA-256")
        file.inputStream().use { input ->
            val buffer = ByteArray(64 * 1024)
            while (true) {
                val n = input.read(buffer)
                if (n <= 0) break
                digest.update(buffer, 0, n)
            }
        }
        return digest.digest().joinToString("") { "%02x".format(it) }
    }

    private companion object {
        const val CHANNEL_ID = "updates"
        const val NOTIFICATION_ID = 4202
    }
}
