# Audit #9 — Build, marque, signature et distribution APK

Statut : **reviewed**, lecture seule. Aucun build, aucune exécution d'application,
aucun workflow lancé. Chaque affirmation cite un fichier et une ligne ; ce qui
dépend d'une exécution porte `(non vérifié)`.

Périmètre lu en entier : `apps/android/{settings,build}.gradle.kts`,
`gradle.properties`, `gradle/libs.versions.toml`, `app/build.gradle.kts`,
`app/proguard-rules.pro`, `app/src/main/AndroidManifest.xml`,
`app/src/main/java/cm/bouendji/vpn/brand/BrandTokens.kt`, `apps/android/README.md`,
`tools/inject-brand.mjs`, les 9 manifestes `tools/brands/*.json` (+ `_example`),
`tools/build-apk.ps1`, `tools/build-libbox.ps1`, `tools/fetch-segmented.ps1`,
`.github/workflows/android-brand.yml`, `.github/workflows/libbox.yml`,
`.github/workflows/endpoint-image.yml` (pour vérifier qu'il ne compile pas d'APK).
Trois incursions hors périmètre, nécessaires aux questions 4 et 6 :
`apps/api/src/routes/builds.ts` (callback, `versionCode`), `apps/api/src/lib/brand.ts`
(clé `REFERENCE_PACKAGE`), `apps/api/src/routes/payments.ts` (lien de retour).

---

## Verdict

La chaîne **fonctionne** — 8 APK signés ont été produits et publiés le 29/10 —
mais elle n'est **ni protégée, ni reproductible, ni réversible**. Trois constats
dominent :

1. **N'importe quel push sur n'importe quelle branche qui touche
   `tools/brands/*.json` compile, signe avec la clé de production et écrase
   `latest.apk`.** Le dépôt est public, `master` n'est pas protégé, il n'y a pas
   de `CODEOWNERS`. Le chemin `push` court-circuite la validation owner de D117 :
   un manifeste peut changer `apiBaseUrl`, garder le `packageName` d'une marque
   réelle et un `versionCode` supérieur → Android installe l'APK par-dessus
   l'application légitime, même certificat. C'est le défaut le plus grave du lot.
2. **Rien ne garantit que l'APK publié correspond à la marque demandée.** Le
   `versionCode` a trois sources (JSON, base, `brand.properties`), deux champs
   de version ont un défaut silencieux (`1` / `1.0.0`), aucun contrôle ne relie
   `applicationId`, `BrandTokens.packageName` et `BrandTokens.appId`. L'arbre de
   travail est aujourd'hui dans un état mixte qui le prouve (voir P1-2).
3. **Le moteur `libbox` n'a pas de chaîne de confiance indépendante** : l'AAR et
   son empreinte sont téléchargés depuis la même Release réinscriptible, et
   l'empreinte versionnée dans le dépôt est écrasée au build.

Sur les 7 questions : reproductibilité **non** (wrapper non versionné, pas de
`distributionSha256Sum`, AAR reconstruit à la main, R8 jamais vérifié en local) ;
injection **solide sur la validation, faible sur les invariants** ; signature
**correcte techniquement, sans épingle de certificat ni plan de perte de clé** ;
versionnement **manuel, sans contrôle de monotonie** ; manifeste **propre sauf
`minSdk 26` mensonger et schéma de deep link global** ; CI **idempotente côté
callback mais sans garde de branche ni d'artefact** ; dette de reconstruction
**réelle : un tiers ne peut pas reconstruire à l'identique sans te demander
l'outillage**.

---

## 1. Reproductibilité

**Une même marque ne produit pas le même APK.** Ce n'est pas un défaut en soi
(la signature et les horodatages ZIP changent), mais rien n'est fait pour que
*le contenu* soit identique, et deux dépendances extérieures peuvent changer
sous les pieds du build.

- **Wrapper Gradle absent du dépôt.** Aucun
  `apps/android/gradle/wrapper/gradle-wrapper.properties` (glob vide). Le CI le
  fabrique à chaque run : `android-brand.yml:190-192`
  (`gradle wrapper --gradle-version 8.7 --distribution-type bin`). Conséquence :
  le `distributionUrl` généré ne porte pas de `distributionSha256Sum`, donc
  `./gradlew` (`:198`) re-télécharge Gradle 8.7 depuis `services.gradle.org`
  **sans vérification d'empreinte**. En local, `tools/build-apk.ps1:21` pointe
  un `gradle-8.7` installé à la main.
- **Versions des bibliothèques : verrouillées, bien.** `libs.versions.toml:9-23`
  n'utilise que des versions exactes, aucune plage, aucun `+`, aucun SNAPSHOT.
  `buildToolsVersion = "35.0.0"` est figé (`app/build.gradle.kts:32`). C'est le
  point fort du build.
- **Pas de verrouillage du graphe résolu** : aucun `gradle.lockfile`, aucun
  `gradle/verification-metadata.xml`. Une dépendance mutée aux mêmes coordonnées
  serait acceptée. Risque standard, mais réel pour un dépôt public.
