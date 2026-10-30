# Audit réseau Android — client API, preuve d'appareil, bundle

Statut : **relu, non exécuté**. Aucun build, aucun appel réseau, aucun test sur
appareil dans cette passe. Toute affirmation cite un fichier et une ligne ; ce
qui dépend d'un comportement de bibliothèque ou d'un serveur non démarré est
marqué `(non vérifié)`.

Racine Android : `apps/android/app/src/main/java/cm/bouendji/vpn/` (abrégé
`vpn/`). Racine API : `apps/api/src/`.

## 1. Verdict

Le client est **correct sur la cryptographie de la preuve** : la chaîne signée
est celle du serveur, le corps est sérialisé une seule fois et le texte envoyé
est exactement le texte haché, la clé privée ne sort pas du Keystore, et
l'enveloppe du bundle est liée à l'appareil et à la révision. Ce n'est pas là
que le client casse.

Il casse sur **la mécanique de session et de cache** :

1. **La route de refresh est elle-même protégée par le mécanisme de refresh.**
   Un jeton de rafraîchissement mort déclenche une récursion non bornée de
   `refresh()` ; le jeton n'est jamais effacé et l'utilisateur ne voit pas
   l'écran de connexion. Le limiteur global (300 req/min par IP,
   `app.ts:156-164`) transforme la boucle en rafale de 429 qui peut aussi
   pénaliser les autres clients derrière le même NAT mobile.
2. **L'ETag survit à la destruction du coffre local.** Le service vide le
   coffre à l'expiration du nœud le plus tôt (`VpnTunnelService.kt:598-613`,
   `SingBoxConfig.kt:316-317`), alors que le serveur considère le bundle valide
   jusqu'au nœud le plus tardif (`bundle.ts:120-134`). Le prochain tirage
   envoie l'ETag de l'ancien bundle, reçoit `304`, et l'app reste sans liste
   jusqu'à ce qu'un refresh de session efface l'ETag.
3. **Un budget mur de 4 s enveloppe cinq appels séquentiels** (au minimum),
   alors que le client s'autorise 10/20/30 s par appel. Sur 2G/3G camerounais,
   le bundle est structurellement le dernier appel et n'arrive pas ; l'erreur
   affichée est « Connexion au service impossible », alors que c'est l'app qui
   a coupé.
4. **Aucun épinglage TLS et aucun bundle signé côté en ligne.** Le `digest` de
   l'enveloppe est calculé par l'émetteur, ce n'est pas une signature : un
   intermédiaire qui termine TLS peut sceller sa propre liste pour la clé
   publique de l'appareil. Le fichier de secours `.bvpn`, lui, est signé
   Ed25519 avec une clé épinglée (`OfflineBundle.kt:223-238`) — le mécanisme
   existe et n'est pas réutilisé pour le bundle en ligne.
5. **Un bundle vide n'est pas appliqué, mais son ETag est enregistré**
   (`AppController.kt:360`, `ApiClient.kt:386-388`). Un abonné épuisé garde
   donc des nœuds que le serveur a retirés, et les réessaie en boucle.

## 2. Les cinq défauts les plus graves

| # | Sévérité | Emplacement | Conséquence |
|---|---|---|---|
| 1 | **P0** | `vpn/net/ApiClient.kt:405-415` (intercepteur), `:253-259` (`refresh`), `:417` | Jeton de refresh mort → récursion `refresh()` non bornée. Rafale de 401 puis 429 (limiteur global 300/min/IP, `apps/api/src/app.ts:156-164`), jeton jamais effacé, aucun retour à l'écran de connexion. Les autres clients derrière le même NAT peuvent être throttlés. |
| 2 | **P1** | `vpn/vpn/VpnTunnelService.kt:598-613`, `vpn/config/SingBoxConfig.kt:316-317`, `vpn/net/ApiClient.kt:341-348`, `apps/api/src/routes/bundle.ts:438` | Le nœud le plus tôt expiré vide tout le coffre ; le serveur sert encore le bundle (expiration = nœud le plus tardif) et répond `304`. Liste vide jusqu'au prochain refresh de session, malgré un bouton « Actualiser ». |
| 3 | **P1** | `vpn/ui/AppController.kt:282`, `:285-302`, `:341-368`, `vpn/net/ApiClient.kt:88-94` | 4 s pour `plans + me + devices + subscription + bundle` (plus 0-16 confirmations hors-ligne et 0-2 appels d'inscription différée). Sur 2G, impossible ; timeout présenté comme « Connexion au service impossible ». Les requêtes OkHttp continuent jusqu'à 30 s (annulation coopérative seulement). |
| 4 | **P1** | `vpn/net/ApiClient.kt:88-94` (aucun `CertificatePinner`), `:785-791` (aucune signature du bundle), `vpn/crypto/DeviceKeys.kt:180-186`, `:238-245` | Un intermédiaire avec une CA acceptée par l'appareil peut lire les jetons et forger une liste de nœuds ; le `digest` n'authentifie rien puisqu'il est recalculé par l'attaquant. |
| 5 | **P1** | `vpn/ui/AppController.kt:357-364`, `vpn/net/ApiClient.kt:386-388`, `apps/api/src/routes/bundle.ts:385-389` | Bundle `configCount = 0` (quota épuisé, retrait) : le client ignore le contenu mais avance l'ETag. La liste morte reste affichée et sélectionnable ; l'utilisateur croit à une panne alors que le serveur a coupé. |

## 3. Réponses aux questions

### Q1 — Timeouts réels, retry, 2G/3G, budget de 4 s

**Timeouts** (`vpn/net/ApiClient.kt:88-94`) :

| Paramètre | Valeur | Portée |
|---|---:|---|
| `connectTimeout` | 10 s | TCP + poignée TLS (OkHttp) |
| `readTimeout` | 20 s | attente d'un octet |
| `writeTimeout` | 20 s | envoi du corps |
| `callTimeout` | 30 s | **appel complet**, redirections et retries inclus |

**Retry** :
- `retryOnConnectionFailure(true)` (`:93`) : OkHttp peut retenter une panne de
  connexion ou changer de route. Ce n'est **pas** un retry sur statut HTTP.
- Aucun retry applicatif sur 5xx, aucun backoff, aucun usage de `retryAfter`
  (le champ est parsé `:876` mais jamais lu ; `RATE_LIMITED` n'est même pas une
  constante de `ApiCodes`, `:839-853`).
- La télémétrie fait exception et retente à chaque tick de 60 s
  (`vpn/vpn/UsageMeter.kt:60-65`), mais sans backoff et sans distinguer 4xx de
  5xx. Un lot refusé en 5xx est donc rejoué indéfiniment ; un lot refusé en 400
  aussi. D64 prévoit l'inverse (4xx = lot abandonné, 5xx/réseau = reprise avec
  backoff) : le client ne l'implémente pas.
