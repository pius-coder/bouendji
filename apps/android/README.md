# Application Android — socle

État : **écrit, jamais compilé**. Cette machine n'a ni JDK, ni Android SDK, ni
Gradle, ni `adb`. Aucun de ces fichiers n'est passé devant `kotlinc`, `javac` ou
`aapt2`. Tout ce qui est affirmé ici sur le comportement du code vient d'une
relecture, pas d'une exécution. Le rapport de vague est dans
`knowledge/agents/android-core/notes/rapport.md`.

## Arborescence

```
apps/android/
  settings.gradle.kts            module unique `:app`, dépôts verrouillés
  build.gradle.kts               plugins déclarés, aucun appliqué à la racine
  gradle.properties              AndroidX, R non transitif
  gradle/libs.versions.toml      SEULE source des versions (libs + niveaux SDK)
  brand.properties.example       identité Gradle de la marque (copier en brand.properties)
  app/build.gradle.kts           injection de marque, R8, dépendances
  app/proguard-rules.pro         sérialisation, OkHttp, TunnelEngine
  app/src/main/AndroidManifest.xml
  app/src/main/java/cm/bouendji/vpn/
    VpnApplication.kt            Application + AppContainer (graphe d'objets)
    vpn/VpnTunnelService.kt      VpnService, avant-plan, notification, D25
    vpn/TunnelEngine.kt          interface du moteur + 7 états + bus d'état
    crypto/DeviceKeys.kt         `vpn-sign` / `vpn-agree`, ouverture d'enveloppe
    crypto/Hkdf.kt               HKDF-SHA256 (absent du JDK et d'Android)
    crypto/SecureStore.kt        AES-GCM, clé Keystore `vpn-store`, `commit()`
    net/DeviceAuth.kt            forme canonique, nonce, écart d'horloge
    net/ApiClient.kt             client signé, chemins et codes d'erreur réels
    config/SingBoxConfig.kt      configuration sing-box construite en mémoire
    offline/OfflineBundle.kt     import du fichier de secours + ConfigVault
    brand/BrandTokens.kt         jetons de marque, remplacés au build
    ui/theme/                    ajouté par la vague UI *après* ce lot
      Tokens.kt                  palettes et formes des quatre identités
      ColorMath.kt               conversions et contrastes
      BrandTheme.kt              thème Compose dérivé de BrandTokens.theme
```

Le socle lui-même n'écrit aucune UI : `BrandTokens` est son seul fichier de
présentation. `buildFeatures.compose = true` est déjà posé pour que la vague UI
n'ait pas à retoucher le build. Les trois fichiers de `ui/theme/` sont hors de
ce lot et n'ont pas été relus ici ; ils lisent `BrandTokens.theme`.

## Certain, parce que vérifié dans le code du serveur

Ce qui suit a été recopié depuis `apps/api/src` et peut être comparé ligne à
ligne.

| Élément | Source |
|---|---|
| Chaîne signée `METHOD\nPATH\nsha256hex(body)\ntimestamp\nnonce` | `lib/crypto.ts:114` (`canonicalProof`) |
| En-têtes `X-Device-Token`, `X-Device-Timestamp`, `X-Device-Nonce`, `X-Device-Signature` | `lib/auth.ts:115-126` |
| Horodatage en ms, tolérance ±120 000 ms | `lib/auth.ts:130-133` |
| Nonce 16–80 caractères, unique (table `device_nonces`) | `lib/auth.ts:134`, `:151` |
| `path` sans query string | `lib/auth.ts:139` |
| Signature ECDSA-SHA256 **DER**, base64 | `lib/crypto.ts:105-111` |
| Clés publiques en SPKI DER base64, courbe P-256 exigée | `lib/crypto.ts:101`, `routes/devices.ts:64-78` |
| Enveloppe : ECDH P-256 → HKDF-SHA256(`vpn-bundle-v1\|deviceId\|revision`) → AES-256-GCM, IV 12 o, tag 16 o | `lib/crypto.ts:141-178` |
| Format des URI `vless://uuid@host:port?encryption=none&type=ws&security=tls&sni&fp&alpn&host&path` | `lib/vless.ts:22-43` |
| `maxSessionSeconds` porté par chaque configuration | `routes/bundle.ts:34-37`, `:116` |
| ETag = compte + appareil + révision, 304 possible, `Cache-Control: no-store` | `routes/bundle.ts:82-84`, `:209-235` |
| Corps d'erreur `{ error: { code, message, details?, retryAfter? } }` | `lib/errors.ts:3-34` |
| Enrôlement : challenge public puis signature avec **son** nonce | `routes/devices.ts:98-216` |
| Inscription/connexion/refresh exigent jeton d'appareil + preuve | `routes/auth.ts:139`, `:187`, `:216` |
| `appId` obligatoire à l'inscription | `routes/auth.ts:45-58` |
| Reconnecter à `max_session_seconds − 60` | `00-brief/decisions.md` D25 |