- **AGP 8.5.2 avec `compileSdk = 35`** (`libs.versions.toml:9,11`) : AGP 8.6 est
  la première version qui supporte officiellement l'API 35. Le build passe
  (8 APK livrés), donc ce n'est qu'un avertissement aujourd'hui — à corriger au
  prochain relèvement d'AGP `(non vérifié : aucun build lancé ici)`.
- **`libbox.aar` : reconstruit à la main, hors dépôt.** `app/libs/*.aar` est
  ignoré (`.gitignore:15`) ; seul `app/libs/libbox.aar.sha256` est suivi. L'AAR
  local fait **86 892 547 octets**, sha256 `a772c6bc…a1b3`, et contient bien
  `jni/arm64-v8a`, `jni/armeabi-v7a`, `jni/x86_64` et un `proguard.txt`
  consommateur (vérifié en lisant l'archive, sans la décompresser). La Release
  `libbox-1.14.3` de `pius-coder/bouendji` expose exactement deux assets
  (`libbox.aar` 86 892 547 octets, `libbox.aar.sha256` 65 octets) — vérifié par
  `gh release view` le 2026-10-29.
- **`tools/build-libbox.ps1` ne construit pas la version demandée.**
  `$Version = 'v1.14.3'` (`:23`) n'est **jamais** utilisé pour un `git checkout`
  ou un `git clone` : il n'apparaît qu'à l'affichage (`:106`). Le script compile
  ce qui se trouve dans `$SrcRoot` (`:26`, `:109-111`), un chemin en dur
  `C:\Users\HP\android-toolchain\sing-box`. La mention « reproductible à partir
  du tag v1.14.3 » (`app/build.gradle.kts:108`) est donc **fausse en pratique**.
  Le défaut par défaut est aussi `-Platform 'android/arm64'` (`:24`), donc
  relancer le script sans `-FullAbi` **régresse D138** en silence (APK
  arm64 seul).
- **Cache** : `org.gradle.caching=true` (`gradle.properties:4`), cache
  `~/.gradle` côté CI (`gradle/actions/setup-gradle`, `android-brand.yml:99-101`).
  Je n'ai pas trouvé de chemin produisant un APK d'une autre marque depuis le
  cache : `applicationId`, `versionCode`, `versionName` et `manifestPlaceholders`
  dérivent de `brand.properties`, qui est lu à la configuration et entre donc
  dans les entrées des tâches ; `BrandTokens.kt` est un fichier source suivi.
  `(non vérifié : raisonnement sur le graphe de tâches, pas une exécution.)`
- **Si la Release disparaît** : le build échoue **franchement** à l'étape
  « Moteur libbox » (`android-brand.yml:179-183`, `exit 1` après 3 essais). Pas
  d'APK trompeur. Mais il n'existe alors aucun autre moyen de reconstruire le
  moteur hors d'une machine Windows portant les chemins de `build-libbox.ps1`.

## 2. Injection de marque

**Correction de la prémisse** : `inject-brand.mjs` ne réécrit pas
`build.gradle.kts`. Il réécrit `BrandTokens.kt` (`:213-233`) et
`apps/android/brand.properties` (`:235-249`) ; `app/build.gradle.kts:20-25,35-39,45`
**lit** ce fichier. Deux points d'écriture, un point de lecture.

**Champs validés (refus immédiat, code 78)** — `inject-brand.mjs:61-198` :
`theme` (8 valeurs, `:25`), `appName` 2-40 (`:69-71`), `packageName` (segments
`[a-z][a-z0-9_]*`, mots réservés Java, `:73-85`), `apiBaseUrl` https sans
chemin/query/fragment (`:87-98`), `appId` (`:100-104`), `supportUrl` **requis**
(`:106-120`), `accent` (`:122-128`), `memberWord` (`:137-140`), liens de
communauté https (`:142-157`), `contactWhatsapp` (`:159-165`), `logoRef`
(`:167-178`), `defaultLocale` (`:180-182`), `versionCode`/`versionName`
(`:184-194`). C'est du bon travail : un manifeste invalide ne produit pas d'APK.

**Ce qui peut casser silencieusement :**

| Champ absent | Effet | Gravité |
|---|---|---|
| `versionCode` | défaut **1** (`:184`) : APK non installable par-dessus l'existant, et si publié, `latest.apk` régresse | P1 |
| `versionName` | défaut `1.0.0` (`:190`) | P3 |
| `brand.properties` absent | `applicationId=cm.bouendji.vpn`, `versionCode=1`, libellé `Bouendji VPN` (`app/build.gradle.kts:24-25,35-39,45`) — **aucun `require()` sur ce fichier**, contrairement à `libbox.aar` (`:113`) | P1 |
| `offlineBundleSigningKeyB64` | `""` : import `.bvpn` refusé à l'exécution, l'APK se construit et se distribue normalement | P2 |
| `memberWord`, liens communauté | `""` : carte de membre absente, lignes masquées | P3 |
| clé base64 invalide | seule la forme base64 est vérifiée (`:132-134`), pas la longueur SPKI Ed25519 → l'import échoue plus tard, à l'usage | P3 |

**Aucun invariant entre les deux fichiers.** `BrandTokens.requireValid()`
(`BrandTokens.kt:111-126`) vérifie que l'URL est https, sans chemin, que `appId`
ressemble à un identifiant et que `packageName`/`appName` ne sont pas vides —
**jamais** que `BrandTokens.packageName == applicationId`, ni que `appName` est
le même que le libellé du manifeste, ni que `appId` correspond à la marque.

**Preuve que ça arrive :** l'arbre de travail est actuellement dans un état
mixte. `apps/android/brand.properties:2-5` dit `cm.bouendji.saitrix` / `Saitrix`
/ **1.1.3 (5)**, tandis que `BrandTokens.kt:63,68,71,77,102` porte encore les
défauts Bouendji (`billet`, `Bouendji VPN`, `com.bouendji.vpn`, appId
`f3d5ee21…`, `1.0.0-beta.2`). Un `assembleDebug` maintenant produirait un APK
d'`applicationId` Saitrix étiqueté « Saitrix » à l'installation, affichant
« Bouendji VPN » à l'écran et enregistrant les comptes sur la ligne `apps` de
Bouendji. Le même arbre contient
`app/build/outputs/apk/debug/saitrix-1.1.3-debug.apk` (251 742 463 octets), trace
d'un build local dans cet état. La marque livrée est 1.1.4 (6) : cet APK local
est déjà en retard d'un `versionCode`.

**Cohérence des manifestes** (9 fichiers réels : 8 livrés + `aura-test.json`) :

- 8 thèmes distincts pour les 8 marques livrées — cohérent.
- **`supportUrl` identique partout** : `mailto:support@henshins.online` (8/8).
  Ce n'est pas le contact de la communauté mais l'adresse de la plateforme
  (D92/D116) ; elle s'affiche « quand plus rien ne passe » (D19).
- **`communityWhatsappUrl` et `communityTelegramUrl` vides dans 8/8** : le
  pop-up d'accueil de D116 et la carte de partage de D131 n'ont donc aucun lien
  (« Lien bientôt disponible »). Aucune des 8 marques livrées n'a de lien
  communautaire.
- 7 `packageName` sur 8 commencent par `cm.bouendji.` — l'opérateur est lisible
  dans l'identifiant de toutes les marques blanches, alors que D144 repose sur
  le fait que « les communautés ne se découvrent pas entre elles ».
- **`aura-test.json:7` et `bouendji.json:7` partagent le même `appId`**
  (`f3d5ee21-…`), et `aura-test.json:6` pointe **l'API de prod**
  (`https://api.numzer0.store`) alors que son commentaire (`:2`) décrit
  « aura-vps, paiement simulé ». Deux packages, un seul compte, un seul
  `versionCode` (`builds.ts:200-203` filtre par `app_id`).
- **`inject-brand.mjs:82` protège `cm.bouendji.vpn`**, qui est le *namespace*
  Kotlin (`settings.gradle.kts:6`), alors que la marque de référence utilise
  `com.bouendji.vpn` (`bouendji.json:5`). La garde anti-collision ne protège
  donc pas le package qu'elle devrait protéger. Même constante côté API
  (`lib/brand.ts:57`).

## 3. Signature

- **Clé** : keystore base64 dans le secret `ANDROID_KEYSTORE_B64`, décodé dans
  `$RUNNER_TEMP` avec `umask 077` (`android-brand.yml:210-212`), suppression en
  fin d'étape (`:224`). Les mots de passe passent par `env:` et
  `--ks-pass env:` (`:220-221`), jamais sur la ligne de commande. Correct.
- **Aucun `signingConfig` dans Gradle** (`app/build.gradle.kts:48-63`, grep vide
  sur `signingConfig|storeFile|keyAlias`) : `assembleRelease` produit un APK
  **non signé**, signé après coup par `apksigner` (`:217-222`). Conséquence
  locale : `README.md:157` documente `./gradlew assembleRelease` sans étape de
  signature ; l'APK obtenu ne s'installe pas. Et l'APK **debug** local
  (`build-apk.ps1:19`) est signé par la clé debug : il **ne peut pas être mis à
  jour** vers l'APK release (signataires différents). Le seul chemin est la
  désinstallation, qui détruit le Keystore de l'appareil (clés d'enrôlement,
  coffre chiffré) et consomme un nouvel emplacement d'appareil. Rien ne le dit.
