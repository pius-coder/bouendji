package cm.bouendji.vpn.brand

/**
 * Jetons de marque — **remplacés au build**, jamais lus à l'exécution depuis un
 * serveur, jamais tirés au hasard (D2).
 *
 * ## Contrat de build
 *
 * Le workflow de marque réécrit **ce fichier entier** (valeurs seulement, pas
 * la structure) avant `assembleRelease`. Il n'y a pas de mécanisme de thème
 * dynamique : une application publiée a une identité, un point.
 *
 * | Champ | Source | Contrainte |
 * |---|---|---|
 * | [themeId] | `apps.theme` | `halo` \| `mono` \| `vector` \| `otaku` |
 * | [appName] | `apps.name` | identique à `brand.properties:appName` |
 * | [packageName] | `apps.package_name` | identique à `applicationId` |
 * | [apiBaseUrl] | `BrandSpec.apiBaseUrl` | **https**, sans chemin ni query |
 * | [appId] | `apps.id` | ULID de la ligne `apps` (exigé par `/v1/auth/register`) |
 * | [supportUrl] | `apps.support_url` | page de contact de l'administrateur (D19) |
 * | [accent] | `apps.accent` | `#RRGGBB` ou `null` (couleur du thème) |
 * | [offlineBundleSigningKeyB64] | clé publique Ed25519 du service | SPKI DER base64 |
 *
 * ## Pourquoi le package Kotlin ne change pas
 *
 * Le `namespace` Gradle reste `cm.bouendji.vpn` pour toutes les marques : seule
 * l'`applicationId` change. Réécrire les `import` à chaque build de marque
 * serait une source de fautes silencieuses, sans aucun bénéfice (le code n'est
 * pas visible de l'utilisateur, la classe R est déjà par module).
 *
 * ## Valeurs par défaut
 *
 * Celles de la marque de référence. Les domaines en `.invalid` sont
 * volontairement inutilisables : [requireValid] refuse de démarrer une session
 * réseau tant qu'ils n'ont pas été remplacés. Un build mal configuré doit
 * échouer visiblement, pas pointer vers un hôte qui n'existe pas.
 */
object BrandTokens {

    /** Les quatre identités visuelles (nœud `ui-identities`), pas quatre palettes. */
    enum class Theme(val id: String) {
        /** Le design « Le Billet » du prototype lelexxl2a2, palette d'origine (D91). */
        BILLET("billet"),
        HALO("halo"),
        MONO("mono"),
        VECTOR("vector"),
        OTAKU("otaku"),
        ;

        companion object {
            fun fromId(id: String): Theme =
                entries.firstOrNull { it.id == id.trim().lowercase() } ?: HALO
        }
    }

    /** Identifiant du thème injecté au build. */
    const val themeId: String = "billet"

    val theme: Theme = Theme.fromId(themeId)

    /** Nom affiché (barre de titre, notification, écran « à propos »). */
    const val appName: String = "Bouendji VPN"

    /** Doit rester égal à `applicationId` dans `build.gradle.kts`. */
    const val packageName: String = "com.bouendji.vpn"

    /** Base d'API : **sans** chemin (la signature couvre le chemin exact), https obligatoire. */
    const val apiBaseUrl: String = "https://api.numzer0.store"

    /** Ligne `apps.id` côté serveur. Sans elle, `/v1/auth/register` refuse la requête. */
    const val appId: String = "f3d5ee21-55f5-4885-bf6a-ba3af77ec70b"

    /** Contact de l'administrateur de la marque, affiché quand plus rien ne passe (D19). */
    const val supportUrl: String = "mailto:support@henshins.online"

    /** Couleur d'accent `#RRGGBB`, ou `null` pour suivre le thème. */
    val accent: String? = null

    /**
     * Clé publique Ed25519 (SPKI DER, base64) qui signe les bundles hors-ligne.
     * Vide = import hors-ligne refusé, avec un message explicite.
     */
    const val offlineBundleSigningKeyB64: String = "MCowBQYDK2VwAyEADpJiokJbnFPbgtdSPuweH+T6TpmP9TnY0i2lruG7KtQ="

    /** Locale par défaut des écrans ; le serveur accepte deux lettres minuscules. */
    const val defaultLocale: String = "fr"

    /** Mot de la carte de membre (« NJI » chez Bouendji). Vide = pas de carte nommée. */
    const val memberWord: String = "NJI"

    /** Communauté de la marque, affichée dans Aide et Connexion. Vide = rangée masquée. */
    const val communityWhatsappUrl: String = ""
    const val communityTelegramUrl: String = ""

    /** Version d'app envoyée à l'enrôlement. Remplacée par le build si besoin. */
    const val appVersion: String = "1.0.0-beta.2"

    private val PLACEHOLDERS = setOf("api.invalid", "support.invalid")

    /**
     * Échoue tôt si la marque n'a pas été injectée. Appelé au démarrage réseau,
     * pas au lancement de l'app : un build de marque incomplet doit rester
     * ouvrable, mais ne doit jamais prétendre joindre un serveur.
     */
    fun requireValid() {
        val uri = runCatching { java.net.URI(apiBaseUrl) }.getOrNull()
            ?: throw IllegalStateException("BrandTokens.apiBaseUrl illisible : $apiBaseUrl")
        check(uri.scheme == "https") { "BrandTokens.apiBaseUrl doit être en https." }
        check(uri.path.isNullOrEmpty() || uri.path == "/") {
            "BrandTokens.apiBaseUrl ne doit pas porter de chemin."
        }
        check(uri.host !in PLACEHOLDERS) {
            "BrandTokens.apiBaseUrl n'a pas été remplacé au build (${uri.host})."
        }
        check(appId.matches(Regex("^[0-9A-HJKMNP-TV-Za-z-]{20,40}$"))) {
            "BrandTokens.appId n'a pas été remplacé au build."
        }
        check(packageName.isNotBlank()) { "BrandTokens.packageName manquant." }
        check(appName.isNotBlank()) { "BrandTokens.appName manquant." }
    }

    fun isValid(): Boolean = runCatching { requireValid() }.isSuccess
}