Autres points tenus par construction :

- aucune clé privée ne quitte le Keystore : seul `certificate.publicKey.encoded`
  (public) est lu ;
- aucun identifiant matériel (`ANDROID_ID`, `Build.SERIAL`, IMEI) ;
- aucun `FileOutputStream`, `writeText`, `openFileOutput`, aucun `Log` dans le
  module : rien de sensible ne peut fuir par un journal ou un fichier ;
- `BundleConfig.toString()` masque l'URI ; `VlessEndpoint.toString()` masque
  l'UUID ;
- import hors-ligne : signature → `not_after` → appareil → non-consommé →
  déchiffrement → **marquage consommé** → écriture (le marquage est un
  `commit()` synchrone, donc il précède bien l'écriture de la liste) ;
- un échec du moteur publie un état vrai et arrête le service : jamais
  « connecté » à vide.

## À vérifier au premier build — dans cet ordre

1. **Outillage.** JDK 17, Android SDK `platforms;android-35`,
   `build-tools;35.0.0`, Gradle 8.7. Rien n'est installé ici.
2. **Générer le wrapper** (fichiers binaires absents du dépôt) :
   ```bash
   cd apps/android
   gradle wrapper --gradle-version 8.7
   ```
3. **Résolution des versions.** Toutes les valeurs de
   `gradle/libs.versions.toml` sont des versions qui existent mais qui n'ont
   jamais été résolues par Gradle ici. Les relever avant de livrer, en
   conservant la cohérence AGP ↔ Gradle (8.5.2 exige Gradle 8.7) et
   Kotlin ↔ plugin Compose (même numéro).
4. **Compilation.**
   ```bash
   cd apps/android
   ./gradlew :app:assembleDebug
   ```
   Premier échec attendu, par ordre de probabilité : `kotlinOptions` déprécié
   en Kotlin 2.0 (avertissement seulement), `ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE`
   sous `minSdk 26` (lint `NewApi` si le garde `SDK_INT >= 34` n'est pas
   reconnu), `android.R.drawable.ic_lock_lock` (icône système remplacée par
   l'icône de marque de toute façon).
5. **Manifeste.** Deux composants nommés : `.VpnApplication` (=
   `cm.bouendji.vpn.VpnApplication`) et `.vpn.VpnTunnelService` (= 
   `cm.bouendji.vpn.vpn.VpnTunnelService`). Tous deux existent. Aucune activité,
   donc **l'APK ne se lance pas encore** : c'est normal à ce stade.
6. **`android:exported="true"` sur le service + `BIND_VPN_SERVICE`.** Forme
   documentée par Android, mais à confirmer sur appareil : le système doit
   binder le service et personne d'autre. Si la liaison échoue, tester
   `exported="false"` (WireGuard utilise cette variante).
7. **`foregroundServiceType="specialUse"`.** Type retenu pour un VPN sous
   Android 14. À confirmer à l'exécution (`startForeground` lève
   `MissingForegroundServiceTypeException` sinon) **et** en fiche Play : le type
   `specialUse` exige une justification écrite. Alternative parfois utilisée :
   `connectedDevice`. Non tranché.
8. **API 31 réelle.** `PURPOSE_AGREE_KEY` n'existe qu'à partir d'Android 12
   alors que `minSdk = 26`. Sur Android 8–11, enrôlement et déchiffrement sont
   refusés avec un message explicite ; aucun repli ne sort de clé privée du
   Keystore. **Décision produit à prendre** : `minSdk = 31`, ou bibliothèque
   d'accord de clés, ou hypothèse « Android 12+ ».
9. **Longueur du secret ECDH.** `KeyAgreement.generateSecret()` doit rendre les
   32 octets de la coordonnée X, comme `diffieHellman()` côté Node. Si l'accord
   renvoie autre chose (DER, point complet), le HKDF produira une clé fausse et
   GCM échouera — symptôme net, cause à confirmer par un aller-retour réel
   serveur → appareil.
10. **Ed25519.** `KeyFactory.getInstance("Ed25519")` n'est pas garanti sur
    toutes les versions ; `OfflineBundle.ed25519Available()` le sonde et refuse
    l'import proprement. Si l'import doit marcher dès Android 12, il faudra une
    implémentation embarquée (BouncyCastle ou équivalent) — dépendance non
    ajoutée, version non vérifiée.
11. **`libbox`.** Rien n'est branché : `UnavailableTunnelEngine` est le moteur
    par défaut et `LibboxTunnelEnginePlaceholder` porte le
    `TODO(verify against libbox X.Y.Z)`. Aucune version de `libbox` n'est citée
    nulle part, volontairement. À trancher aussi : GPL-3.0, donc publication
    des sources de l'APK distribué.
12. **API Clash.** `SingBoxConfig` expose `experimental.clash_api` sur
    `127.0.0.1:<port libre>` avec un secret tiré au build. Le nom exact de la
    section et le comportement de `protect()` restent à vérifier contre la
    version de sing-box retenue. La sonde de latence est censée passer par le
    moteur (côté Go), pas par OkHttp — sinon `usesCleartextTraffic="false"`
    bloquerait l'appel en boucle locale.
13. **R8 en release.** Les règles de `proguard-rules.pro` n'ont jamais tourné.
    Vérifier en priorité la sérialisation (`$$serializer`) et, le jour venu, les
    classes JNI de `libbox`.

## Commande de build exacte

```bash
# prérequis : JDK 17, ANDROID_HOME pointant sur un SDK avec platforms;android-35
cd apps/android
gradle wrapper --gradle-version 8.7          # une seule fois, machine outillée
./gradlew :app:assembleDebug                 # debug
./gradlew :app:assembleRelease               # release (R8 + shrinkResources)
./gradlew :app:lintDebug                     # lint, à lancer avant toute livraison
```

Aucune de ces commandes n'a été exécutée ici.

## Contrat de marque

Deux points d'injection, et deux seulement :

1. `brand.properties` → `applicationId`, `versionCode`, `versionName`,
   `appName` (libellé du manifeste, via `manifestPlaceholders`).
2. `brand/BrandTokens.kt` → `themeId`, `appName`, `packageName`, `apiBaseUrl`,
   `appId`, `supportUrl`, `accent`, `offlineBundleSigningKeyB64`.

Le `namespace` Gradle (`cm.bouendji.vpn`) ne change jamais : une autre marque
est une autre `applicationId`, pas un autre code. `BrandTokens.requireValid()`
refuse de démarrer une session réseau tant que les valeurs par défaut
(`.invalid`, `appId` nul) sont en place ; l'app reste ouvrable pour dire
pourquoi.

## Ce qui n'est pas dans ce lot

UI Compose · consentement VPN (`VpnService.prepare`, déclenché par l'UI) ·
récepteur de démarrage au boot · always-on · Play Integrity · bascule
automatique et backoff · statistiques de débit · icône adaptative · tests
(unitaires et instrumentés) · adaptateur `libbox`.

## Licence

`libbox` (sing-box) est en **GPL-3.0**. Il n'est pas intégré ici, précisément
pour que ce choix reste ouvert. L'intégrer oblige à publier les sources
correspondantes de l'APK distribué — contrainte juridique, pas détail de build.