- **Pas d'épinglage du certificat** : `apksigner verify --print-certs` imprime
  l'empreinte dans le journal du run (`:223`) puis elle est perdue. Aucune
  constante `EXPECTED_CERT_SHA256` dans le dépôt ni dans la base : si le secret
  keystore est remplacé ou restauré de travers, les 8 marques deviennent
  définitivement non mettables à jour sans qu'aucun job ne rougisse.
- **Perte de clé** : tous les utilisateurs doivent désinstaller (nouvelle
  signature), donc perdre leur identité d'appareil et leur coffre hors-ligne.
  Aucune rotation (`apksigner --lineage`, `--rotation-min-sdk-version` non
  utilisés), aucune procédure de restauration testée. D102 cite une sauvegarde
  `/root/android-release/` sur le VPS, 0600 — `(non vérifié : pas d'accès VPS)`.
- **Un APK re-signé peut-il écraser l'original ?** Sur l'appareil, non : Android
  refuse un signataire différent (`INSTALL_FAILED_UPDATE_INCOMPATIBLE`). **Sur
  R2, oui** : le chemin versionné est réécrit sans garde (`:262-263`, `aws s3 cp`
  = PutObject), et `latest.apk` est réécrit à chaque build (`:264-266`). Un APK
  re-signé **avec la même clé** est indistinguable d'une mise à jour légitime.
