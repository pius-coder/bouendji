# Audit Android core : réseau, VPN, config, crypto, offline, brand

Chemin racine : `apps/android/app/src/main/java/cm/bouendji/vpn/` (abrégé `vpn/` ci-dessous).
Lecture seule. Aucune compilation, aucun téléchargement. `libs/libbox.aar` est absent du dépôt (`apps/android/app/libs/` vide), donc rien du moteur libbox n'a été exécuté ni compilé.

## 1. Verdict

- Tranche **solide sur la sécurité et le modèle de données** : signature HMAC/ECDH des requêtes, enveloppe bundle AES-GCM liée à l'appareil et à la révision, clés non exportables dans le Keystore, usage unique des fichiers de secours.
- Le **moteur VPN est réel mais non vérifiable ici** : `LibboxTunnelEngine.kt` appelle libbox, qui n'est pas dans le dépôt. Les compteurs de trafic et la bascule passent par l'API Clash locale.
- **Le plan est majoritairement absent côté client** : aucune notion de quota restant, de plage horaire, de famille de forfait, de connexion par WhatsApp, de mot de passe forcé, de sessions, de rafraîchissement périodique du bundle, ni de champs de marque pour WhatsApp admin.
- Risque fonctionnel principal : un bundle **sans configuration est ignoré** (retrait non propagé), et le bundle n'est **jamais re-tiré pendant la session**. Un accès coupé côté serveur ne l'est donc pas côté app avant l'`expiresAt` du nœud.
- Les points 1, 4, 5 et 9 du plan touchent cette tranche ; les points 2, 3, 6, 7, 8 sont hors tranche (voir section 7).

## 2. Inventaire

