package cm.bouendji.vpn.ui

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.Settings
import cm.bouendji.vpn.brand.BrandTokens

/**
 * Ouverture du contact de marque (D19).
 *
 * Un build livré avec `support.invalid` n'a **pas** de contact : on doit le
 * dire, pas ouvrir une page morte. La vérification porte sur le domaine et non
 * sur la chaîne entière, pour que `support.invalid` comme
 * `https://support.invalid/contact` soient traités de la même façon.
 */
fun supportConfigured(): Boolean {
    val host = runCatching { Uri.parse(BrandTokens.supportUrl).host }.getOrNull()
    return !host.isNullOrBlank() && !host.endsWith(".invalid", ignoreCase = true)
}

/** `false` quand le contact est absent ou qu'aucun navigateur ne peut l'ouvrir. */
fun openSupport(context: Context): Boolean {
    if (!supportConfigured()) return false
    return runCatching {
        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(BrandTokens.supportUrl))
        // Depuis un contexte non-Activity (service, application), Android exige
        // une tâche explicite ; sinon `ActivityNotFoundException`.
        if (context !is Activity) intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(intent)
        true
    }.getOrDefault(false)
}

/** Réglages VPN du système (« toujours actif » n'est pas un réglage de l'app). */
fun openVpnSettings(context: Context): Boolean =
    runCatching {
        val intent = Intent(Settings.ACTION_VPN_SETTINGS)
        if (context !is Activity) intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(intent)
        true
    }.getOrDefault(false)