- **`debuggable`** : non déclaré → `false` en release (défaut AGP), correct.
- **R8 / ProGuard** : `isMinifyEnabled = true`, `isShrinkResources = true`
  (`:55-62`), règles `proguard-rules.pro` complètes pour la sérialisation
  (`:7-22`) et le moteur (`:42-44`). Mais **aucun build release n'existe dans
  l'arbre local** (`apps/android/app/build/outputs/apk/` ne contient que
  `debug/`), donc ces règles n'ont jamais été éprouvées ici. Le `mapping.txt`
  n'est **pas** archivé par le workflow, alors que `proguard-rules.pro:46-48`
  l'exige explicitement : une pile d'exception release est illisible
  (`-renamesourcefileattribute SourceFile`). `debugSymbolLevel` absent.
- **Nettoyage** : `rm` du keystore uniquement en fin de chemin heureux
  (`set -euo pipefail`, `:208-224`) ; un échec d'`apksigner` laisse le fichier
  dans `$RUNNER_TEMP` d'un runner éphémère. Acceptable, à noter.

## 4. Versionnement et mise à jour

- **`versionCode` a trois sources.** JSON (`tools/brands/*.json:15-16`), base
  (`builds.ts:193-211`, `max(version_code)+1` sous `SELECT … FOR UPDATE`), et
  `brand.properties:4`, recopié du JSON. Le chemin API ignore le JSON et impose
  le calcul ; le chemin `push` utilise **le JSON tel quel**. Les deux ne sont pas
  synchronisés : `saitrix.json` dit 6 et l'APK 1.1.4 (6) est déjà publié. Un
  push sur ce fichier reconstruit donc **le même `versionCode` déjà distribué**.
- **Aucun incrément automatique sur le chemin `push`**, aucun contrôle que le
  nouveau `versionCode` dépasse celui déjà présent sur R2. Rien n'empêche de
  publier 3 après 7 et d'écraser `latest.apk` avec une régression.
- **`min_version_code` n'est jamais lu.** La colonne existe
  (`apps/api/src/schema.ts:32`), le contrat la déclare
  (`packages/contract/src/index.ts:171`), mais aucune route ne la sélectionne et
  aucun code Android ne la lit (grep : 0 occurrence hors schéma/contrat). De même
  `apps.store_url` (`schema.ts:33`). **Il n'existe donc aucun mécanisme de mise à
  jour, forcée ou proposée** : `latest.apk` change, l'app ne le sait pas.
- **Pousser une mise à jour aux 8 marques sans casser l'existant** exige, en
  l'état : même certificat, même `applicationId`, `versionCode` strictement
  supérieur, `apiBaseUrl` inchangée, et un build par marque. Rien de tout cela
  n'est vérifié par la pipeline ; seul le `max+1` de l'API le garantit, et
  uniquement si l'on passe par elle. Le `latest.apk` réécrit fait qu'un
  utilisateur qui retélécharge peut recevoir une version **inférieure** à celle
  installée, qu'il ne pourra pas installer.
- `versionCode` max accepté : 2 100 000 000 (`inject-brand.mjs:185`,
  `lib/brand.ts:92`). Correct pour Android.

## 5. Manifeste et build

- **Permissions** : `INTERNET`, `ACCESS_NETWORK_STATE`, `FOREGROUND_SERVICE`,
  `FOREGROUND_SERVICE_SPECIAL_USE`, `POST_NOTIFICATIONS`
  (`AndroidManifest.xml:22-28`). Minimal et justifié ; pas de
  `QUERY_ALL_PACKAGES`, pas de récepteur de boot, pas d'identifiant matériel.
- **`foregroundServiceType="specialUse"`** + propriété
  `PROPERTY_SPECIAL_USE_FGS_SUBTYPE` (`:107,112-114`) : forme attendue pour un
  VPN sous Android 14. `exported="true"` + `BIND_VPN_SERVICE` (`:104-108`) :
  forme documentée, surface limitée à la permission signature.
