package cm.bouendji.vpn.ui

import android.content.Context

/** Apparence choisie par l'utilisateur. `AUTO` suit le système. */
enum class Appearance {
    AUTO,
    LIGHT,
    DARK,
    ;

    companion object {
        fun fromName(name: String?): Appearance =
            entries.firstOrNull { it.name == name } ?: AUTO
    }
}

/**
 * Préférences d'interface — sans secret, sans configuration.
 *
 * Stockage `SharedPreferences` ordinaire : rien ici ne mérite le Keystore, et
 * y écrire des préférences d'affichage à chaque bascule coûterait une
 * opération cryptographique pour rien. Aucun nœud, aucun jeton, aucune URI
 * n'entre dans ce fichier.
 */
class UiPrefs(context: Context) {

    private val prefs = context.applicationContext
        .getSharedPreferences("ui.state", Context.MODE_PRIVATE)

    var appearance: Appearance
        get() = Appearance.fromName(prefs.getString(KEY_APPEARANCE, null))
        set(value) {
            prefs.edit().putString(KEY_APPEARANCE, value.name).apply()
        }

    var reduceMotion: Boolean
        get() = prefs.getBoolean(KEY_REDUCE_MOTION, false)
        set(value) {
            prefs.edit().putBoolean(KEY_REDUCE_MOTION, value).apply()
        }

    /**
     * Début de la session affichée dans la commande principale.
     *
     * L'horloge du service n'est pas exposée par `TunnelStateBus` (elle
     * appartient au socle) : l'UI horodate donc le passage à `CONNECTED` et le
     * conserve, pour que la durée survive à une rotation d'écran. Ce n'est pas
     * la vérité du moteur, c'est la durée de la session telle que l'application
     * l'a observée — et elle est remise à zéro dès que le tunnel s'arrête.
     */
    var sessionStartedAt: Long
        get() = prefs.getLong(KEY_SESSION_START, 0L)
        set(value) {
            prefs.edit().putLong(KEY_SESSION_START, value).apply()
        }

    private companion object {
        const val KEY_APPEARANCE = "appearance"
        const val KEY_REDUCE_MOTION = "reduceMotion"
        const val KEY_SESSION_START = "sessionStartedAt"
    }
}