- `reportConsumedBundles` (`vpn/ui/AppController.kt:694-698`) ne retente que
  les exceptions ; comme `markOfflineConsumed` ne décode pas la réponse
  (`ApiClient.kt:327-329`), un 404/500 est considéré comme un succès et l'ID
  est retiré de la file.

**Ce que voit l'utilisateur sur 2G/3G** :
- Au lancement, `boot()` laisse le splash 1,1 s puis affiche l'accueil ; le
  rafraîchissement tourne en tâche de fond.
- À 4 s, `withTimeoutOrNull` annule le bloc ; `runCatching` avale
  `CancellationException` (`AppController.kt:283`), `friendly` tombe dans la
  branche générique (`:206`) et affiche **« Connexion au service impossible.
  Vérifie ton réseau et réessaie. »** alors que le réseau fonctionne mais est
  lent. Un vrai `SocketTimeoutException` donne « Serveur injoignable. »
  (`ApiClient.kt:468-469`), ce qui blâme le serveur. Les deux messages sont
  faux dans des cas distincts.
- L'écran Serveurs peut afficher « La liste des serveurs arrive avec ta
  configuration » (`ui/screens/Servers.kt:183`) et le bouton d'accueil relance
  `refreshAll()` (`ui/screens/Home.kt:141`). Chaque tap ajoute une salve de
  requêtes : aucun verrou `busy` n'empêche deux `refreshAll` simultanés
  (`AppController.kt:277-318`).
- Les appels OkHttp ne sont pas annulés par l'annulation de la coroutine :
  `execute()` est bloquant (`ApiClient.kt:466-470`), pas de `Call.cancel()` ni
  de `invokeOnCancellation`. Le travail continue jusqu'à 30 s et consomme des
  données mobiles après que l'UI a affiché l'échec.

**4 s contre 5 appels séquentiels** : non, pas compatible.
`refreshAll` exécute au minimum `plans` (`:287`), puis `me` (`:344`),
`devices` (`:349`), `subscription` (`:350`) et `bundle` (`:358`). S'y ajoutent
`syncPendingRegistration` avant (`:285`, 0-2 appels) et
`reportConsumedBundles` (`:343`, 0-16 appels), puis éventuellement
`order?refresh=1` et un second `refreshPrivate` (`:301-302`). Le budget est
donc de **5 à 23 allers-retours HTTP dans 4 s**. Sur 2G, un RTT utile de
500-1000 ms et une poignée TLS de 1-3 s suffisent à dépasser le budget avant
le troisième appel ; le bundle, dernier, n'est presque jamais atteint. Sur 3G,
5 appels peuvent tenir si le cache de connexion est chaud, mais le moindre
ralentissement serveur fait basculer. Le problème n'est pas la lenteur du
réseau : c'est que **le budget de 4 s est plus court que le `connectTimeout`
de 10 s** du client.

### Q2 — 401 concurrents et refresh

**Réponse : oui, deux appels concurrents peuvent déclencher deux refresh, et
le contrat serveur ne rend pas l'opération sûre.**

Côté client :
- `authed` (`ApiClient.kt:395-419`) ne prend aucun verrou, ne fait pas de
  single-flight et ne met pas en file les 401. Chaque appel qui reçoit
  `401 UNAUTHENTICATED` appelle `refresh()` (`:405-415`).
- Les points d'entrée concurrents sont réels : `refreshAll` au boot
  (`AppController.kt:256`), retour de paiement (`:249`), bouton d'accueil
  (`Home.kt:141`), `refreshServers` (`AppController.kt:559-568`),
  `checkOrder` (`:512`), `loadStats` (`:375-378`), `loadReferral` (`:380`), et
  la télémétrie du service (`VpnTunnelService.kt:433`) qui utilise le même
  client.
- `saveSession` (`ApiClient.kt:109-114`) est un dernier-écrivain-gagne : deux
  réponses de refresh peuvent s'écraser, et la plus lente peut persister un
  jeton déjà remplacé.

Côté serveur (`apps/api/src/routes/auth.ts:648-729`) :
- La rotation est conditionnelle (`UPDATE ... WHERE revoked_at IS NULL`,
  `:688-712`) : un seul gagnant.
- Le perdant qui présente un jeton déjà tourné dans les 5 minutes
  (`REFRESH_REPLAY_WINDOW_MS`, `:155`) passe par `resumeOnCurrentSession`
  (`:268-309`), qui **remplace le hash du refresh de la session courante**
  (`:287-294`). Le jeton que le gagnant venait de recevoir devient donc
  invalide à son tour.
- Si deux reprises se disputent la même session courante, l'une des deux
  `UPDATE` conditionnelles échoue, `resumeOnCurrentSession` renvoie `null`, et
  l'appelant exécute `revokeChain` (`:671-676`) : **toute la chaîne de
  sessions est révoquée**. C'est le cas « course perdue » documenté par le
  serveur lui-même.
- Un jeton qui ne correspond plus à aucune ligne (hash écrasé par une reprise)
  ne passe pas par la branche « déjà tourné » : `SELECT ... WHERE
  refresh_hash = $1` renvoie `null` et le serveur répond 401
  `UNAUTHENTICATED` (`:652-655`). C'est précisément l'entrée de la récursion
  du défaut #1.