- **`targetSdk 35` / `minSdk 26`** (`libs.versions.toml:12-13`). Le commentaire
  de la même ligne dit « plancher réel : ECDH Keystore exige 31 ».
  `DeviceKeys.supportsAgreement()` renvoie `SDK_INT >= 31`
  (`crypto/DeviceKeys.kt:41-46,61`) et `ApiClient.enroll` **lève** en dessous
  (`net/ApiClient.kt:139-148`). L'APK s'installe donc sur Android 8–11 et ne
  peut **jamais** s'enrôler. C'est une promesse de compatibilité fausse, et elle
  recoupe D138 : le correctif 32 bits vise des appareils anciens, dont une partie
  tourne sous API 26–30.
- **ABI** : aucun `ndk { abiFilters }`, aucun `splits` (grep vide) → les 3
  architectures du moteur universel sont embarquées. L'APK debug local mesuré
  fait **252 999 899 octets** (253 Mo) ; la livraison du 29/10 annonce ~242 Mo
  en release. AGP stocke les `.so` non compressés par défaut (`minSdk ≥ 23`),
  d'où le volume. Pour un téléchargement mobile au Cameroun, c'est un coût réel.
- **`usesCleartextTraffic="false"`** (`:38`) : correct, l'API est https. Le
  README (`:140-145`) signale que la sonde Clash en boucle locale pourrait en
  souffrir si elle passait par OkHttp `(non vérifié)`.
- **`allowBackup="false"` + `fullBackupContent="false"`** (`:32-33`) : le coffre
  et les clés ne partent pas dans une sauvegarde. Correct.
- **Aucune network security config** : `res/xml/` n'existe pas. Conséquence
  acceptable (targetSdk ≥ 24 ne fait pas confiance aux CA utilisateur par
  défaut), mais aucun épinglage déclaratif n'est possible et rien ne documente
  cette décision. Le point TLS est traité par la revue `android-state-review`.
- **Deep link de paiement global** : `AndroidManifest.xml:65` déclare
  `scheme="cm.bouendji.vpn"`, en dur, pour **toutes** les marques, et
  `MainActivity.kt:102` compare la même constante. Côté serveur,
  `routes/payments.ts:80` construit le même lien pour toutes les marques, et
  `:81` construit un `intent://…;package=cm.bouendji.nevpn;…` **codé en dur sur
  NevVPN** que la page ouvre automatiquement (`:190`) avant d'afficher le lien
  direct (`:219`). Un utilisateur Saitrix qui paie est renvoyé vers NevVPN s'il
  l'a installé, sinon vers un Intent non résolu ; s'il a deux marques, le
  système peut ouvrir la mauvaise application. La page de retour est en outre
  titrée « Bouendji VPN » (`:121`).
- Filtres `application/octet-stream` (`:72-89`) : l'app apparaît dans le
  « Partager vers » de tout fichier binaire. Voulu (D94), mais large.

## 6. CI

Workflows qui compilent : `android-brand.yml` (APK) et `libbox.yml` (moteur).
`endpoint-image.yml` ne touche pas l'Android.

- **Déclencheurs** : `workflow_dispatch` (avec `spec` et
  `build_callback_url`) et `push` sur `tools/brands/*.json`
  (`android-brand.yml:19-32`). **Aucun filtre `branches:`** : un push sur une
  branche de travail publie dans le R2 de production.
- **Secrets** : `ANDROID_KEYSTORE_B64`, `ANDROID_KEY_ALIAS`,
  `ANDROID_KEY_PASSWORD`, `ANDROID_KEYSTORE_PASSWORD`, `BUILD_CALLBACK_TOKEN`,
  `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` ; variables `R2_ACCOUNT_ID`,
  `R2_BUCKET` ; `github.token` pour `gh release download`. `permissions:
  contents: read` (`:34-35`) est correct mais ne limite pas l'accès aux secrets.
- **Callback idempotent : oui.** L'URL porte l'identifiant du build
  (`builds.ts:272`), la mise à jour est conditionnée à
  `status IN ('queued','running')` et les champs optionnels passent par
  `COALESCE` (`builds.ts:470-511`). Un rejeu ou un rapport tardif ne réécrit
  rien et répond 200. C'est solide.
- **Un build échoué peut laisser un artefact trompeur.** L'ordre est : upload R2
  (`:245-272`) **puis** callback de succès (`:274-285`). Si le callback échoue
  (jeton absent, API injoignable), le job est rouge **après** avoir écrasé
  `latest.apk` : le fichier est publié, la base reste `queued`. Le callback
  d'échec (`:287-298`) s'exécute alors et marque `failed` — un build `failed`
  dont l'APK est en ligne.
- **Timeout et annulation** : `timeout-minutes: 45` (`:82`). Le callback d'échec
  est gardé par `if: failure()` (`:290`), qui est **faux** pour un job annulé ou
  expiré (`cancelled()` est nécessaire). Un build tué au bout de 45 min laisse
  la ligne en `running` pour toujours. Si le job `specs` échoue, aucun callback
  n'est possible (pas encore d'identifiant de build dans la matrice).
- **Pas de test, pas de lint** dans le workflow (aucun `test`/`lint` ; aucun
  fichier sous `app/src/test` ou `androidTest`).
- **Pas de contrôle de l'APK produit** : ni `aapt dump badging`, ni vérification
  que `applicationId == spec.packageName`, ni que le certificat est celui
  attendu. Une injection ratée ne se voit qu'à l'installation.