| Fichier | Rôle | Taille (lignes) | État |
|---|---|---|---|
| `net/ApiClient.kt` | Client HTTP signé, toutes les routes, DTO | 852 | solide (routes présentes, quota absent) |
| `net/DeviceAuth.kt` | Identité d'installation, preuve de requête, horloge | 199 | solide |
| `vpn/TunnelEngine.kt` | Interface moteur, états `TunnelState` (7 états), moteur indisponible | 196 | solide (contrat) |
| `vpn/LibboxTunnelEngine.kt` | Adaptateur libbox réel : start/stop, Clash `/proxies`, `/connections` | 231 | partiel (non compilable sans `libbox.aar`) |
| `vpn/LibboxPlatform.kt` | Implémentation `PlatformInterface` (TUN, interfaces réseau) | 308 | partiel (non vérifié à l'exécution) |
| `vpn/VpnTunnelService.kt` | Service VPN : cycle de vie, superviseur, bascule, expiration, télémétrie | 687 | solide, complexe |
| `vpn/UsageMeter.kt` | Cumul de l'usage du jour, file de rapports de sonde | 86 | solide |
| `vpn/ServerBus.kt` | Bus d'état des serveurs, trafic, notice | 76 | solide |
| `config/SingBoxConfig.kt` | Décodage VLESS strict, bundle → config sing-box, sélecteur + urltest | 472 | solide |
| `crypto/DeviceKeys.kt` | Clés Keystore `vpn-sign` / `vpn-agree`, ECDH, `DeviceEnvelope.open` | 254 | solide |
| `crypto/SecureStore.kt` | Stockage clé-valeur chiffré AES-GCM, clé Keystore | 152 | solide |
| `crypto/Hkdf.kt` | HKDF-SHA256 | 55 | solide |
| `offline/OfflineBundle.kt` | Conteneur `.bvpn`, vérification Ed25519, usage unique, `ConfigVault` | 387 | solide (format « proposé », pas émis par le serveur) |
| `offline/ImportInbox.kt` | Boîte de réception des fichiers ouverts, borne 1 Mo | 47 | solide |
| `brand/BrandTokens.kt` | Jetons de marque remplacés au build, `requireValid()` | 123 | partiel (pas de champ WhatsApp admin) |
| `VpnApplication.kt` | Conteneur de dépendances manuel | 83 | solide |
| `build.gradle.kts` (dépendances) | OkHttp, coroutines, serialization, Compose, `files(libs/libbox.aar)` | 121 | partiel (`require` libbox.aar) |

Preuves clés :
- `net/ApiClient.kt:834-852` : constantes `ApiPaths`, liste exhaustive des routes utilisées.
- `vpn/VpnTunnelService.kt:89` : `TELEMETRY_EVERY_TICKS = 60`, `:413-425` : boucle de compteurs chaque seconde.
- `build.gradle.kts:111-116` : `require(libboxAar.exists())` et `implementation(files(libboxAar))`. Le dossier `apps/android/app/libs/` n'existe pas.
- `vpn/TunnelEngine.kt:52-57` : commentaire « Aucune dépendance libbox n'est déclarée dans ce module ». Ce commentaire est **périmé** : `build.gradle.kts:116` déclare la dépendance et `LibboxTunnelEngine.kt:7-12` importe libbox.

## 3. Ce qui sert le plan

- **Requêtes signées et rejeu contrôlé** : `net/ApiClient.kt:390-414` (`authed`, un seul rafraîchissement sur 401, nonce neuf). Sert le point 1 (session).
- **Bundle chiffré de bout en bout** : `net/ApiClient.kt:336-384` (`fetchBundle`, ETag `If-None-Match`, 304) ; `crypto/DeviceKeys.kt:198-245` (`DeviceEnvelope.open`, HKDF `vpn-bundle-v1|deviceId|revision`, AES-GCM, empreinte SHA-256). Sert le point 4 (bundle par appareil).
- **Sélecteur + urltest + bascule** : `config/SingBoxConfig.kt:110-111` (`SELECTOR_TAG = "proxy"`, `AUTO_TAG = "auto"`), `:240` (selector), `:254` (urltest) ; `vpn/VpnTunnelService.kt:498-521` (`failover`, mesure de tous les nœuds, `selectOutbound`). Sert le point 9 (liste avec ping, bascule).
- **Expiration par nœud** : `config/SingBoxConfig.kt:386-393` (`usableConfigs` filtre `expiresAt > now`), `vpn/VpnTunnelService.kt:589-604` (`scheduleExpiry`). Sert le point 4 (plages : chaque nœud a sa propre fin).
- **Mesure à travers le tunnel** : `vpn/LibboxTunnelEngine.kt:102-114` (`measureDelayMs` via `GET /proxies/{tag}/delay`). Sert le point 9 (ping réel, pas TCP).
- **Compteurs en direct** : `vpn/LibboxTunnelEngine.kt:129-135` (`trafficTotals`), `vpn/ServerBus.kt:73-74`, `ui/screens/Home.kt:96-106` (débit Mbps calculé par différence). Sert le point 9 (feuille Activité, débit).
- **Usage unique des fichiers de secours** : `offline/OfflineBundle.kt:120-121, 189-300, 346-356` (liste locale de 32 identifiants, marquage avant écriture).
- **Stockage chiffré** : `crypto/SecureStore.kt:60-68` (clé AES-256 GCM dans Keystore, `setRandomizedEncryptionRequired(true)`, `:89` AAD = clé).
- **Marque** : `brand/BrandTokens.kt:57-93`, avec `requireValid()` (refuse les domaines `.invalid`).

## 4. Écarts avec le plan

Réponses aux six questions, rangées par point du plan.

**Point 1 — Mot de passe forcé, connexion email ou WhatsApp, Mon compte.**
- Connexion : `net/ApiClient.kt:242-247` envoie `appId, email, password`. `LoginRequest` (`net/ApiClient.kt:578-579`) ne porte que `email`. **Manque** : identifiant WhatsApp.
- Mot de passe temporaire : `SessionResponse` (`net/ApiClient.kt:632-639`) et `UserDto` (`net/ApiClient.kt:585-593`) n'ont **aucun champ** `mustChangePassword`. **Manque** : détection et écran de changement forcé.
- Changement de mot de passe, sessions ouvertes, révocation : **aucune route** dans `ApiPaths` (`net/ApiClient.kt:834-852`). `devices()` (`net/ApiClient.kt:287-288`) liste les appareils, pas les sessions.
- Thème : `BrandTokens` ne le gère pas côté utilisateur (hors plan, à noter pour « Mon compte »).

**Point 4 — Forfaits : quota, accès coupé, plages de nuit.**
- Question 1 (catalogue) : `ApiClient.plans` (`net/ApiClient.kt:291-298`) renvoie `PlanDto` (`:668-683`). La famille existe seulement sous forme de texte : `endpointTier` (`free-labs` / `paid-gcp`, `:680-681`, commentaire D45). **Manque** : libellé de famille lisible, plages horaires, quota en Go, prix par plage.
- Question 1 (commande) : `CreateOrderRequest` (`net/ApiClient.kt:688-689`) ne contient que `planId, planRevision`. `createOrder` (`:300-306`) ne transmet **aucune plage**. **Manque** : `slot` (20h-24h, 24h-4h, 20h-4h) dans la requête et dans `OrderDto` (`:697-710`).
- Question 1 (abonnement) : `EntitlementDto` (`:607-618`) donne `daysRemaining` et `endpointTier`, sans quota. `SubscriptionDto` (`:621-629`) donne dates et `deviceLimit`, sans quota. `StatsDto` (`:558-564`) donne `bytesUp/bytesDown` **cumulés**, sans limite. **Manque** : `quotaBytes`, `usedBytes`, `remainingBytes`, `nightWindow`.
- Accès coupé à l'épuisement : aucune notion côté client. Le seul signal est l'expiration (`vpn/VpnTunnelService.kt:589-604`). L'app propose « racheter » seulement si `SUBSCRIPTION_EXPIRED` est émis. **Manque** : état `QUOTA_EXHAUSTED` dans `TunnelState` (`vpn/TunnelEngine.kt:17-25`, sept états exactement, un ajout doit être discuté).
- Plages de nuit : **aucune occurrence** de « plage », « nuit », « minuit », « window » dans le package (recherche sur tout `vpn/`). Voir section 5 pour la proposition.

**Point 9 — Application Android (feuille Activité, quota, serveurs, aide).**
- Jauge de quota à l'accueil : `ui/screens/Home.kt:190` calcule `used` à partir de `traffic` (octets de la session) et n'a aucun total restant. **Manque** : quota restant (lié au point 4).
- Débit en direct : **existe** (`ui/screens/Home.kt:96-106`, `vpn/LibboxTunnelEngine.kt:129-135`, `vpn/VpnTunnelService.kt:413-425`). Trafic reçu/envoyé de la session : existe (`ServerBus.kt:30`). Trafic cumulé du compte : `StatsDto` (`net/ApiClient.kt:558-564`). **Manque** : « data restante ».
- Liste des serveurs avec ping : mesure réelle existe (`vpn/VpnTunnelService.kt:472-495`, `probeAll`, et `ServerBus.kt:14-19` `ProbeState`, `ProbeMethod.TUNNEL`).
- Bouton « Demander de l'aide (WhatsApp) qui copie le code d'appareil » : aucune notion de « code d'appareil » lisible. Il existe `DeviceAuth.deviceId()` (`net/DeviceAuth.kt:138`) et `installationId()` (`:127`), qui sont des UUID techniques. **Manque** : un code court affichable (à définir avec le serveur).
- Pop-up de bienvenue, page de paiement au thème de la marque : hors tranche (`ui/`). Dans la tranche, `BrandTokens.communityWhatsappUrl` (`brand/BrandTokens.kt:92`) existe, vide, et masque la rangée (`ui/screens/Auth.kt:121-126`).

**Point 2 — Admin, onboarding, build (valeurs de marque).**
- Question 6 : `brand/BrandTokens.kt` contient `themeId` (`:57`, `"billet"`), `appName` (`:62`, `"Bouendji VPN"`), `packageName` (`:65`), `apiBaseUrl` (`:68`, `https://api.numzer0.store`), `appId` (`:71`), `supportUrl` (`:74`, `mailto:support@henshins.online`), `accent` (`:77`, `null`), `offlineBundleSigningKeyB64` (`:83`), `defaultLocale` (`:86`, `fr`), `memberWord` (`:89`, `NJI`), `communityWhatsappUrl` (`:92`, vide), `communityTelegramUrl` (`:93`, vide), `appVersion` (`:96`).
- **Pas de numéro WhatsApp admin.** `supportUrl` est un `mailto:`. **À ajouter** : `supportWhatsappNumber` (format E.164 sans `+`, pour `https://wa.me/`) et renseigner `communityWhatsappUrl` avec le lien d'invitation du groupe.
- Le jeton `appId` (`:71`) est un UUID ; `requireValid()` (`brand/BrandTokens.kt:115`) accepte les traits d'union par son regex, donc pas de blocage.

**Point 3 — Guide par rôle.** Hors tranche.

**Point 5 — Prix plancher.** Hors tranche (serveur et dashboard). Côté app, seul `PlanDto.priceXaf` (`net/ApiClient.kt:673`) est lu.

**Point 6 — Telegram.** `communityTelegramUrl` (`brand/BrandTokens.kt:93`) existe, vide. Hors tranche pour les rappels serveur.

**Point 7 — Dashboard.** Hors tranche.

**Point 8 — Réseau (noms de nœuds).** Hors tranche. Côté app, les nœuds sont nommés `n1..nN` (`config/SingBoxConfig.kt:117`, `NODE_PREFIX`) et `label`/`region` viennent du bundle (`:26-40`).

**Écart transverse — rafraîchissement du bundle pendant la session.** Le bundle n'est tiré que dans `refreshPrivate()` (`ui/AppController.kt:240-252`), appelé à l'ouverture et sur action utilisateur. Aucun minuteur ne le relance pendant qu'un tunnel tourne. Conséquence : un nœud ajouté à 20h n'est connu qu'au prochain `refresh`, et un nœud retiré côté serveur reste utilisable jusqu'à son `expiresAt`.

## 5. Structure de code proposée

Conventions suivies : `ApiPaths` en `const val` (`net/ApiClient.kt:834`), DTO `@Serializable data class` dans `ApiClient` (`:558-730`), `Result<T>` pour le moteur (`vpn/TunnelEngine.kt:83-99`), `TunnelStateBus` pour l'état (`:182-196`).

**A. Routes et DTO (`net/ApiClient.kt`)**
- `ApiPaths` : ajouter `ME_QUOTA = "/v1/me/quota"` (à valider avec le serveur, route inexistante aujourd'hui), `ME_SESSIONS = "/v1/me/sessions"`, `ME_PASSWORD = "/v1/me/password"`, `AUTH_LOGIN_WHATSAPP` si la connexion par numéro a une route distincte (sinon champ `identifier` dans `LoginRequest`).
- `LoginRequest` : remplacer `email` par `identifier: String` (email ou numéro normalisé), garder `email` en alias côté serveur. Ajouter `mustChangePassword: Boolean = false` à `SessionResponse` et `UserDto`.
- `PlanDto` : ajouter `familyLabel: String`, `slots: List<String>` (ex. `"20h-24h"`), `quotaGb: Int?` (null = pas de quota), `nightQuotaGb: Int?`.
- `CreateOrderRequest` : `fun createOrder(planId: String, planRevision: Int, slot: String? = null): OrderDto` avec `val slot: String? = null` (`explicitNulls = false` déjà réglé à `:69`).
- `EntitlementDto` : ajouter `quotaBytes: Long? = null`, `usedBytes: Long = 0`, `remainingBytes: Long? = null`, `nightSlot: String? = null`.
- Nouveau `suspend fun quota(): QuotaDto` avec `QuotaDto(quotaBytes: Long?, usedBytes: Long, remainingBytes: Long?, resetAt: String?)`.
- `suspend fun sessions(): SessionsResponse`, `suspend fun revokeSession(id: String)`, `suspend fun changePassword(current: String, new: String)`.

**B. Bundle (`net/ApiClient.kt:336`, `config/SingBoxConfig.kt:26-56`)**
- `BundleConfig` : ajouter `val startsAt: String? = null` (début de la plage). Filtrer dans `SingBoxConfig.kt:386-393` : `startsAt <= now < expiresAt`. Sans ce champ, un nœud de nuit est visible dès son émission.
- `ui/AppController.kt:248` : ne plus ignorer un bundle vide. Remplacer par `vault.replace(payload)` qui écrase la liste (un `configs` vide signifie un retrait). Garder le marquage de révision pour éviter un retour arrière.
- Nouveau minuteur dans `VpnTunnelService` : `refreshBundleEvery(15 min)` pendant `CONNECTED` et `NO_CONNECTION`, qui appelle `api.fetchBundle(knownEtag)` puis `vault.save`. Le plan demande un rafraîchissement lié aux créneaux (20h, minuit) ; un minuteur de 5 min suffit à couvrir les deux.

**C. Moteur (`vpn/TunnelEngine.kt`, `vpn/LibboxTunnelEngine.kt`)**
- Ajouter à `TunnelEngine` : `suspend fun trafficRate(): Result<TrafficRate>` seulement si `/connections` ne suffit pas (voir section 6, point 2). Sinon, rien à ajouter.
- Ajouter `TunnelState.QUOTA_EXHAUSTED` est **à discuter** : le contrat de `TunnelEngine.kt:7-16` dit « exactement sept ». Proposition : garder les sept états et ajouter `TunnelStateBus.publish(SUBSCRIPTION_EXPIRED, "Quota épuisé : racheter une offre.")` (aucun nouvel état).

**D. Télémétrie (`vpn/UsageMeter.kt`)**
- Aucune modification nécessaire pour l'affichage. Pour la jauge de quota, lire `api.quota()` plutôt que le cumul local (qui est déclaratif, voir section 6).

**E. Offline (`offline/OfflineBundle.kt`)**
- Aucune modification du format. Documenter dans `OfflineBundle.kt:66-80` que le serveur doit émettre exactement ce conteneur (aujourd'hui non émis, voir section 7).

**F. Marque (`brand/BrandTokens.kt`)**
- Ajouter `const val supportWhatsappNumber: String = ""` (E.164 sans `+`) et `const val supportWhatsappUrl: String = ""`. Mettre à jour le tableau de contrat `brand/BrandTokens.kt:6-20` (le workflow de build réécrit ce fichier entier).
- Remplir `communityWhatsappUrl` (lien d'invitation du groupe, fourni par l'admin) et `communityTelegramUrl` si applicable.

**G. Fichiers à créer**
- `net/QuotaDto.kt` (optionnel) : sortir `QuotaDto` et `SessionsResponse` d'`ApiClient.kt` (852 lignes, déjà lourd).
- `vpn/NightWindow.kt` : `object NightWindow { fun isOpen(slot: String, nowMs: Long): Boolean }` pour l'affichage « nuit ouverte » côté UI. Les plages sont en heure locale du téléphone (fuseau à fixer : non vérifié, le serveur doit émettre l'heure en UTC ou avec offset).

**H. Fichiers à ne pas toucher**
- `crypto/*` : le schéma d'enveloppe et l'usage des clés Keystore sont corrects. Une modification casserait la compatibilité avec `sealForDevice` (`ApiClient.kt:363` renvoie `DEVICE_PROOF_INVALID` (lignes 349-364)).

## 6. Bugs et risques

1. **Retrait de nœuds non propagé.** `ui/AppController.kt:248` : `if (bundle.payload.configs.isNotEmpty()) container.vault.save(...)`. Scénario : le serveur retire toutes les configurations (quota épuisé, admin qui coupe). Le bundle vide est ignoré, la liste locale reste, et le tunnel continue de router vers les nœuds jusqu'à leur `expiresAt`. Le commentaire `D61` le justifie, mais aucun mécanisme ne permet le retrait.
2. **Bundle jamais re-tiré pendant la session.** Pas de minuteur (recherche `fetchBundle` : un seul appel, `ui/AppController.kt:245`). Scénario : nœuds de nuit ajoutés à 20h, l'app connectée depuis 18h ne les voit pas.
3. **Plage absente du modèle.** `BundleConfig` (`config/SingBoxConfig.kt:26-40`) n'a que `expiresAt`. Un nœud n'est pas utilisable avant une date de début. Scénario : un nœud 24h-4h émis à 20h est inclus dès la réception du bundle, donc utilisable avant minuit.
4. **Compteurs client déclaratifs.** `vpn/UsageMeter.kt:9-10`, `ApiClient.kt:279-282`. Le total du jour est envoyé par l'app et le serveur prend le maximum. Un client modifié peut déclarer 0. Pour le quota, le serveur doit lire 3x-ui (point 4a du plan) et ne pas s'appuyer sur ces données. Le serveur n'est pas dans la tranche (non vérifié).
5. **Bundle lu en clair pour le journal ?** `ApiClient.kt:370-377` : le clair est effacé (`plain.fill(0)`) mais `BundlePayload` reste en mémoire sous forme de `String` immuable (`plain.toString(Charsets.UTF_8)` `:370`). Risque faible : un `String` ne s'efface pas. Non exploitable hors dump mémoire.
6. **File de confirmation tronquée.** `ui/AppController.kt:515` : `takeLast(16)` sur `offline.toReport`. Si plus de 16 bundles de secours sont importés hors ligne sans réseau, les plus anciens ne sont jamais confirmés au serveur (`markOfflineConsumed`). Peu probable, mais silencieux.
7. **Une seule clé ECDH par appareil.** `crypto/DeviceKeys.kt:91-93` : `setUserAuthenticationRequired(false)`. Un malware avec accès root peut déchiffrer les bundles. Acceptable pour ce modèle, à noter.
8. **Stale comment.** `vpn/TunnelEngine.kt:52-57` dit qu'aucune dépendance libbox n'existe ; c'est faux (`build.gradle.kts:116`). Risque de confusion pour le prochain auditeur.
9. **Commentaires « vérifié javap » non reproductibles.** `vpn/LibboxTunnelEngine.kt:17-22` affirme que les signatures viennent de `javap` sur `classes.jar`. Le `.aar` n'est pas dans le dépôt : impossible à reproduire ici (voir section 8).
10. **Libellé fixe dans le moteur.** `vpn/LibboxTunnelEngine.kt:54` : `name = "libbox-1.14.3"` ; la version est codée en dur et ne reflète pas le `.aar` réellement embarqué.
11. **Ed25519 dépend de la version Android.** `offline/OfflineBundle.kt:306` vérifie `KeyFactory.getInstance("Ed25519")` au runtime. Sur des appareils Android 12 où ce fournisseur est absent, l'import est refusé avec un message clair (`:243-246`), donc pas de faille, mais la couverture est réduite (non vérifié : version exacte du fournisseur).

## 7. Dépendances hors tranche

- **Serveur (`apps/api`)** : routes `/v1/me/quota`, `/v1/me/sessions`, `/v1/me/password`, `/v1/me/telemetry` (GREATEST, cité `vpn/UsageMeter.kt:9`), connexion par numéro WhatsApp, champ `mustChangePassword` dans `SessionResponse`, `slot` dans `CreateOrderRequest`, émission du `.bvpn` (aujourd'hui « proposé », `offline/OfflineBundle.kt:66-70`, `offline_bundles` absent de `schema.ts`, non vérifié).
- **Serveur** : format exact de `startsAt`/`expiresAt` (ISO-8601 UTC attendu, `config/SingBoxConfig.kt:58` utilise `Instant.parse`).
- **Serveur** : `maxSessionSeconds` vient du bundle (`config/SingBoxConfig.kt:33-36`), non vérifié.
- **Pipeline de marque** : réécriture de `brand/BrandTokens.kt` au build (`:6-20`), injection de `supportWhatsappNumber`.
- **`ui/`** : pop-up de bienvenue, page de paiement avec choix de plage, feuille Activité, Auth WhatsApp. Non audités (hors tranche).
- **`apps/android/app/libs/libbox.aar`** : binaire GPL-3.0, absent, compilé par `tools/build-libbox.ps1` (`build.gradle.kts:103-116`). Sa présence conditionne toute la tranche `vpn/`.
- **Dashboard / dépôt** : rien.

## 8. Non vérifié

1. **Aucune compilation ni exécution.** `libs/libbox.aar` absent. Toutes les signatures libbox citées dans `vpn/LibboxTunnelEngine.kt:17-30` restent non vérifiées par moi.
2. **Trafic en direct : API libbox.** Le code utilise `GET /connections` de l'API Clash (`vpn/LibboxTunnelEngine.kt:129-135`, champs `uploadTotal`/`downloadTotal`). La présence de ces champs dans la version de sing-box embarquée est **(non vérifié)**. La couche `CommandClient` / `StatusMessage` (uplink/downlink) et `android.net.TrafficStats` ne sont **pas utilisées dans le code** (recherche : aucune occurrence). Leur existence dans libbox 1.14.3 est **(non vérifié)**.
3. **`/connections` : totaux cumulés ou par connexion.** Le code suppose des totaux cumulés depuis le démarrage du moteur (`vpn/UsageMeter.kt:23-31`). **(non vérifié)**.
4. **Comportement serveur du GREATEST** sur `/v1/me/telemetry` : **(non vérifié)**, hors tranche.
5. **Fournisseur Ed25519 sur Android 12** : **(non vérifié)**.
6. **Fuseau des plages de nuit** : aucun modèle n'existe ; le choix (UTC ou heure locale) reste à trancher.
7. **Sortie de `LibboxPlatform.kt`** : lu par grep seulement, pas lu en entier. Les interfaces réseau et `openTun` (`:122`, `:183`) ne sont pas auditées au-delà.
8. **`ui/`** : non lu sauf les lignes citées (`Home.kt:96-106`, `Home.kt:190`, `AppController.kt:240-252`, `:504-536`, `Auth.kt:121-126`).
9. **Tests** : aucun test unitaire de la tranche n'a été recherché (hors périmètre).