Conclusion : la rotation serveur est bien conçue pour **un** client séquentiel ;
le client Android ne garantit pas cette séquentialité. En pratique, deux
`refreshAll` simultanés peuvent produire une rotation supplémentaire, un jeton
persisté périmé, ou une révocation de chaîne. Le défaut #1 transforme ensuite
ce 401 en boucle.

### Q3 — Preuve d'appareil : ce qui est signé exactement

Chaîne canonique, identique des deux côtés
(`vpn/net/DeviceAuth.kt:42-53`, `apps/api/src/lib/crypto.ts:114-123`) :

```
METHOD (majuscules)
PATH (sans query, commence par /)
sha256_hex(corps brut UTF-8)      // "" pour un GET/DELETE sans corps
TIMESTAMP (epoch millisecondes)
NONCE (16-80 caractères)
```

joints par `\n`, puis ECDSA-SHA256 sur la représentation UTF-8, signature DER
en base64 (`vpn/crypto/DeviceKeys.kt:136-148`). En-têtes :
`X-Device-Timestamp`, `X-Device-Nonce`, `X-Device-Signature`
(`DeviceAuth.kt:74-84`) et `X-Device-Token` (`:88`) — ce dernier **n'est pas
signé** : le serveur retrouve l'appareil par le jeton, puis vérifie la
signature avec la clé publique de cet appareil (`lib/auth.ts:191-233`).

**Ce qui n'est pas signé** : la query string (retirée des deux côtés,
`ApiClient.kt:431-432`, `auth.ts:216`), l'hôte, le schéma, le port, `X-App-Id`,
`Authorization`, `If-None-Match`, le jeton d'appareil. C'est conforme au
contrat, mais cela signifie que la preuve ne lie pas la requête à une
destination : seule la TLS empêche un rejeu vers un autre hôte.

**Le texte signé est-il celui envoyé ?** Oui, dans le chemin normal :
- `sendSigned` choisit `payload` **avant** de calculer la preuve, puis passe
  ce même `payload` à `send` (`ApiClient.kt:430-438`) ; le corps est converti
  une seule fois en octets (`:454`).
- `enroll` sérialise une fois, signe `body`, puis envoie ce `body`
  (`ApiClient.kt:165-188`).
- Le serveur hache `req.rawBody`, capturé sur le buffer brut avant
  `JSON.parse` (`apps/api/src/app.ts:65-78`). Il ne re-sérialise jamais.
- Les POST sans corps envoient littéralement `{}` et signent `{}`
  (`ApiClient.kt:73-79, 430`) ; les GET/DELETE signent la chaîne vide.

**Une divergence de sérialisation peut-elle casser la signature ?** Pas par
l'ordre des champs ni par les `null` : le client et le serveur ne comparent
jamais deux sérialisations, ils comparent les **octets**. Les seuls risques
réels sont :
- un intermédiaire qui réécrit le corps (proxy, compression, normalisation) ;
- un retry OkHttp qui rejoue le **même** nonce après que le serveur l'a
  consommé : `retryOnConnectionFailure(true)` peut le faire, et le serveur
  répond alors « Requête rejouée » (`lib/auth.ts:226-231`) ;
- une horloge hors tolérance ±120 s (`auth.ts:207-210`), corrigée par
  `serverTime` et l'en-tête `Date` (`DeviceAuth.kt:158-166`,
  `ApiClient.kt:484-492`), mais sans retry automatique sur
  `DEVICE_PROOF_INVALID` ;
- l'enrôlement, qui utilise le nonce du challenge (`DeviceAuth.kt:177-191`,
  `routes/devices.ts:147-163`) : un challenge consommé ne se rejoue pas.

**Cas non couvert** : `DeviceEnvelope.open` ne vérifie pas
`envelope.version` (`ApiClient.kt:773-781`, `DeviceKeys.kt:198-247`) ; le
client suppose la v1. Une v2 côté serveur échouerait avec « tag invalide » au
lieu d'un message de version.

### Q4 — ETag : login, logout, changement d'appareil, bundle vide, 304

Le client stocke un seul ETag dans `SecureStore` (`ApiClient.kt:86`,
`:341`, `:386-388`). Le serveur le calcule sur
`(deviceId, revision, id@expiry de chaque nœud servi, fingerprint)`
(`routes/bundle.ts:102-110`), et ne répond `304` que si l'ETag correspond **et**
que l'expiration calculée est encore future (`:438-441`).

| Événement | ETag | Coffre | Verdict |
|---|---|---|---|
| Inscription / connexion | effacé par `saveSession` (`ApiClient.kt:109-114`) | inchangé | sûr : prochain tirage complet. |
| Refresh silencieux (401) | effacé aussi par `saveSession` | inchangé | coûteux : le bundle complet est retéléchargé à chaque refresh (~15 min, `ACCESS_TOKEN_TTL` défaut 900 s, `config.ts:63`). |
| Logout | effacé par `clearSession` (`:118-123`), **sauf** si `hasSession()` est déjà faux : `logout()` sort avant (`:261-265`) | vidé par `AppController.kt:471` | dans le cas nominal, propre ; dans le cas « session déjà morte », ETag conservé + coffre vidé = verrou possible jusqu'au prochain login. |
| Changement d'appareil | pas effacé par `enroll`, mais le serveur calcule l'ETag avec le nouveau `deviceId` | coffre non vidé | pas de faux 304 (ETag différent), mais le coffre de l'ancien appareil peut rester et être présenté au nouveau. |
| Bundle vide (`configCount=0`) | **enregistré** (`ApiClient.kt:386-388`) | **non écrit** (`AppController.kt:360`) | le client ignore le retrait mais avance sa position : liste morte conservée ; le serveur ne peut plus la corriger par un 304 (un bundle vide naît expiré, `bundle.ts:116-118`, donc il renvoie 200 à chaque fois — téléchargement inutile et retrait jamais appliqué). |
| `304` | conservé | non touché | si le coffre a été vidé entre-temps, `304` = « tu as déjà la bonne version » alors que le client n'a plus rien. |