- Le job `specs` ne regarde que `HEAD~1..HEAD` (`:54,67`) : un push de plusieurs
  commits ne construit que le dernier manifeste modifié.
- **`libbox.yml`** construit `android/arm,android/arm64,android/amd64`
  (`:86`), vérifie 2 ABIs sur 3 (`:94-95`, x86_64 non testé) et publie avec
  `gh release upload … --clobber` (`:112`) : la Release est **réinscriptible**,
  y compris son `.sha256`.

## 7. Dette de reconstruction

Ce qui empêche un tiers de reconstruire :

1. **Pas de wrapper Gradle versionné** : il faut installer Gradle 8.7 soi-même,
   ou laisser le CI le générer.
2. **`libbox.aar` hors dépôt** (`.gitignore:15`) : il faut la Release GitHub
   (dépôt public, donc accessible) **ou** `tools/build-libbox.ps1`, qui est
   Windows-only, pointe `C:\Users\HP\…` (`:25-29`), ne sort pas le tag demandé
   et copie vers un autre projet (`$Repo`, `:137-139`).
3. **`brand.properties` généré, non versionné, aucun garde-fou** : sans
   `node tools/inject-brand.mjs --spec tools/brands/<x>.json --root apps/android`,
   on compile la marque de référence en `versionCode 1`. `tools/build-apk.ps1`
   n'appelle **jamais** l'injection.
4. **Signature non reproductible localement** : pas de `signingConfig`, pas de
   script de signature hors du YAML, keystore dans un secret GitHub.
5. **`README.md` périmé et contredit le code** : « écrit, jamais compilé »
   (`:3-7`), « aucune activité, donc l'APK ne se lance pas » (`:107-110`),
   « libbox […] n'est pas intégré ici » (`:187-189`) alors que
   `app/build.gradle.kts:112-117` en fait une dépendance obligatoire, et
   « quatre identités » (`:34`) alors que `libs.versions.toml:25` en définit huit.
   Un nouveau venu suit une procédure qui ne mène pas à l'APK livré.
6. **Chemins Windows en dur** dans les trois scripts : `C:\Users\lenovo\…`
   (`build-apk.ps1:20-21`), `C:\Users\HP\…` (`build-libbox.ps1:25-29`),
   `System32\curl.exe` (`fetch-segmented.ps1:52`).
7. **Aucun test** : rien ne dit si une reconstruction est correcte.
8. **`fetch-segmented.ps1` ne vérifie aucune empreinte** (`:56-64` : taille +
   ouverture ZIP seulement) et traite un `.part` existant comme un préfixe du
   fichier demandé sans avoir mémorisé l'URL (`:154-159`). Pour un outillage de
   build, c'est une confiance non justifiée.

---

## Défauts

### P0

**P0-1 — Publication signée sans aucune barrière, sur n'importe quelle branche.**
Preuves : `.github/workflows/android-brand.yml:30-32` (trigger `push` sans
`branches:`), `:200-224` (signature avec la clé de production), `:262-266`
(écrasement de `latest.apk`), dépôt `PUBLIC`, branche `master` **non protégée**
(`gh api …/branches/master/protection` → 404), aucun `.github/CODEOWNERS` alors
que D42 le présente comme la revue.
Conséquence : un porteur de droit d'écriture (ou une PR fusionnée) modifie
`apiBaseUrl` dans un manifeste de marque, garde `packageName` et augmente
`versionCode` → la CI signe, publie et les utilisateurs reçoivent une mise à jour
**valide pour Android** (même package, même certificat) qui parle à un autre
serveur. Prend le contrôle du canal de mise à jour des 8 marques, sans revue ni
validation owner (D117). Un push sur une branche de travail suffit.
Correctif : `branches: [master]` (ou supprimer le trigger `push`), protéger
`master` (review obligatoire + CODEOWNERS), et sortir le keystore/R2 dans un
GitHub Environment avec approbation.

### P1

**P1-1 — `minSdk 26` alors que l'enrôlement exige l'API 31.**
`libs.versions.toml:12`, `DeviceKeys.kt:41-46,61`, `ApiClient.kt:139-148`.
Conséquence : installation réussie sur Android 8–11, puis échec définitif à
l'enrôlement. Corriger `minSdk` à 31, ou assumer et documenter un repli.

**P1-2 — Défauts silencieux et absence d'invariants de marque.**
`inject-brand.mjs:184-194` (`versionCode`→1), `app/build.gradle.kts:20-25,35-39`
(pas de `require` sur `brand.properties`), `BrandTokens.kt:111-126` (aucune
comparaison package/appId/libellé). Preuve vivante : `brand.properties` = Saitrix
1.1.3 (5), `BrandTokens.kt` = Bouendji. Conséquence : APK publié sous une marque
avec l'identité d'une autre, ou `versionCode` inférieur à l'existant.

