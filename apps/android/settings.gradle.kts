/**
 * Projet Android — socle.
 *
 * Un seul module `app`. Le thème, le nom, l'URL d'API et l'`applicationId` sont
 * injectés au build (voir `brand.properties` et `BrandTokens.kt`) ; le *package*
 * Kotlin reste `cm.bouendji.vpn` pour toutes les marques, ce qui évite de
 * réécrire les imports à chaque build de marque.
 */
pluginManagement {
    repositories {
        google {
            content {
                includeGroupByRegex("com\\.android.*")
                includeGroupByRegex("com\\.google.*")
                includeGroupByRegex("androidx.*")
            }
        }
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "vpn-android"
include(":app")