**Le verrou de révision morte, en détail** :
1. Le bundle contient deux nœuds, A (expire à 12 h) et B (expire à 20 h).
   Le serveur calcule `expiresAt = max(A, B)` (`bundle.ts:120-134`).
2. Le client calcule `plan.expiresAtMs = min(A, B)` (`SingBoxConfig.kt:316-317`)
   et programme `scheduleExpiry` sur ce minimum (`VpnTunnelService.kt:349`).
3. À 12 h, `scheduleExpiry` fait `container.vault.clear()` et publie
   « Abonnement expiré » (`:598-613`).
4. L'utilisateur rouvre l'app ; `refreshPrivate` appelle `me` (200, jeton
   encore valide), puis `fetchBundle` avec l'ETag du bundle A+B.
5. Le serveur calcule le même ETag (mêmes nœuds, même révision) et
   `expectedExpiresAt = 20 h > now` → **304**.
6. `BundleFetch.NotModified` → `Unit` (`AppController.kt:362`) ; le coffre est
   vide, la liste est vide, et le toast dit « Liste des serveurs mise à jour ».
   `forgetBundleEtag()` existe (`ApiClient.kt:391`) mais **n'est appelé nulle
   part** (grep : une seule occurrence, sa définition).

Le verrou se débloque au prochain refresh de session (le 401 efface l'ETag),
donc au plus tard après l'expiration du jeton d'accès (15 min par défaut), ou
au prochain login. Ce n'est pas permanent, mais c'est exactement « la liste
n'arrive pas » pendant que le bouton Actualiser prétend le contraire. Le même
verrou apparaît si `ConfigVault.save` échoue (`OfflineBundle.kt:42-43` renvoie
un booléen) : `AppController.kt:360` ignore le retour et l'ETag a déjà été
écrit.

### Q5 — Gestion d'erreurs : codes, messages, timeout, 5xx

**Il n'y a pas de table code → message.** `friendly` (`AppController.kt:203-207`)
est un passe-plat :
- `ApiException` → `details.values.firstOrNull() ?: message` (message brut du
  serveur, souvent en français mais non maîtrisé par l'app) ;
- `IllegalStateException` → « Cette version n'est pas encore reliée au
  service. » ;
- tout le reste → « Connexion au service impossible… ».

Les seuls traitements par code sont :
- `refreshAll` : 401 → écran AUTH ; `DEVICE_REVOKED` et
  `SUBSCRIPTION_REQUIRED` → **aucun message** (`:304-310`) ;
- `authenticate` : branche « inscription hors ligne » (`:431-458`).

Conséquences :
- **Timeout** : oui, un timeout auto-imposé produit « Connexion au service
  impossible » (message trompeur) ; un timeout socket produit « Serveur
  injoignable » (blâme le serveur).
- **5xx** : jamais retenté ; le message est soit le JSON du serveur, soit
  « Réponse inattendue du serveur (HTTP 5xx) » (`ApiClient.kt:865-885`).
- **429** : `retryAfterSeconds` est parsé mais jamais utilisé ; l'utilisateur
  lit le message et doit retaper. `RATE_LIMITED` n'est pas dans `ApiCodes`.
- **Télémétrie** : `telemetry()` ne décode pas la réponse (`ApiClient.kt:279-282`),
  donc un 5xx ne lève pas ; `UsageMeter.flush` considère le lot comme envoyé
  et le jette (`UsageMeter.kt:60-65`). Contraire à D64.
- **`markOfflineConsumed` / `revokeDevice`** : même schéma, un 4xx/5xx est un
  « succès » (`ApiClient.kt:322-329`), donc la file de consommation se vide et
  l'UI dit « Appareil retiré » même si le serveur a refusé.
- **Inscription hors ligne** : la branche prévue par D137 est **inatteignable**.
  `ApiClient.send` enveloppe toute `IOException` dans
  `ApiException(0, NETWORK, …)` (`:466-470`) ; `authenticate` teste
  `ex is java.io.IOException || ex !is ApiException` (`AppController.kt:432`),
  toujours faux pour une panne réseau. L'utilisateur voit une erreur au lieu
  du compte local et de la synchronisation différée.
- **Session expirée depuis un écran secondaire** : `loadStats`
  (`:375-378`) et `loadReferral` (`:380-384`) affichent l'erreur mais ne
  renvoient pas vers AUTH ; seul `refreshAll` le fait.

### Q6 — Sécurité transport

- **Aucun `CertificatePinner`, aucun `X509TrustManager`, aucun `SSLContext`,
  aucun `HostnameVerifier`, aucune `ConnectionSpec` personnalisée.** Le client
  utilise le trust manager et le vérificateur d'hôte par défaut d'OkHttp
  (`ApiClient.kt:88-94` ; grep sur tout `vpn/` : zéro occurrence).
- **Nuance targetSdk 35** : sans `networkSecurityConfig`, les CA ajoutées par
  l'utilisateur ne sont pas acceptées par défaut (contrairement à ce que dit
  une formulation courante). Le risque restant est une CA du magasin système,
  une MDM, un appareil rooté, ou un APK modifié. L'absence d'épinglage reste
  une faiblesse de conception, pas une faille immédiate sur un appareil propre.
- **Conséquence réelle** : un intermédiaire qui termine TLS voit
  `Authorization: Bearer …`, `X-Device-Token`, le corps de `/auth/refresh`
  (jeton de refresh) et les réponses de login/inscription. Il peut aussi
  fabriquer une enveloppe de bundle pour la clé publique d'accord de
  l'appareil : le `digest` est fourni par l'émetteur et vérifié après
  déchiffrement (`DeviceKeys.kt:238-245`), ce n'est pas une signature du
  serveur. Le bundle en ligne n'a **aucune** signature Ed25519, alors que le
  `.bvpn` en a une (`OfflineBundle.kt:223-238`).
- **Clair interdit** : `usesCleartextTraffic="false"` (`AndroidManifest.xml:38`)
  et `normalizeBaseUrl` exige `https` (`ApiClient.kt:503-513`). Bien.
- **Proxy** : aucun `proxy(...)`, aucun `ProxySelector`, aucun
  `ConnectivityManager.defaultProxy` dans le code. OkHttp utilise le
  sélecteur JVM par défaut ; le lien avec le proxy Wi-Fi Android n'est pas
  vérifié sur appareil. À noter : le client ne protège pas ses sockets avec
  `VpnService.protect`, donc lorsque le tunnel est monté, les appels API de
  l'app passent **dans** le tunnel (voir P2-15).
- **Logs** : aucun log dans `net/`. `ApiClient` ne journalise ni en-têtes ni
  corps. Les seuls journaux sont `BuildConfig.DEBUG` dans
  `VpnTunnelService.kt:322,376` (via `scrub`, qui est une fonction identité,
  `:693`) et `LibboxTunnelEngine.kt:143-194` (messages du moteur). Aucun
  jeton ni URI de configuration n'y apparaît par construction, mais `scrub`
  ne protège rien : à corriger avant de s'appuyer dessus.
- **Redirections** : OkHttp suit les 302 par défaut (aucun
  `followRedirects(false)`). Le rideau D43 renvoie un navigateur vers le site
  leurre ; si `X-App-Id`/UA manquent, le client suivrait la redirection et
  tenterait de décoder du HTML. Ce n'est pas une faille (le rideau n'est pas
  une sécurité) mais le message d'erreur serait « Réponse illisible ».