**P1-3 — Rien n'empêche d'écraser un APK déjà distribué.**
`android-brand.yml:261-266` (aucune garde d'existence, `latest.apk` toujours
réécrit), `saitrix.json:15` (6, déjà publié), pas de comparaison avec R2.
Conséquence : le lien versionné de D144 change de contenu sous le même nom, et
`latest.apk` peut régresser.

**P1-4 — Chaîne de confiance `libbox` auto-référentielle.**
`android-brand.yml:180-185` télécharge `libbox.aar` **et** `libbox.aar.sha256`
depuis la même Release, puis écrase le fichier d'empreinte versionné dans le
dépôt ; `libbox.yml:112` publie avec `--clobber`. Conséquence : une Release
réécrite passe la vérification. Seule protection réelle : la revue du tag.

**P1-5 — Deep link de paiement global et mal ciblé.**
`AndroidManifest.xml:65`, `MainActivity.kt:102`, `payments.ts:80-81,190,219`.
Conséquence : retour de paiement ambigu entre marques, redirection automatique
vers `cm.bouendji.nevpn`, page titrée « Bouendji VPN » pour les 8 marques.

**P1-6 — `aura-test.json` partage l'`appId` de Bouendji et pointe la prod.**
`aura-test.json:6-7` vs `bouendji.json:6-7`. Conséquence : mêmes comptes,
commandes, forfaits et emplacements d'appareil ; séquence de `versionCode`
partagée ; un push construit et publie une APK « de test » sur l'API de
production.

### P2

- **P2-1** Wrapper non versionné + `distributionSha256Sum` absent
  (`android-brand.yml:190-198`).
- **P2-2** R8 jamais éprouvé localement (pas de `outputs/apk/release`),
  `mapping.txt` non archivé, `debugSymbolLevel` absent
  (`proguard-rules.pro:46-50`).
- **P2-3** Pas de `signingConfig` : `assembleRelease` local non installable
  (`app/build.gradle.kts:48-63`, `README.md:157`) ; debug et release ont deux
  signataires, donc pas de mise à jour de l'un vers l'autre.
- **P2-4** Aucune empreinte de certificat épinglée : un keystore remplacé passe
  inaperçu (`android-brand.yml:223`).
- **P2-5** Marques incohérentes : `supportUrl` unique (8/8), aucun lien
  communautaire (8/8), préfixe `cm.bouendji.` (7/8).
- **P2-6** `min_version_code` et `store_url` morts : aucune mise à jour possible
  (`schema.ts:32-33`, `contract/src/index.ts:171`).
- **P2-7** La garde anti-collision protège le namespace, pas le package de
  référence (`inject-brand.mjs:82`, `lib/brand.ts:57` vs `bouendji.json:5`).
- **P2-8** Aucun test, aucun lint dans le module ni dans la CI.
- **P2-9** `build-apk.ps1` n'injecte pas la marque, ne construit qu'en debug, et
  `build-libbox.ps1` ignore `$Version` et sort arm64 seul par défaut.
- **P2-10** `README.md` périmé sur quatre points structurants.
- **P2-11** 253 Mo d'APK mesurés (3 ABI non compressées) ; pas de splits.
- **P2-12** Callback d'échec absent sur annulation/timeout (`android-brand.yml:290`)
  et publication R2 avant le callback de succès.

### P3

