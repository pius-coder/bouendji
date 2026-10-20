/**
 * Racine Gradle. Aucun JDK, aucun Android SDK et aucun Gradle sur la machine où
 * ce fichier a été écrit : rien ici n'a été compilé. Voir README.md.
 */
plugins {
    alias(libs.plugins.android.application) apply false
    alias(libs.plugins.kotlin.android) apply false
    alias(libs.plugins.kotlin.compose) apply false
    alias(libs.plugins.kotlin.serialization) apply false
}