### Q7 — Fuites de données : ce qui part réellement

| Donnée | Quand | Où / remarque |
|---|---|---|
| `X-App-Id` (UUID de marque) | toutes les requêtes | en-tête ; pas un secret. |
| `X-Device-Token` | requêtes signées (pas `challenge`/`plans`) | équivalent d'un bearer d'appareil ; le serveur le hache (`auth.ts:191-197`) ; stocké chiffré (`SecureStore.kt:84-98`). |
| `Authorization: Bearer` (JWT) | requêtes authentifiées | claims `sub`, `did`, `cid`, `sid`, `typ`, `exp` (`lib/auth.ts:83-104`) ; TTL 900 s par défaut. |
| `refreshToken` | corps de login/register/refresh (serveur → client) et corps de `/auth/refresh` | TTL 45 jours par défaut (`config.ts:64`) ; jamais dans l'URL ; stocké chiffré. |
| `X-Device-Timestamp/Nonce/Signature` | requêtes signées | nonce aléatoire 16 octets, usage unique côté serveur. |
| `installationId` | challenge + enroll | UUID v4 local, pas un identifiant matériel (`DeviceAuth.kt:126-132`). |
| `deviceName` | enroll | `Build.MODEL` (ex. « Pixel 8 »), `androidVersion` (entier SDK), `appVersion` ; `integrityToken` est toujours `null` (aucun appelant ne le fournit). |
| Télémétrie | toutes les 60 s pendant le tunnel (`VpnTunnelService.kt:433`) | jour local, octets montants/descendants, secondes, `activeConfigId`, et jusqu'à 20 rapports `{configId, ok, latencyMs}` (`ApiClient.kt:575-581`). Pas de contenu de trafic, mais révèle quels nœuds sont utilisés et quand. |
| Bundle | à chaque tirage | uniquement `revision`, `issuedAt`, `expiresAt`, `configCount` et l'enveloppe scellée (`ApiClient.kt:785-791`) ; **aucune URI, aucun UUID, aucun hôte en clair**. |
| Commande | création / poll | `planId`, `planRevision`, `nightWindow`, `custom` ; la réponse porte le lien de checkout, le montant et le statut. |

**Pas d'IMEI, pas d'`ANDROID_ID`, pas de `Build.SERIAL`, pas de MAC, pas de
contacts.** Vérifié par grep sur tout `vpn/` : les seules occurrences sont le
commentaire de `DeviceKeys.kt:34` et aucun appel `getImei`/`Settings.Secure`.

**Fuites locales (hors réseau)** :
- le bundle en clair n'existe qu'en mémoire : `plain` est effacé
  (`ApiClient.kt:381`), mais `plain.toString()` crée une `String` immuable qui
  reste jusqu'au GC, et `BundlePayload.uri` reste une `String` ; un dump
  mémoire/root peut la lire. C'est le modèle assumé (D4), pas un défaut de
  transport.
- `KEY_CACHED_ME` (email, téléphone, droits) **survit au logout** :
  `logout()` ne le supprime pas (`AppController.kt:465-479`) et `boot()` le
  recharge (`:220-243`) ; `signedIn` devient vrai si `me != null`, même sans
  jeton. En mode avion après un logout, l'app peut donc afficher un compte
  « connecté » avec des données périmées.
- Le coffre n'est pas lié au compte : après une mort de session (401) puis une
  connexion avec un **autre** compte, `saveSession` ne le vide pas ; si le
  tirage du bundle échoue, l'ancien compte garde ses nœuds affichés et
  utilisables. Le logout explicite vide le coffre, la mort de session non.
- `KEY_PENDING_REGISTRATION` contient le formulaire complet, **mot de passe
  compris** (`AppController.kt:450`), et n'est pas effacé au logout ; il est
  rejoué au prochain `refreshAll` (`:320-339`), même après une déconnexion.
- `DeepLinkBus` ne transporte qu'un `orderId` (pas un secret), mais le lien
  `cm.bouendji.vpn://pay…` est un intent implicite : n'importe quelle app peut
  le recevoir ou le déclencher, et le schéma n'est pas propre à la marque
  (`AndroidManifest.xml:65`, `MainActivity.kt:102`).

## 4. Défauts détaillés (P0 → P3)

### P0

**N1 — Récursion de refresh non bornée.**
`authed` (`ApiClient.kt:405-415`) traite un 401 de `/auth/refresh` comme
n'importe quel 401 : `refreshToken() != null` → `refresh()` → `authed()` →
401 → `refresh()`… `refresh()` (`:253-259`) n'a aucune garde et le jeton
n'est jamais effacé dans cette branche (le `clearSession` de `:411` n'est
atteint que si `refresh()` **lève**, ce qui n'arrive pas tant que la
récursion tourne). Le limiteur global de l'API (300/min/IP,
`apps/api/src/app.ts:156-164`) finit par renvoyer 429 ; la récursion se
déroule alors d'un coup et l'utilisateur voit « Trop de requêtes » sans être
renvoyé vers l'écran de connexion. En développement sans limiteur, la boucle
peut durer jusqu'à une erreur réseau ou une saturation mémoire. **Preuve par
lecture** ; non exécuté.