- `theme`, `contactWhatsapp`, `logoRef` écrits dans `brand.properties:6-8` mais
  lus par personne (`inject-brand.mjs:167-169` promet l'inverse).
- Regex `appId` acceptant 20 tirets (`inject-brand.mjs:101`).
- Clé hors-ligne validée en base64 seulement (`:132-134`), pas en SPKI 32 octets.
- Build-tools du signataire choisis par `sort -V | tail -1`
  (`android-brand.yml:215`), non épinglés.
- `find … -name '*.apk' | head -n 1` (`:213`) : sélection non déterministe si
  plusieurs APK sortent.
- `org.gradle.tooling.parallel` (`gradle.properties:18`) : propriété non
  documentée pour Gradle 8.7 `(non vérifié)`.
- `$aars` calculé et inutilisé (`build-libbox.ps1:119`).
- `libbox.yml:94-95` ne vérifie que 2 ABIs sur les 3 construites.
- `specs` ne voit qu'un commit (`fetch-depth: 2`, `:54,67`).
- `fetch-segmented.ps1` sans paramètre d'empreinte (`:56-64`).

---

## Ce qui est vérifié, et comment

| Fait | Preuve |
|---|---|
| 8 marques livrées, versions 5/6/7 | nœud `livraison-apk-2026-10-29` (lecture du binaire) + `tools/brands/*.json` |
| Release `libbox-1.14.3` = 2 assets, 86 892 547 o | `gh release view` le 2026-10-29 |
| AAR local = empreinte versionnée, 3 ABI + proguard.txt | lecture de l'archive + sha256 calculé (`a772c6bc…`) |
| APK debug local = 252 999 899 o, aucun build release local | `find apps/android/app/build/outputs` |
| Arbre de travail en état mixte Saitrix/Bouendji | `brand.properties:2-5` vs `BrandTokens.kt:63-102` |
| `master` non protégé, dépôt public, pas de CODEOWNERS | `gh api`, `gh repo view`, glob |
| Callback idempotent | `builds.ts:470-511` |
| `min_version_code` non lu | grep 2 occurrences (schéma + contrat) |
| 9 manifestes, un `appId` dupliqué | lecture des 9 fichiers |

## Ce qui ne l'est pas

- **Aucun build, aucun workflow, aucune installation** : toute affirmation sur le
  comportement de R8, d'`apksigner`, du wrapper généré ou de l'APK release est
  une lecture, pas une exécution.
- Contenu réel des secrets, alias et type de keystore.
- Sauvegarde `/root/android-release/` (D102) et intégrité du VPS.
- Contenu du bucket R2 (quelle version est réellement servie sous `latest.apk`).
- Protection des autres branches (`dev`, `api/prod-hardening`) : seule `master`
  a été interrogée.
- Comportement de la sonde Clash sous `usesCleartextTraffic="false"`.
- `org.gradle.tooling.parallel` et le support officiel d'API 35 par AGP 8.5.2.

## Recommandations, par ordre de coût/bénéfice

1. **Fermer le chemin `push`** : `branches: [master]` + protection de `master` +
   CODEOWNERS, ou suppression du trigger et passage exclusif par l'API (D117).
   Une heure de travail, ferme P0-1.
2. **Épingler le certificat** : constante `EXPECTED_CERT_SHA256` comparée à
   `apksigner verify --print-certs` ; échec sinon. Ferme P2-4 et détecte une
   rotation accidentelle.
3. **Refuser un `versionCode` non croissant** : `HEAD` sur le chemin R2 avant
   upload, échec si `<=`, et `--if-none-match` sur le chemin versionné.
4. **Un seul invariant de marque, vérifié au build** : un script qui compare
   `applicationId`, `BrandTokens.packageName`, `BrandTokens.appName` et
   `BrandTokens.appId` (via `aapt dump badging` + grep du source) et qui échoue
   sinon. Rendre `brand.properties` obligatoire (`require(brandFile.exists())`).
5. **Injection du deep link** : dériver schéma et package de `applicationId`
   (`<package>.pay`) et les injecter dans le manifeste, dans `MainActivity` et
   dans `payments.ts`.
6. **`minSdk` à 31**, ou repli documenté ; aligner D138 sur la vraie plage.
7. **Wrapper versionné** avec `distributionSha256Sum`, committé.
8. **Archiver `mapping.txt`** en artefact de run ; ajouter `debugSymbolLevel`.
9. **Splits par ABI** (arm64 ~90 Mo, armv7 ~85 Mo) avec un APK universel de
   secours, pour ramener le téléchargement sous 100 Mo.
10. **Un test de fumée** : `node --test` sur `inject-brand` (refus + invariant)
    et un job `:app:testDebugUnitTest` (aujourd'hui zéro test).
11. **Réparer `build-libbox.ps1`** : `git -C $SrcRoot checkout $Version`, pas de
    chemin `C:\Users\HP`, `-FullAbi` par défaut.
12. **Réécrire le README** ou le réduire à un renvoi vers ce nœud.

## Propositions pour les nœuds partagés (à intégrer par l'orchestrateur)

- `30-clients/brand-build.md` est marqué `verified` mais faux sur cinq points :
  4 thèmes au lieu de 8 (`:34`), « la CI avertit si le keystore manque » alors
  qu'elle échoue (`:57-58` vs `android-brand.yml:210`), route de callback « pas
  encore côté API » (`:61-62`), `brand.properties` présenté comme portant le
  thème (`:25`), et rien sur le trigger `push` ni sur R2.
- D102 (« zipalign + apksigner, keystore sur le VPS ») reste exact mais muet sur
  l'absence d'épinglage de certificat et sur l'écrasement du chemin versionné.
- D138 (« APK universel ») est exact pour l'AAR, mais `build-libbox.ps1` par
  défaut et `minSdk 26` contredisent l'intention.
- Nouveau nœud proposé : `30-clients/apk-distribution-trust` — qui peut publier,
  avec quelle clé, et ce qui empêche une régression.

## Questions ouvertes

1. Le trigger `push` doit-il disparaître (tout par l'API, D117) ou rester comme
   raccourci d'urgence avec un Environment à approbation ?
2. `minSdk` : 31 assumé, ou repli cryptographique pour 26–30 (bibliothèque
   d'accord de clés) ?
3. Le schéma de deep link devient-il `<applicationId>.pay` (rupture pour les
   apps déjà installées) ou reste-t-il global en acceptant l'ambiguïté ?
4. Les 8 marques doivent-elles porter le contact de leur communauté plutôt que
   `support@henshins.online` ? Qui le saisit (dashboard) et quand ?
5. `aura-test.json` : supprimer, ou le repointer vers l'API de test et lui donner
   son propre `appId` ?
6. Accepte-t-on 242 Mo par téléchargement, ou passe-t-on à des APK par ABI avec
   détection sur la page de téléchargement (D144) ?
