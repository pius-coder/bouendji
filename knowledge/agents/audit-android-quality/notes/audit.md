# Audit #10 — Tests, observabilité, diagnostic, robustesse (Android)

Statut : **partiel / interrompu** (2026-10-29). Lecture seule, aucun build, aucun test
exécuté, aucune modification de code. Les affirmations ci-dessous sont **relues**
(fichier:ligne), pas exécutées ; ce qui dépend du runtime est marqué
`(non vérifié)`. Instantané volatil : `BrandTokens.kt` et `brand.properties`
étaient en cours de réécriture par l'injection de marque pendant la lecture
(Saitrix 1.1.3 / Bouendji 1.0.0-beta.2 selon l'instant) ; les citations de ce
fichier sont à revérifier après build.

## 1. Verdict provisoire

- **Zéro test.** Aucun `app/src/test/**`, aucun `app/src/androidTest/**` ; seuls
  `main/java` et `main/res` existent. Les dépendances de test sont pourtant
  déclarées (`build.gradle.kts:119-121`) et ne servent à rien. Le harnais est
  presque gratuit : `SingBoxConfig`, `DeviceProof`, `Hkdf`, `TunnelStateBus` et
  le calcul de prix sont déjà du JVM pur.
- **Aucun filet de crash ni de diagnostic.** Pas de
  `Thread.setDefaultUncaughtExceptionHandler`, pas de Crashlytics/Sentry, pas de
  lecture d'`ApplicationExitInfo`, pas de journal exportable. Un crash natif de
  libbox, une mort du processus ou un `OutOfMemoryError` ne laissent **aucune
  trace** côté utilisateur ni côté support. `START_NOT_STICKY` assume le
  non-redémarrage (`VpnTunnelService.kt:55-57`), mais rien ne le dit à
  l'utilisateur.
- **La télémétrie n'est ni fiable ni conforme à D64.** File en mémoire
  seulement, réinjection de **tous** les échecs y compris 4xx
  (`UsageMeter.kt:64`), flush synchrone dans la boucle de trafic
  (`VpnTunnelService.kt:433`), flush de sortie détaché et non attendu
  (`:383-384`), 3 écritures chiffrées par seconde (`UsageMeter.kt:22-33`).
- **Trois messages affichés sont faux dans des cas fréquents** : « Paiement
  vérifié avec succès ! » sur simple deep link (`AppController.kt:247-253`),
  « Liste des serveurs mise à jour. » même quand rien n'a été tiré
  (`:564` + `:357-364`), et « Cette version n'est pas encore reliée au service »
  pour toute `IllegalStateException`, y compris une clé Keystore absente
  (`:203-207`, `DeviceKeys.kt:121-148`).
- **Deux défauts de fiabilité majeurs** : (a) récursion non bornée du
  rafraîchissement de session quand le refresh token est refusé
  (`ApiClient.kt:395-419` + `:253-259`) ; (b) l'inscription hors ligne ne se
  déclenche **jamais** sur une panne réseau réelle, et se déclenche au contraire
  sur une exception interne (`AppController.kt:432`).
- Le support WhatsApp promis par D116 n'a **rien** pour travailler : pas de code
  d'appareil affiché, pas de dernier échec, pas de journal, pas de version
  fiable (deux sources), et un `mailto:` qui échoue silencieusement.

## 2. Tests — état et harnais proposé

### 2.1 Constat

| Preuve | Résultat |
|---|---|
| `find apps/android/app/src -maxdepth 2 -type d` | `main`, `main/java`, `main/res` — ni `test`, ni `androidTest` |
| `git log --all -- app/src/test app/src/androidTest` | aucun commit |
| `build.gradle.kts:119-121` | `testImplementation(junit)`, `androidTestImplementation(androidx.junit, espresso)` déclarés |
| `build.gradle.kts` | aucun bloc `testOptions` (pas de `returnDefaultValues`, pas de Robolectric) |
| `libs.versions.toml:21-23` | junit 4.13.2, androidx.test 1.2.1, espresso 3.6.1 — jamais résolus ni utilisés |

**Nombre de tests Android : 0.**

### 2.2 Ce qui est testable en JVM pur, sans Android

| Cible | Fichier | Bloquant actuel |
|---|---|---|
| `SingBoxConfig.parseVless`, `usableConfigs`, `build`, `nodesOf` | `config/SingBoxConfig.kt` | aucun (JDK + kotlinx.serialization ; `exposeClashApi=false` évite le port aléatoire) |
| `DeviceProof.canonical` / `sha256Hex` | `net/DeviceAuth.kt:42-63` | aucun (le fichier importe `android.util.Base64`, mais ces deux fonctions n'y touchent pas) |
| `Hkdf.sha256` | `crypto/Hkdf.kt` | aucun (JCE) ; `internal` visible depuis `src/test` |
| `TunnelStateBus.publish/since` | `vpn/TunnelEngine.kt:182-204` | aucun, mais singleton sans `reset()` : remettre à `STOPPED` en `@Before` |
| `CustomTermsDto.priceXaf` | `net/ApiClient.kt:728-731` | aucun, mais noyé dans `ApiClient.kt` ; à extraire |
| `isDoualaNight` | `ui/screens/Servers.kt:61-71` | aucun, mais dans un fichier Compose ; à extraire |
| `ConfigVault` | `offline/OfflineBundle.kt:31-54` | dépend de `SecureStore` **concret** → extraire `KeyValueStore` |
| `UsageMeter` | `vpn/UsageMeter.kt:16` | `SecureStore` concret + `LocalDate.now()` codé en dur (`:52,:68`) → injecter store + horloge |
| `.bvpn` (conteneur, signature, refus) | `offline/OfflineBundle.kt` | `android.util.Base64` (`:4,:331-336`), `Build.VERSION` (`:241,:257`), `DeviceKeys` concret → isoler `OfflineContainer` + `EnvelopeOpener` |
| `friendly()` | `ui/AppController.kt:203-207` | méthode d'instance sans dépendance → extraire `ui/ErrorText.kt` |
| `RawResponse.toException()` | `net/ApiClient.kt:855-886` | classe privée → extraire `ApiErrorParser.parse(status, body)` |
| machine à états du service | `vpn/VpnTunnelService.kt` | **non testable en JVM** (`VpnService`) → instrumenté seulement |

### 2.3 Harnais minimal, fichier par fichier

Dépendances à ajouter : `testImplementation(libs.junit)` (déjà là) +
`kotlinx-coroutines-test:1.8.1` (même version que `coroutines`) +
`testImplementation(libs.kotlin.test)` si l'on veut `assertEquals`. Rien d'autre.
Pas de Robolectric pour la première vague : il masquerait les dépendances Android
au lieu de les retirer.

1. `app/src/test/java/cm/bouendji/vpn/config/SingBoxConfigTest.kt`
   - `parseVless` : ws+tls nominal ; `security=reality` refusé ; `type=tcp`
     refusé ; port 0/65536 refusé ; IPv6 `[::1]` ; `path` sans `/` → `/` ;
     `host` → sni + Host ; query `+`/`%` ; URI vide/garbage → null.
   - `usableConfigs` : expiration passée exclue ; `startsAt` futur **attendu
     exclu** (test rouge qui prouve le défaut `:391-397`).
   - `build` : `exposeClashApi=false` → JSON sans `experimental` ; 1 nœud → pas
     d'`auto` ; 2 nœuds → selector+urltest ; `droppedExpired` ; plan null si tout
     est invalide ; `nodesOf` rend le tier `paid-gcp` pour `xui-*` (`:387`).
2. `.../config/VlessUriTest.kt` — table de cas pure, sans JSON.
3. `.../vpn/TunnelStateBusTest.kt` — CONNECTED pose `since`, STOPPED le remet à
   zéro, `detail` et `state` restent cohérents ; `reset` par `publish(STOPPED)`.
4. `.../crypto/HkdfTest.kt` — vecteur RFC 5869 n°1 (SHA-256), sel vide, longueur
   0 refusée.
5. `.../crypto/DeviceProofTest.kt` — chaîne canonique exacte, `sha256("")`,
   chemin avec `?` refusé, nonce 22 caractères.
6. `.../offline/ConfigVaultTest.kt` — `FakeKeyValueStore` (Map en mémoire) :
   save/read/clear, JSON tronqué → null (et entrée non supprimée), bundle vide →
   `isEmpty`.
7. `.../vpn/UsageMeterTest.kt` — faux store + horloge injectée :
   delta sur compteurs qui repartent à zéro (`:26-27`), plafond 200/20
   (`:87-88`), **4xx = lot abandonné** (test rouge aujourd'hui, `:64`), jour qui
   change, `seconds` plafonné.
8. `.../offline/OfflineContainerTest.kt` — parse du conteneur, message signé,
   signature Ed25519 JDK (paire générée dans le test), `notAfter` dépassé,
   bundleId déjà consommé, JSON tronqué, 0 octet.
9. `.../ui/ErrorTextTest.kt` — table des messages : `ApiException(409,
   DEVICE_LIMIT_REACHED)` doit dire « retire un appareil », `IllegalStateException`
   de Keystore ne doit **pas** dire « version non reliée ».
10. `.../net/ApiErrorParserTest.kt` — enveloppe valide, corps HTML, 500 sans
    corps, `details` multi-clés.
11. `app/src/androidTest/.../ServiceLifecycleTest.kt` (device requis) — start sans
    consentement → STOPPED + détail ; stop → moteur arrêté ; notification
    annulable. À écrire seulement après l'action « Déconnecter » dans la
    notification.
12. `.../ImportIntentTest.kt` — `ACTION_VIEW` d'un `.bvpn` de 0 octet, d'un
    fichier de 300 Ko, d'un MIME inconnu.

Refactors minimal pour rendre 6-8 possibles (aucun n'est fait ici) :
`KeyValueStore` (SecureStore l'implémente), `clock: () -> LocalDate` dans
`UsageMeter`, `OfflineContainer` pur + `EnvelopeOpener`, `ErrorText` extrait,
`ApiErrorParser` extrait, `TunnelStateBus.reset()` `@VisibleForTesting`.

## 3. Crash, mort du processus, exceptions de coroutine

- **Aucun handler global** : recherche `UncaughtException|Crashlytics|Sentry|
  ApplicationExitInfo` sur `apps/android/app/src/main/java` → 0 résultat.
  `VpnApplication.onCreate` ne fait que construire le conteneur
  (`VpnApplication.kt:27-30`).
- **Service** : `CoroutineScope(SupervisorJob() + Dispatchers.Default)`
  (`VpnTunnelService.kt:134`) sans `CoroutineExceptionHandler`. Un `launch` qui
  lève va au handler du thread → **mort du processus**. Chemin concret :
  `meter.flush(container.api, …)` (`:433`) évalue `container.api`, dont le
  `lazy` appelle `BrandTokens.requireValid()` (`VpnApplication.kt:58-59`,
  `BrandTokens.kt:111-126`) ; sur un build de marque invalide, l'exception part
  de la boucle de trafic. Cas de bord, mais réel.
- **Moteur natif** : `onFatal` coupe le tunnel et publie le motif
  (`VpnTunnelService.kt:321-325`), mais un SIGSEGV de libbox tue le processus
  avant tout callback. Rien n'est écrit. Le motif natif est publié **non
  scrubbé** (`:324` ; `scrub` n'est appliqué qu'au log debug `:322`).
- **Service tué** : `START_NOT_STICKY` (`:55-57`, `:169-219`) ; `onDestroy`
  n'arrête pas le moteur et ne publie rien (`:229-236`) ; `TunnelStateBus` vit
  dans le processus, donc l'état disparaît. À la réouverture : STOPPED, aucune
  explication, aucune reconnexion sauf `autoConnect` au `boot()`
  (`AppController.kt:264-268`). Le « VPN permanent » d'Android peut relancer le
  service (**non vérifié** sur le Pixel 8).
- **Aucun rapport** : les seuls logs sont 6 appels `Log.*`
  (`LibboxTunnelEngine.kt:143,145,178,194`, `VpnTunnelService.kt:322,376`),
  dont 2 conditionnés à `BuildConfig.DEBUG`. En release, l'utilisateur ne peut
  pas les lire et le support ne peut pas les obtenir.
- **Recommandation concrète** : lire `ActivityManager.getHistoricalProcessExitReasons()`
  (API 30+) au démarrage et conserver `reason/timestamp/description` ; écrire un
  « dernier échec » persistant avant/après chaque connexion ; handler global qui
  enregistre puis délègue au handler par défaut (ne pas masquer le crash).

## 4. Diagnostic utilisateur (support WhatsApp)

| Besoin | Présent ? | Preuve |
|---|---|---|
| Version de l'app | partiel | `Profile.kt:205` et `Intro.kt:92` affichent `BrandTokens.appVersion` ; `versionName` de `brand.properties` est une **seconde** source (`brand.properties:5`) |
| Code d'appareil | **non** | `DeviceAuth.deviceId()` existe (`DeviceAuth.kt:138`) mais n'est jamais affiché ni copié |
| Dernier échec | **non** | aucun stockage ; `error` est un état Compose volatile (`AppController.kt:148`) |
| État du moteur | partiel | `engineAvailable` calculé **une fois** (`MainActivity.kt:45-53`), jamais réévalué ; `TunnelEngine.name` (`LibboxTunnelEngine.kt:54`) jamais affiché |
| Journal exportable | **non** | aucun fichier de log, aucun partage de diagnostic |
| Contact | `mailto:` | `BrandTokens.kt:80`, `MainActivity.kt:123` ; `ActivityNotFoundException` avalée (`:125-131`) → bouton mort si aucun client mail |
| Groupe WhatsApp | vide | `BrandTokens.kt:98` ; rangées masquées (`Profile.kt:412`, `Auth.kt:141`) |

Manque pour un support efficace : un écran « Diagnostic » (version + versionCode
+ package + Android/ABI + modèle + `deviceId` court + numéro de compte masqué +
dernier état/motif + dernier code d'erreur HTTP + révision du bundle + nombre de
nœuds + moteur disponible), un bouton « Copier » et un `wa.me` prérempli (D116),
sans jamais inclure d'URI VLESS. Aujourd'hui le support ne peut que demander
« réinstalle ».

## 5. Télémétrie — événements, fréquence, reprise, contrat

- **Ce qui part** : `POST /v1/me/telemetry` avec `activeConfigId`, `usage`
  (total du jour) et ≤ 20 `reports {configId, ok, latencyMs}`
  (`ApiClient.kt:279-282` ; `UsageMeter.kt:43-46`).
- **Fréquence** : un flush toutes les 60 s de tunnel (`VpnTunnelService.kt:89`,
  `:433`) + un flush au démontage (`:383-384`). Le flush est **inline** dans la
  boucle de trafic : un appel réseau peut bloquer jusqu'à 30 s
  (`ApiClient.kt:88-94`), pendant lesquelles `ServerBus.traffic` et
  `meter.onTotals` ne sont plus alimentés → débit figé et usage non compté.
- **Coût local** : `onTotals` fait ~4 lectures + 3 écritures **chiffrées**
  (`SharedPreferences.commit()` + Keystore) par seconde (`UsageMeter.kt:22-33`,
  `SecureStore.kt:84-98`). Batterie et usure d'écriture, sur un service
  permanent.
- **Reprise** : file **en mémoire** seulement, 200 max, 20 par lot
  (`UsageMeter.kt:87-88`) ; perdue à la mort du processus. Tout échec est
  réinjecté, **y compris 400/401/403** (`:64`) : un lot poison (configId
  supprimé → 400, `apps/api/src/routes/telemetry.ts:157-160`) est rejoué toutes
  les 60 s et bloque les rapports plus récents. **Contredit D64** (4xx ≠ 408/429
  = lot abandonné). Aucun backoff, aucun usage de `Retry-After`
  (`ApiClient.kt:827` capturé, jamais lu).
- **Doublons** : pas d'identifiant de rapport ni d'horodatage client
  (`ConfigReportDto`, `ApiClient.kt:578`) ; après un timeout ambigu, le même
  échec est réinséré et inséré deux fois (`telemetry.ts:162-170`). Deux échecs
  « consécutifs » peuvent donc venir d'un seul. Le chemin témoin D50
  (`health.ts:31-52`, 2 échecs + 1 succès ailleurs) peut être declenché par un
  seul appareil → bascule/`down` prématuré.
- **Contrat serveur vérifié** : schéma strict, `usage` en `GREATEST`
  (`telemetry.ts:137-146`), `day` borné ±1 jour (`:84-98`), 20 rapports max
  (`:34`), 202 (`:188`), nœud inconnu = 400 (`:157-160`), `device_id` vient de
  la session (`:120`), `reported_at = now()` (`:165-169`).
- **Le client peut-il mentir ?** Oui : `usage` jusqu'à `2^53`, `ok` arbitraire.
  Conséquence : statistiques gonflées (faible), et surtout un client authentifié
  peut fabriquer des échecs et faire sortir un nœud du pool via le témoin
  différentiel (disponibilité, pas argent). Pas de limite par route ; seule la
  limite globale 300/min/IP (`apps/api/src/app.ts:156-164`).

## 6. Messages d'erreur — vérité, action, technicité

| Chaîne | Où | Vérité | Actionnable | Verdict |
|---|---|---|---|---|
| « Cette version n'est pas encore reliée au service. » | `AppController.kt:205` | **faux** pour `IllegalStateException` Keystore (`DeviceKeys.kt:121-148`) ou marque invalide (`BrandTokens.kt:111-126`) | non | à remplacer par un message par cause |
| « Connexion au service impossible. Vérifie ton réseau et réessaie. » | `AppController.kt:206` | vrai pour IOException, faux pour `IllegalArgumentException` d'URL | oui | acceptable, mais avale la cause |
| `details.values.firstOrNull()` (ex. « Configuration inconnue : <uuid> ») | `AppController.kt:204` | vrai | non | technique, expose un identifiant d'infra |
| « Serveur injoignable. » | `ApiClient.kt:469` | vrai | oui | ok |
| « Réponse inattendue du serveur (HTTP 500). » | `ApiClient.kt:882` | vrai | non | technique |
| « Réponse illisible (bundle). » | `ApiClient.kt:499` | vrai | non | jamais vue pour le bundle (avalée, §7) |
| « Email ou mot de passe incorrect. » | `apps/api/src/lib/errors.ts:22`, affiché via `friendly` | **faux** : la connexion se fait par téléphone (`AppController.kt:421`, `Auth.kt:121-130`) | oui | à corriger côté serveur ou app |
| « Paiement vérifié avec succès ! » | `AppController.kt:250` | **faux** : déclenché par n'importe quel deep link `cm.bouendji.vpn://pay`, `orderId` ignoré (`MainActivity.kt:100-106`, `:247-253`) | non | supprimer ; vérifier la commande avant de parler |
| « Liste des serveurs mise à jour. » | `AppController.kt:564` | **faux** si `fetchBundle` a échoué (avalé `:357-364`) ou 304 | non | afficher le résultat réel |
| « Aucun serveur utilisable : toutes les configurations ont expiré. » | `VpnTunnelService.kt:293` | **faux** si l'URI est illisible (même chemin) | non | distinguer « expiré » / « illisible » |
| « Aucune configuration enregistrée : connectez-vous ou importez un bundle. » | `VpnTunnelService.kt:278` | **faux** si le coffre existe mais est corrompu (`OfflineBundle.kt:45-48`) | partiel | dire « illisible » |
| « Moteur sing-box indisponible dans cette version. » | `VpnTunnelService.kt:272` | vrai si JNI absent, mais ne dit pas l'ABI | non | ajouter ABI/architecture |
| « Moteur VPN indisponible sur cet appareil. » | `Home.kt:136` | vrai, mais verdict figé au lancement | non | ajouter « copier le diagnostic » |
| « Aucun serveur / Nouvel essai automatique » + « Touche pour annuler » | `Home.kt:123`, `:177` | vrai, mais le geste **annule** la reprise | contradictoire | clarifier |
| « Réception de ta configuration… » | `Home.kt:141` | peut être faux (bundle vide, hors ligne) | non | état réel |
| « Compte créé en local. Synchronisation automatique dès connexion. » | `AppController.kt:455` | **faux** : ne se déclenche que sur exception non-API (§7) | non | corriger la condition |
| Messages d'import `.bvpn` | `OfflineBundle.kt:190-283` | vrais, précis | oui | **les meilleurs messages de l'app** |

`friendly()` ne mappe ni `DEVICE_LIMIT_REACHED` (`ApiClient.kt:834`, jamais lu),
ni `DEVICE_REVOKED`, ni `SUBSCRIPTION_REQUIRED` (seul `refreshAll` les filtre,
`AppController.kt:308`), ni `RATE_LIMITED`/`retryAfter`. `isNetwork`,
`needsEnrolment` et `deviceLimitReached` sont morts.

## 7. Robustesse — un chemin par cas

| Cas | Chemin réel | Verdict |
|---|---|---|
| Bundle malformé (JSON/enveloppe) | `fetchBundle` lève (`ApiClient.kt:367-382`) mais `refreshPrivate` fait `runCatching{…}.getOrNull()` (`AppController.kt:358`) | **silencieux** : aucun message, aucun log, ancienne liste conservée ; l'erreur d'enveloppe est en plus classée `DEVICE_PROOF_INVALID` (`:368`) |
| URI VLESS inconnue | `usableConfigs` la jette sans trace (`SingBoxConfig.kt:391-397`) ; si toutes le sont, `build` rend null → `vault.clear()` (`VpnTunnelService.kt:291-295`) | **destructeur** + message faux |
| Bundle vide (retrait serveur) | ignoré (`AppController.kt:360`), alors que le client dit « on le propage tel quel » (`ApiClient.kt:384-385`) | retrait jamais propagé ; contredit D61/D67 |
| Expiration d'un nœud | `vault.clear()` (`VpnTunnelService.kt:296-301`, `:609`) | **viole D67** : un nœud expiré efface tout |
| Port Clash occupé | `pickLoopbackPort` ferme puis réutilise (`SingBoxConfig.kt:452-461`) ; échec de bind → échec de `start` → message brut du moteur (`VpnTunnelService.kt:332`), aucun autre port essayé | chemin défini mais non actionnable ; comportement sing-box **non vérifié** |
| Keystore invalidé | `SecureStore.getBytes` supprime l'entrée et rend null (`SecureStore.kt:104-128`) : session, coffre, cache, horodatage, liste des `.bvpn` consommés disparaissent **sans événement** | perte silencieuse ; l'UI affiche AUTH ou « aucun serveur » ; une clé `vpn-sign` invalidée donne « version non reliée » |
| JSON tronqué (coffre) | `ConfigVault.read` → null (`OfflineBundle.kt:45-48`), l'entrée reste | message « aucune configuration enregistrée », faux |
| `.bvpn` de 0 octet | `ImportInbox` rend 0 octet → `import` → « Fichier vide. » (`OfflineBundle.kt:190`) | **bon** |
| `.bvpn` > 256 Ko | borne à `MAX_BYTES+1` (`ImportInbox.kt:24-35`) → « trop volumineux » (`OfflineBundle.kt:191`) | **bon** |
| Résolveur de fichier en échec | `offer` rend `false` (`ImportInbox.kt:36`), appelant ignoré | **aucun retour utilisateur** |
| Fichier lu sur le thread principal | `MainActivity.receiveFile` (`MainActivity.kt:39,:109-121`) → `openInputStream` + boucle de 256 Ko | **ANR possible** sur un `content://` cloud |
| Service tué / processus mort | aucune trace, aucun redémarrage, file de télémétrie perdue | **non défini côté utilisateur** |
| Crash natif libbox | mort du processus, TUN fermé par le noyau | **aucun rapport** |
| Refresh token refusé | `authed` réappelle `refresh()` qui réappelle `authed`… (`ApiClient.kt:395-419`, `:253-259`) tant que le token reste stocké ; le serveur répond 401 `UNAUTHENTICATED` (`apps/api/src/routes/auth.ts:655`) | **boucle non bornée** (requêtes en série jusqu'à OOM) — défaut le plus grave trouvé |
| Inscription hors ligne | condition `ex is IOException || ex !is ApiException` (`AppController.kt:432`) ; une panne réseau est une `ApiException(0, NETWORK)` (`ApiClient.kt:466-470`) → branche **jamais** prise ; une `IllegalStateException` interne la prend | D137 inopérant et faux compte local en cas de build cassé |
| Logout puis redémarrage hors ligne | `logout` ne purge ni `cache.me` ni `cache.quota` (`AppController.kt:465-479`) ; `boot` restaure `me` et `signedIn = … || me != null` (`:220-241`) | l'utilisateur semble encore connecté, données personnelles en cache |
| Rotation d'écran | `AppController` en `remember` (`Shell.kt:112-136`), pas de `ViewModel`/`saveable` pour `screen` | état et formulaire perdus (hors axe, mais robustesse) |

## 8. Dette de code

**Fichiers > 500 lignes** (comptage `wc -l` sur l'arbre) :
`net/ApiClient.kt` 912 · `ui/AppController.kt` 713 ·
`vpn/VpnTunnelService.kt` 696 · `ui/kit/Kit.kt` 692 ·
`ui/screens/Plans.kt` 587.

**Code mort / périmé**
- `UnavailableTunnelEngine` (`TunnelEngine.kt:113-131`) et
  `LibboxTunnelEnginePlaceholder` (`:153-172`) : plus instanciés nulle part
  (`VpnApplication.kt:75` utilise `LibboxTunnelEngine`). Le commentaire
  `TunnelEngine.kt:52-57` (« aucune dépendance libbox ») est faux depuis
  `build.gradle.kts:104-117`.
- `SyncLoaderPill` privé jamais appelé (`Shell.kt:324`).
- `initialHasConfiguration` paramètre jamais lu (`Shell.kt:98`) ; calculé dans
  `MainActivity.kt:46-51,65`.
- `ServerBus.rates` écrit (`ServerBus.kt:53-54,82-84`) jamais lu : le débit est
  recalculé dans `Home.kt:100-112`.
- `strings.xml` : **toutes** les chaînes sont inutilisées (0 `R.string.` dans le
  code) ; certaines mentent (« Le moteur de tunnel n'est pas intégré »,
  `strings.xml:57`).
- API sans appelant : `activateCurrentDevice` (`ApiClient.kt:319-320`),
  `isOperational` (`VpnApplication.kt:81-82`), `OfflineBundle.peek`
  (`OfflineBundle.kt:374`), `SecureStore.wipe/removeByPrefix`
  (`SecureStore.kt:75,143`), `DeviceKeys.deleteAll` (`DeviceKeys.kt:108`),
  `DeviceAuth.forgetDevice` (`DeviceAuth.kt:145`), `forgetBundleEtag`
  (`ApiClient.kt:391`), `retryAfterSeconds`/`isNetwork`/`needsEnrolment`/
  `deviceLimitReached` (`ApiClient.kt:827-835`).
- `AuthForm.email` conservé mais jamais envoyé (`AppController.kt:69`,
  `:412-419`) ; l'écran Commande affiche « E-mail : — » (`Plans.kt:509`).
- `ServerBus.setServers(plan.nodes)` après connexion perd `startsAt` et
  `endpointTier` : `build()` ne les passe pas (`SingBoxConfig.kt:188-190`) alors
  que `PlanNode` les porte (`:143-144`) ; le filtre Serveurs s'appuie dessus
  (`Servers.kt:85-100`).
- Commentaire « D136 / D140 » alors que D141 a remplacé le filtrage exclusif
  (`Servers.kt:91`).
- `README.md:135-139,178-183` dit libbox non intégré et tests absents : périmé
  (le `.aar` de 86 Mo est présent, `LibboxTunnelEngine` est branché).

**Duplications**
- « en marche » : `VpnTunnelService.tunnelRunning()`/`live()` (`:241-245`),
  `Home.RUNNING` (`Home.kt:82`), `MainActivity` `when` (`:67-74`),
  `Servers.running` (`Servers.kt:83`).
- Débit : `VpnTunnelService.kt:416-436` (publié puis ignoré) et
  `Home.kt:100-112` (réellement affiché).
- Version : `BrandTokens.appVersion` (`BrandTokens.kt:102`) et
  `brand.properties:versionName` (`:5`).

## 9. Plan de correction proposé (ordre)

1. **P0** — borner `authed`/`refresh` : un seul refresh par appel, jamais depuis
   `refresh()` (drapeau `refreshing` ou paramètre `allowRefresh=false`) ; test
   JVM avec un faux transport 401.
2. **P1** — file de télémétrie : 4xx = abandon (sauf 408/429), backoff, flush
   hors de la boucle de trafic, persistance du lot, horodatage/seq pour déduire.
3. **P1** — diagnostic : `ApplicationExitInfo` + dernier échec persistant +
   écran « Copier le diagnostic » + code d'appareil court ; bouton
   « Déconnecter » dans la notification.
4. **P1** — arrêter de détruire le coffre : `plan == null` distingue
   expiré/illisible ; ne jamais `clear()` sur expiration (D67) ; propager un
   bundle vide.
5. **P1** — messages : retirer le faux « paiement vérifié », le faux « liste mise
   à jour », corriger `friendly` et la condition d'inscription hors ligne.
6. **P2** — Keystore : journaliser l'invalidation, prévenir l'utilisateur,
   proposer un ré-enrôlement ; ne pas conserver le mot de passe en attente.
7. **P2** — tests JVM (12 fichiers ci-dessus) avant toute refonte.

## 10. Vérifié / incertain / non examiné

**Vérifié par lecture** : absence totale de tests ; absence de handler de crash
et de rapport ; chemins de la télémétrie et contrat serveur ; messages listés ;
récursion de refresh ; condition d'inscription hors ligne ; pertes de coffre ;
code mort et tailles ; textes inutilisés ; lecture de fichier sur le thread
principal.

**Incertain (non exécuté)** : comportement réel de sing-box sur un port Clash
occupé ; sémantique de `/connections` (`uploadTotal`) ; invalidation Keystore
sur appareil réel ; redémarrage par « VPN permanent » ; Ed25519 sur API 31 ;
R8/release ; rendu Compose ; latence réelle des appels Keystore.

**Non examiné faute de temps** : `ui/kit/Kit.kt` en entier, `ThemeArt.kt`,
`Billet.kt`, `Flags.kt`, `Icons.kt`, `Guilloche.kt` ; `Plans.kt:211-298` ;
`LibboxPlatform.kt:1-99` ; `apps/api` hors `telemetry.ts`, `errors.ts`,
`health.ts`, `auth.ts:640-730`, `app.ts:140-190` ; aucune exécution, aucun lint,
aucun build ; `libbox.aar` non inspecté.

## 11. Questions ouvertes

1. Faut-il un crash reporter tiers (Play/hors Play) ou seulement
   `ApplicationExitInfo` + fichier local exportable ?
2. Le code d'appareil support doit-il être le `deviceId` UUID complet, un
   préfixe, ou un code court dérivé côté serveur ?
3. La télémétrie doit-elle être persistée en clair (diagnostic) ou chiffrée
   (vie privée) ? Le compromis n'est pas tranché.
4. `startsAt` est-il encore utile après D140 (nuit = règle d'accès, mêmes
   serveurs) ou faut-il le retirer du bundle ?
5. Accepte-t-on un `minSdk 31` pour supprimer les chemins « Android 12 requis »
   et simplifier les tests ?