### P1

**N2 — Verrou ETag / coffre vidé.** Voir Q4. Le nœud le plus tôt expiré
(`SingBoxConfig.kt:316-317`) vide le coffre (`VpnTunnelService.kt:598-613`)
alors que le serveur garde le bundle jusqu'au nœud le plus tardif
(`bundle.ts:120-134`) et répond 304. `forgetBundleEtag` (`ApiClient.kt:391`)
est du code mort. Contredit D67 (le client doit rafraîchir, pas vider) et
D49 (le bundle ne doit pas mourir avec le maillon le plus faible).

**N3 — Budget de 4 s / annulation.** Voir Q1. `AppController.kt:282` contre
`ApiClient.kt:88-94` ; `runCatching` avale `CancellationException`
(`AppController.kt:283`) ; `execute()` bloquant non annulable
(`ApiClient.kt:467`). Le message d'erreur est trompeur (`:206`).

**N4 — Pas d'épinglage + bundle non signé.** Voir Q6. `ApiClient.kt:88-94` ;
`BundleResponse` (`:785-791`) ne porte aucune signature ; `digest` n'est pas
une signature (`DeviceKeys.kt:180-186, 238-245`). Le `.bvpn` signé
(`OfflineBundle.kt:223-238`) prouve que le mécanisme est déjà là.

**N5 — Bundle vide ignoré mais ETag avancé.** Voir Q4. `AppController.kt:360`
contre `ApiClient.kt:386-388` ; le serveur documente pourtant le bundle vide
comme un retrait légitime (`routes/bundle.ts:385-389`).

**N6 — Refresh concurrent sans single-flight.** Voir Q2. `ApiClient.kt:395-419`
et `:109-114` ; côté serveur `auth.ts:668-712` et `:287-294`. Peut révoquer la
chaîne entière ou persister un jeton mort.

**N7 — Inscription hors ligne inatteignable.** `ApiClient.kt:466-470` enveloppe
`IOException` ; `AppController.kt:432` teste `java.io.IOException` ou
`!is ApiException`. D137 ne fonctionne pas ; en panne réseau, l'utilisateur ne
peut pas créer son compte local.

**N8 — Retour de paiement perdu au démarrage à froid, et toast mensonger.**
`MainActivity.onCreate` émet avant `setContent` (`MainActivity.kt:38`) ;
`DeepLinkBus` a `replay = 0` et `extraBufferCapacity = 1`
(`DeepLinkBus.kt:7`), donc un `tryEmit` sans abonné est perdu. Le collecteur
n'existe qu'après la composition (`Shell.kt:112-136`, `AppController.kt:247-253`).
De plus le collecteur **ignore `orderId`** et affiche « Paiement vérifié avec
succès ! » sans vérifier la commande ; `refreshAll(refreshOrder = true)` ne
rafraîchit `order` que s'il est déjà en mémoire (`AppController.kt:301`), ce
qui n'est pas le cas après un kill. Un lien forgé
`cm.bouendji.vpn://pay?orderId=…` suffit à déclencher ce toast.

