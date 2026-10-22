import java.util.Properties

/**
 * Module unique.
 *
 * Deux choses sont injectées au build, et seulement deux :
 *   - `applicationId` / `versionName` / libellé, via `brand.properties` ;
 *   - `BrandTokens.kt`, réécrit par le workflow de marque (thème, nom, API).
 *
 * Le `namespace` (donc le package Kotlin et la classe R) ne change jamais :
 * une marque différente est une autre `applicationId`, pas un autre code.
 */
plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
}

val brandFile = rootProject.file("brand.properties")
val brand = Properties().apply {
    if (brandFile.exists()) brandFile.inputStream().use { load(it) }
}
fun brandValue(key: String, fallback: String): String =
    (brand.getProperty(key) ?: fallback).trim().ifEmpty { fallback }

android {
    namespace = "cm.bouendji.vpn"
    // Les niveaux de SDK viennent du catalogue, comme les bibliothèques : une
    // seule source de versions dans ce projet.
    compileSdk = libs.versions.compileSdk.get().toInt()

    defaultConfig {
        applicationId = brandValue("packageName", "cm.bouendji.vpn")
        minSdk = libs.versions.minSdk.get().toInt()
        targetSdk = libs.versions.targetSdk.get().toInt()
        versionCode = brandValue("versionCode", "1").toInt()
        versionName = brandValue("versionName", "0.1.0")

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"

        // Le libellé visible vient du même fichier que BrandTokens.appName.
        // Toute divergence entre les deux est un défaut de build, pas un détail.
        manifestPlaceholders["appName"] = brandValue("appName", "Bouendji VPN")
    }

    buildTypes {
        debug {
            // Pas de suffixe d'`applicationId` : l'identifiant de l'appareil est
            // lié à l'installation, et deux identifiants pour la même marque
            // feraient consommer deux places d'appareil.
            isMinifyEnabled = false
        }
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
        // Pas de `allWarningsAsErrors` : le socle n'a jamais été compilé, et
        // bloquer sur un avertissement rendrait le premier build inutilisable.
        freeCompilerArgs += listOf("-Xjvm-default=all")
    }

    buildFeatures {
        compose = true      // l'UI arrive à la vague suivante
        buildConfig = true
    }

    packaging {
        resources.excludes += setOf("/META-INF/{AL2.0,LGPL2.1}")
    }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.kotlinx.coroutines.android)
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.okhttp)

    // Compose est déclaré maintenant pour que la vague UI n'ait pas à toucher
    // au build ; aucun composant Compose n'est écrit dans ce lot.
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.graphics)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.compose.material3)
    implementation(libs.androidx.activity.compose)
    debugImplementation(libs.androidx.compose.ui.tooling)

    // libbox (sing-box) — moteur compile depuis les sources par
    // `tools/build-libbox.ps1`. Il n'existe sur AUCUN depot Maven (verifie :
    // 0 resultat sur Maven Central), donc le .aar est produit localement puis
    // copie dans `app/libs/` (hors controle de version : ~29 Mo de binaire GPL,
    // reproductible a partir du tag v1.14.3).
    //
    // Le controle est explicite : sans lui, Gradle echoue plus loin avec un
    // message incomprehensible (`ExtractAarTransform`, chemin introuvable).
    val libboxAar = file("libs/libbox.aar")
    require(libboxAar.exists()) {
        "libbox.aar absent de app/libs/ : lancer tools/build-libbox.ps1 " +
            "(compilation du moteur sing-box depuis les sources)."
    }
    implementation(files(libboxAar))

    testImplementation(libs.junit)
    androidTestImplementation(libs.androidx.junit)
    androidTestImplementation(libs.androidx.espresso.core)
}