**N9 — Enrôlement non récupérable après réponse perdue.** `enroll`
(`ApiClient.kt:133-193`) crée un challenge puis l'appareil ; si la réponse se
perd, le prochain essai renvoie 409 « Cette installation est déjà enrôlée »
(`routes/devices.ts:166-174`). Le client ne traite pas ce 409, et
`DeviceAuth.forgetDevice()` / `DeviceKeys.deleteAll()` ne sont appelés nulle
part (grep). Seul un effacement des données de l'app débloque l'installation
(et consomme une nouvelle place d'appareil).

### P2

**N10 — Table d'erreurs absente et 5xx/429 non retentés.** Voir Q5.
`AppController.kt:203-207`, `ApiClient.kt:839-853, 865-885` ;
`retryAfterSeconds` jamais lu. `DEVICE_REVOKED` et `SUBSCRIPTION_REQUIRED`
sont silencieusement avalés dans `refreshAll` (`:304-310`), donc un appareil
révoqué laisse l'UI dans un état « connecté » sans explication.

**N11 — Télémétrie et confirmations hors-ligne qui perdent des erreurs.**
`telemetry()` et `markOfflineConsumed()` ne décodent pas la réponse
(`ApiClient.kt:279-282, 327-329`) ; `UsageMeter` jette un lot sur 5xx
(`UsageMeter.kt:60-65`) ; `reportConsumedBundles` retire un ID sur 4xx/5xx
(`AppController.kt:694-698`). D64 n'est pas respecté.

**N12 — `me` en cache survit au logout.** Voir Q7. `AppController.kt:220-243,
465-479`. `signedIn = hasSession() || me != null` ; un cache suffit à afficher
un compte après déconnexion, et `error` reste seul garde-fou hors ligne.

**N13 — Coffre non lié au compte.** Une mort de session (401) ne vide pas le
coffre ; un autre compte qui se connecte ensuite peut voir et utiliser les
nœuds du précédent si le tirage du bundle échoue. `AppController.kt:357-367,
465-479`. À rapprocher de N2 : le coffre survit à tout sauf au logout explicite.

**N14 — Mot de passe en attente après logout.** `KEY_PENDING_REGISTRATION`
(`AppController.kt:450`) n'est pas effacé au logout et `syncPendingRegistration`
(`:320-339`) le rejoue au boot suivant. Un compte peut être recréé après une
déconnexion, et le mot de passe reste chiffré sur l'appareil.

**N15 — Les appels API passent dans le tunnel.** Aucun `VpnService.protect`
sur les sockets OkHttp ; seul le moteur protège les siens
(`VpnTunnelService.kt:320`, `LibboxPlatform.kt:237-238`). La route sing-box
finit en `proxy` (`SingBoxConfig.kt:282-302`), sans règle `direct` pour l'API.
Quand le tunnel est cassé, le rafraîchissement et la télémétrie sont cassés
avec lui ; quand il fonctionne, ils consomment le quota. Comportement voulu ou
non : à trancher `(non vérifié sur appareil)`.

**N16 — Lien profond non propre à la marque.** `AndroidManifest.xml:65` et
`MainActivity.kt:102` codent `cm.bouendji.vpn` pour tous les APK ; la page de
retour du serveur code le même schéma et un paquet `cm.bouendji.nevpn`
(`payments.ts:80-81`), qui n'est pas le paquet de toutes les marques. Avec
deux marques installées, le retour peut ouvrir la mauvaise app (ou échouer sur
le bouton « Ouvrir l'application »).

**N17 — Version d'enveloppe non vérifiée.** `SealedEnvelopeDto.version`
(`ApiClient.kt:773-781`) est ignoré par `DeviceEnvelope.open`. Une évolution
de format échouera en « tag invalide » au lieu d'un message actionnable.

**N18 — Redirections suivies.** OkHttp suit les 302 par défaut ; le rideau D43
peut renvoyer du HTML, décodé comme une erreur « Réponse illisible ».

**N19 — `connectTimeout` de 10 s sur 2G.** Un TCP+TLS qui dépasse 10 s est
traité comme « serveur injoignable » ; aucun timeout adaptatif, aucun retry
applicatif.

### P3

- **N20** : `saveSession` efface l'ETag à chaque refresh (`:109-114`), ce qui
  annule l'économie du 304 toutes les ~15 min ; `forgetBundleEtag` est mort.
- **N21** : `logout()` sort avant `clearSession` si `hasSession()` est faux
  (`:261-265`), laissant l'ETag alors que le coffre est vidé.
- **N22** : la correction d'horloge dépend de l'en-tête `Date` et du
  `serverTime` ; sans retry sur `DEVICE_PROOF_INVALID`, un écart transitoire
  ne guérit qu'au prochain appel.
- **N23** : `scrub` est une identité (`VpnTunnelService.kt:693`) ; les logs
  debug du moteur ne sont pas garantis sans URI.
- **N24** : `Build.MODEL` comme nom d'appareil est un fingerprint grossier,
  pas un identifiant unique ; acceptable, à documenter.
- **N25** : `ApiException` peut afficher un message serveur brut (anglais,
  technique) ; aucune localisation.
- **N26** : aucune vérification que `dto.revision == payload.revision` ni que
  les `expiresAt` du DTO et du clair concordent ; le client fait confiance au
  DTO pour la KDF et au clair pour l'expiration.
- **N27** : zéro test Android (`apps/android/**/src/test/**` absent) ; aucun
  test de la preuve, du refresh concurrent, de l'ETag ou de `DeepLinkBus`.

## 5. Recommandations, par ordre

1. **Session** : un `Mutex` unique autour de `refresh()` ; ne jamais passer par
   l'intercepteur 401 pour la route `/auth/refresh` ; en cas d'échec,
   `clearSession()` + événement « auth requise » ; un seul essai, puis
   backoff borné pour réseau/5xx uniquement.
2. **ETag** : stocker `(etag, deviceId, revision, hash du bundle)` ensemble ;
   sur `304`, vérifier que le coffre local contient bien ce bundle, sinon
   `forgetBundleEtag()` + un nouveau tirage sans `If-None-Match`. Écrire
   l'ETag **après** un `vault.save` réussi, et le supprimer dans le même
   mouvement que `vault.clear()`.
3. **Expiration** : ne plus vider le coffre sur `min(expiry)` ; filtrer les
   nœuds expirés dans `usableConfigs` et déclencher un rafraîchissement sur
   `nextConfigExpiryMs` (D67). Aligner la sémantique client sur le `max` du
   serveur ou supprimer l'expiration globale du plan.
4. **Budget réseau** : supprimer le `withTimeoutOrNull(4_000)` global ;
   `me` puis `bundle` en priorité, `devices`/`subscription` en parallèle,
   budget par appel et budget total explicitement plus large que le
   `connectTimeout`. Annuler le `Call` OkHttp à l'annulation de la coroutine.
5. **Intégrité** : épingler le SPKI de l'API et signer le bundle en ligne
   (Ed25519, clé déjà utilisée pour `.bvpn`), ou au minimum signer
   `revision|expiresAt|configs` côté serveur. Vérifier `envelope.version`.
6. **Bundle vide** : appliquer un retrait quand `configCount = 0` et que
   l'abonnement est actif (quota épuisé), sauf si le coffre vient d'un `.bvpn`
   hors-ligne ; conserver une révision/tombstone pour ne pas ressusciter une
   liste retirée.
7. **Deep link** : `replay = 1` ou persistance de l'`orderId` dans
   `SecureStore`, traitement après `boot()`, vérification du statut avant le
   toast, schéma propre à la marque (`<applicationId>.pay`) et paquet correct
   dans la page de retour.
8. **Enrôlement** : sur 409 « installation déjà enrôlée », proposer une
   réémission de jeton après preuve avec les clés existantes (ou un reset
   d'identité explicite) ; appeler `forgetDevice`/`deleteAll` sur révocation.
9. **Erreurs** : une fonction unique code → message + action
   (`NETWORK`, `TIMEOUT`, `RATE_LIMITED`, `DEVICE_REVOKED`,
   `SUBSCRIPTION_REQUIRED`, `INTERNAL`), avec `retryAfter` et un bouton
   « Réessayer » ; ne plus avaler `DEVICE_REVOKED` sans issue.
10. **Hors ligne** : tester `ApiException.isNetwork` (ou exposer
    `NetworkException`) dans `authenticate` pour réactiver D137 ; vider
    `KEY_CACHED_ME` et `KEY_PENDING_REGISTRATION` au logout.
11. **Compte** : lier le coffre à `userId` ; le vider quand l'utilisateur de
    la session change.
12. **Contrôle** : protéger les sockets API avec `VpnService.protect` ou les
    lier au réseau sous-jacent, pour que le contrôle ne dépende pas du tunnel.
13. **Tests** : vecteurs dorés `DeviceProof.canonical` contre le serveur,
    test de refresh concurrent avec faux serveur, machine à états
    ETag/304/coffre, test de rejeu `DeepLinkBus`, test de la table d'erreurs.

## 6. Vérifié / incertain

**Vérifié par lecture (fichier + ligne)** :
- timeouts et retry : `ApiClient.kt:88-94` ; absence de `Call.cancel()` :
  `:466-470` ; `withTimeoutOrNull(4_000)` : `AppController.kt:282`.
- chaîne signée : `DeviceAuth.kt:42-53` contre `apps/api/src/lib/crypto.ts:114-123` ;
  corps brut : `apps/api/src/app.ts:65-78` et `lib/auth.ts:213-224`.
- refresh rotatif et reprise : `apps/api/src/routes/auth.ts:648-729`,
  `:155`, `:268-309`.
- ETag/304 : `apps/api/src/routes/bundle.ts:102-110, 438-461` ;
  `ApiClient.kt:341-348, 386-388`.
- expiration client : `SingBoxConfig.kt:316-317` ; vidage :
  `VpnTunnelService.kt:598-613`.
- absence de pinning/proxy/trust manager : grep sur tout `vpn/` ; manifeste
  `AndroidManifest.xml:38`.
- bundle non signé : `ApiClient.kt:785-791` ; `DeviceKeys.kt:238-245`.
- DeepLinkBus : `DeepLinkBus.kt:6-12`, `MainActivity.kt:38,100-105`,
  `AppController.kt:247-253`, `Shell.kt:112-136`.
- aucune identité matérielle : grep `ANDROID_ID|getImei|getDeviceId|
  Settings.Secure|Build.SERIAL` ; seule occurrence : commentaire
  `DeviceKeys.kt:34`.
- routeurs serveur : `me.ts`, `account.ts`, `telemetry.ts`, `offline.ts`,
  `catalog.ts`, `orders.ts` existent ; aucun chemin Android inventé.

**Non vérifié / à rejouer** :
- Aucun `assembleDebug`, aucun `tsc`, aucun appel HTTP réel, aucun test sur
  le Pixel 8. Tout est **relu**.
- `libbox.aar` absent : le comportement du moteur et l'écriture éventuelle
  d'un fichier de configuration en clair dans `filesDir/sing-box` ne sont pas
  observés. `(non vérifié)`
- Le comportement exact d'OkHttp sur Android pour le proxy Wi-Fi et pour
  `retryOnConnectionFailure` sur un POST signé n'est pas exécuté.
  `(non vérifié)`
- La sémantique de `MutableSharedFlow` sans abonné (émission perdue) est celle
  de la bibliothèque, pas un test de l'app. `(non vérifié à l'exécution)`
- La révocation de chaîne en cas de course de refresh est lue dans le code
  serveur, pas reproduite avec deux clients réels. `(non vérifié)`
- La valeur réelle de `ACCESS_TOKEN_TTL` / `REFRESH_TOKEN_TTL_DAYS` en
  production peut différer des défauts (900 s / 45 j) ; `config.ts:63-64`.
- Le paquet `cm.bouendji.nevpn` de `payments.ts:81` est peut-être un vestige
  ou une coquille ; à confirmer avec le propriétaire du serveur.
- Android 12+ Keystore (génération ECDH, signature) n'est pas exercé ici ;
  la compatibilité API 26-30 est explicitement refusée par le code
  (`DeviceKeys.kt:41-46`, `ApiClient.kt:139-148`).

## 7. Fichiers lus / écrits

**Lus (extraits ou entier)** : `vpn/net/ApiClient.kt`, `vpn/net/DeviceAuth.kt`,
`vpn/net/DeepLinkBus.kt`, `vpn/crypto/DeviceKeys.kt`, `vpn/VpnApplication.kt`,
`vpn/ui/AppController.kt` (sections réseau/session/bundle), `vpn/ui/Shell.kt`,
`vpn/vpn/VpnTunnelService.kt` (expiration/télémétrie), `vpn/config/SingBoxConfig.kt`
(expiration/route), `vpn/offline/OfflineBundle.kt` (coffre/signature),
`vpn/vpn/UsageMeter.kt`, `vpn/MainActivity.kt`, `AndroidManifest.xml` ;
côté API : `lib/auth.ts`, `lib/crypto.ts`, `lib/errors.ts`, `lib/attempts.ts`,
`app.ts`, `routes/auth.ts`, `routes/bundle.ts`, `routes/devices.ts`,
`routes/payments.ts`, `routes/me.ts` (grep), `config.ts`.

**Écrits** : ce fichier ; `knowledge/agents/audit-android-net/log.md` via
`node knowledge/cli.mjs agent log` (3 étapes + clôture). Aucun fichier de code
modifié.

## 8. Questions ouvertes

1. Quel budget total est acceptable sur 2G : 10 s, 20 s, ou un budget par
   phase avec reprise en arrière-plan ?
2. Le bundle en ligne doit-il être signé (Ed25519) ou l'épinglage TLS
   suffit-il pour le modèle de menace retenu ?
3. Le trafic API doit-il passer dans le tunnel (confidentialité) ou être
   protégé pour rester indépendant du tunnel (robustesse) ?
4. Un même téléphone peut-il porter deux comptes/marques ? Si oui, le coffre
   doit être scopé par `userId` et le logout doit tout effacer.
5. Le bundle vide doit-il être un retrait immédiat, ou seulement un retrait
   quand `entitlement.state == "exhausted"` ? D61 et le commentaire de
   `bundle.ts` se contredisent.
6. `cm.bouendji.nevpn` dans `payments.ts:81` : coquille ou paquet d'une
   marque réelle ?
7. Le limiteur global de 300/min/IP est-il tenable derrière les NAT mobiles
   camerounais, sachant qu'un seul client en boucle peut le consommer ?
