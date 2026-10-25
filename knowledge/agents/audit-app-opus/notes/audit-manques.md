---
id: audit-app-opus-manques
title: Audit — ce qui manque pour un fonctionnement de bout en bout
kind: note
status: assumption
updated: 2026-10-23
---

# Audit des manques (partie A)

21 manques identifiés (M1-M21).

Légende : **V** = vérifié (commande lancée, sortie citée) ; **R** = relu
seulement (code lu, non exécuté) ; **M** = manque. Chaque manque a **une**
solution, détaillée et ordonnée dans `plan-minimal.md` (identifiant `Pn`).

## Preuves exécutées dans cette session

| Commande (dans `apps/api`) | Sortie |
|---|---|
| `node_modules/.bin/tsc -p tsconfig.json --noEmit` | aucune sortie, `exit=0` |
| `node_modules/.bin/tsc -p tsconfig.vercel.json --noEmit` | aucune sortie, `exit=0` |
| `NODE_ENV=test node --test --import tsx test/*.test.ts` | `tests 162`, `pass 162`, `fail 0`, `duration_ms 24284.3415` |
| `unzip -l apps/android/app/libs/libbox.aar` | une seule bibliothèque native : `jni/arm64-v8a/libbox.so` (78 817 552 o) |
| `unzip -l apps/android/app/build/outputs/apk/debug/app-debug.apk` | `lib/arm64-v8a/libbox.so` ; aucun `libbox.so` x86 / x86_64 / armeabi-v7a |
| `ls -la apps/android/app/build/outputs/apk/debug/` | `app-debug.apk` 89 580 046 o, daté 2026-10-22 23:08 |
| comptage `apps/api/openapi.json` (node) | 64 opérations, 59 avec `security`, 27 `requestBody` |

Ce que les 162 tests **ne couvrent pas** : `X-Ingest-Timestamp` est exempté
quand `NODE_ENV=test` (`app.ts` l.209), donc aucun test ne prouve que le
conteneur d'endpoint réel passe l'ingestion. Ils tournent sur PGlite
`memory://` (`test/support.ts` l.16), jamais sur Postgres réel ni sous Vercel.

---

## 1. Endpoint (`infra/endpoint/`) ↔ API (`routes/internal.ts`)

| | Constat | Source |
|---|---|---|
| V | Contrat de corps `register`/`ready`/`heartbeat` couvert par `test/ingest.test.ts` (dans les 162) | sortie de test |
| R | `entrypoint.sh` : register → `jq -n` config → `xray run -test` → sonde du port → ready → heartbeat 45 s → SIGTERM sans désinscription | `entrypoint.sh` l.215-403 |
| **M1** | **Le conteneur n'envoie jamais `X-Ingest-Timestamp`.** L'API l'exige hors test sur tout `/v1/internal/*` sauf builds → `401` → le script sort en `78` (« jeton d'ingestion refusé »). Aucun nœud réel ne peut s'enregistrer. | `entrypoint.sh` l.140-156 (en-têtes : Authorization, Content-Type, Accept) ; `app.ts` l.209-216 |
| **M2** | Le conteneur n'envoie ni `tier` ni `identity_mode` : tout nœud est `free-labs`/`shared`. Un nœud `paid-gcp` (D45, D69) est impossible à créer depuis l'image. Même en le forçant, `client_pool` n'est pas écrit dans Xray (un seul client `email:"shared"`) et le heartbeat n'envoie ni `usage`, ni `healthy`, ni `latency_ms`. | `entrypoint.sh` l.172-192, l.278 ; `internal.ts` l.98-131 |
| **M3** | Nœud `paid-gcp` « persistant » (D45, `endpoints.ts` l.13) mais la durée est bornée par `ENDPOINT_MAX_TTL` = 30 j et, sans `ENDPOINT_TTL`, vaut 4 h 30 comme un lab. | `config.ts` l.171, l.177 ; `endpoints.ts` l.211-215 |
| R | Clé de déploiement hors Cloud Run = `hostname` : sur un VPS Docker, chaque recréation de conteneur crée un nouvel endpoint (non vérifié sur un hôte réel). | `entrypoint.sh` l.118-126 |

## 2. Cycle de vie des nœuds et liste servie (API seule)

| | Constat | Source |
|---|---|---|
| V | Verdict de santé (quorum 3 / témoin), D47 (un `down` ne se lève pas par le nœud), D48 (bump sur transition) : tests `telemetry`, `poolWatch`, `endpointsTier` passent | sortie de test |
| **M4** | **`ENDPOINT_AUTO_APPROVE` vaut `false` par défaut en production** et le garde-fou D55 ne l'exige pas : si la variable n'est pas posée, `ready` laisse `pending`, `servedEndpoints` filtre `active`, le pool est vide sans erreur (le défaut que D46 voulait fermer). `.env.example` dit encore « false en production ». | `config.ts` l.169, l.197-214 ; `endpoints.ts` l.380 ; `.env.example` |
| **M5** | **Sous Vercel, rien ne bump la révision quand un nœud entre en drain ou expire**, et le rappel de déploiement (D27) et la purge ne tournent jamais : le tick de 60 s n'existe que dans `server.ts`, le hook paresseux (D51) ne fait que probation / `expired` / `needs_review`, sans `bumpPoolRevision`, sans `checkPoolExpiry`, sans `purgeExpired`. | `server.ts` l.44-79 ; `app.ts` l.226-255 ; `api/index.ts` l.23-24 |
| **M6** | **`cachedBundle` ne compare que la révision et l'expiration**, pas le jeu de nœuds servi. Quand un nœud sort par le temps (drain) sans bump (M5) ou revient de probation (hook sans bump), l'ETag change mais le corps renvoyé est l'ancien chiffré ; au tirage suivant le client présente le nouvel ETag et reçoit `304`. Il garde une liste fausse. | `bundle.ts` l.258-271, l.330-353 |
| M | Seules `deployReminder` et `noEndpoint` existent ; `endpointDown`, `poolSuspicion`, `payoutReview` et la table `alert_state` ne sont utilisés par aucun code. | `services/telegram.ts` l.109, l.123 ; `schema.ts` l.515 |

## 3. API ↔ Postgres (`db.ts`)

| | Constat | Source |
|---|---|---|
| R | Pool `pg` `max: 10` ; schéma rejoué à chaque démarrage à froid sous `pg_advisory_lock(727001)`, sur la même connexion, ce qui exige une URL **directe** (commentaire l.66-72) | `db.ts` l.36-82 |
| **M7** | Jamais exécuté sur Postgres réel. Sous Vercel : chaque instance ouvre jusqu'à 10 connexions directes et rejoue tout `SCHEMA_SQL` à froid (verrou `lock_timeout 10s`). Risque d'épuisement de connexions et de démarrages à froid lents. | `db.ts` l.37, l.73-81 |
| R | Index unique en double sur `config_grants(device_id, endpoint_id)` (deux noms) — inoffensif | `schema.ts` l.232, l.530 |
| M | Aucun moyen documenté de lancer `seed.ts` contre la base de production (communauté + app + owner, sans forfait, D59) | `seed.ts` l.52-90 |

## 4. API ↔ Android (contrat)

`packages/contract` n'est **pas** le contrat de l'app : Android ne le consomme
pas (Kotlin), l'API n'en importe que 3 types (`errors.ts`, `bundle.ts`,
`endpoints.ts`). Il est en retard (`PayoutStatus` sans `approved`/`needs_review`,
`AdminRole = platform|partner`, pas de types login/register). Le contrat réel est
`ApiClient.kt` ↔ routes. Voir la section Android ci-dessous.

## 5. API ↔ dashboard (routes admin)

| | Constat | Source |
|---|---|---|
| V | Login admin, clé console, rôles, BOLA : `admin.test.ts`, `adminAuth.test.ts`, `adminPayouts.test.ts` passent | sortie de test |
| M | Dashboard absent du dépôt versionné (`apps/dashboard/` en cours, non suivi par git, hors de mon périmètre) | `git status` |
| **M8** | `GET /v1/admin/offline-bundles` n'appelle pas `authorize` : un `finance` membre lit les fichiers émis de sa communauté (identifiants d'appareils, échéances), capacité qu'il n'a pas pour l'émission. | `offline.ts` l.24-55 ; `admin.ts` l.297-299 |
| **M9** | Fichier hors-ligne : aucun contrôle d'abonnement actif ; toujours le tier `free-labs` (`servedEndpoints(db, 12)`), même pour un forfait `paid-gcp` (contraire à D45) ; aucune grant `per_device`. | `offlineBundles.ts` l.117 ; `endpoints.ts` l.433-441 |
| M | OpenAPI de l'émission annonce `id` et `ttlHours` 1-72 ; le code renvoie `bundleId` et borne silencieusement à 24 h. `requestBody.required: true` alors qu'un corps vide passe. | `contracts.ts` l.865-866 ; `admin.ts` l.1204-1211 ; `offlineBundles.ts` l.136 |
| **M21** | Aucune route ne crée une ligne `apps` : `INSERT INTO apps` n'existe que dans `seed.ts` l.68. Une nouvelle marque (donc un `appId` pour `BrandTokens` et un build) ne peut être créée ni depuis la console ni par l'API. | `grep "INSERT INTO" routes/admin.ts routes/builds.ts` : communities, plans, memberships, admin_users, payouts, builds |
| R | JWT admin 8 h, pas de route de rafraîchissement admin | `lib/auth.ts` l.91 |
| R | Commentaire CORS (« le navigateur appelle l'API en cross-origin ») contraire à D78 (BFF serveur → serveur) : `ALLOWED_ORIGINS` devient inutile pour le dashboard | `app.ts` l.111-116 |

## 6. Webhook de paiement ↔ abonnement

| | Constat | Source |
|---|---|---|
| V | Idempotence, revérification, montant falsifié, activation + commission : `payments.test.ts`, `e2e.test.ts` passent (provider mock) | sortie de test |
| **M10** | **Mauvais nom d'en-tête.** Le code lit `x-webhook-secret` ; la documentation Fapshi indique que les webhooks portent **`x-wh-secret`**. En production le secret est obligatoire (D77) → tout webhook réel reçoit `401`. Fapshi n'envoie **qu'une** requête par événement : il n'y a pas de rejeu pour rattraper. L'activation ne repose alors plus que sur `GET /v1/orders/:id?refresh=1` déclenché par l'app. | `payments.ts` l.153-160 ; doc Fapshi « Webhook Integration » (consultée le 2026-10-23) |
| **M11** | **`/pay/return/:orderId` n'existe qu'en mode mock** (enregistrée après le `return` de la l.201), mais `redirectUrl` la vise toujours. En production, le navigateur de l'utilisateur qui a payé arrive sans `X-App-Id` avec `Accept: text/html` : le rideau le redirige en `302` vers `DECOY_URL`. | `payments.ts` l.199-224 ; `services/payments.ts` l.357 ; `lib/decoy.ts` l.65 |
| R | `fapshi.ts` : noms de champs `initiate-pay`/`payment-status` non confrontés à la doc live (commentaire l.61-64) | `lib/fapshi.ts` |
| R | Versements : `payoutProvider.payout` **est** appelé (`/payouts/:id/pay`), confirmation manuelle par `/confirm` ; aucune lecture automatique du statut de versement | `admin.ts` l.1463, l.1544 |
| R | `PUBLIC_BASE_URL` n'est pas dans le garde-fou de production : défaut `http://localhost:8080`, donc `redirectUrl` locale si oubliée (`apiOrigin()` ne lève que pour les builds) | `config.ts` l.59 ; `lib/brand.ts` l.239-245 |

## 7. Vercel ↔ API (adaptateur) et Vercel ↔ endpoint (D34)

| | Constat | Source |
|---|---|---|
| V | `tsc -p tsconfig.vercel.json --noEmit` sans sortie | sortie citée |
| **M12** | `export const config = { api: { bodyParser: false } }` est une convention Next.js ; pour une fonction Node `@vercel/node`, la doc Vercel documente la désactivation des helpers par la variable **`NODEJS_HELPERS=0`**. Sans elle, rien ne garantit que le flux brut atteint Fastify intact (signature d'appareil sur le corps brut). Non vérifié en déploiement. | `api/index.ts` l.12 ; doc Vercel « Advanced Node.js Usage » |
| R | `req.url` vu par Fastify après le rewrite `/(.*) → /api/index` : la signature d'appareil couvre le chemin ; non vérifié sous Vercel | `vercel.json` ; `lib/auth.ts` |
| R | Limiteur de débit en mémoire par instance (déjà relevé dans `vercel`) | `app.ts` l.147-155 |
| R | D34 respecté : l'endpoint appelle l'API en sortant, l'API ne l'appelle jamais. Le seul trou est M1. | `entrypoint.sh` |

## 8. CI ↔ build de marque

| | Constat | Source |
|---|---|---|
| R | `inject-brand.mjs` valide et réécrit `BrandTokens.kt`, sortie 78 sur constante non remplacée ; `brand.test.ts` passe côté API | `tools/inject-brand.mjs` ; sortie de test |
| **M13** | **Le workflow ne récupère pas `libbox.aar`** (D62 : « la CI télécharge depuis une Release »). `build.gradle.kts` fait `require(libboxAar.exists())` → `assembleRelease` échoue à la configuration. | `.github/workflows/android-brand.yml` l.69-82 ; `apps/android/app/build.gradle.kts` l.111-116 ; `.gitignore` android l.15 |
| **M14** | `GITHUB_REF` vaut `main` par défaut ; le dépôt n'a que `master` et `dev` (`git branch -a`) → `workflow_dispatch` refusé par GitHub, build marqué `failed`. | `config.ts` l.91 ; `builds.ts` l.198-200 |
| M | Callback seulement en succès (`if: build_callback_url != ''`, `continue-on-error`) : un build échoué reste `queued` à vie. Aucun `apkUrl` (pas d'upload Blob, D62) ni `versionCode` envoyé, alors que le schéma les accepte. | `android-brand.yml` l.149-162 ; `builds.ts` l.70-87 |
| R | Nom du secret CI `BUILD_CALLBACK_TOKEN` ↔ variable API `BUILD_CALLBACK_SECRET` : même valeur à poser des deux côtés | `android-brand.yml` l.154 ; `config.ts` l.94 |
| R | Node 20 en CI, Node 24 en local (D3) ; sans effet sur `inject-brand.mjs` (non vérifié) | `android-brand.yml` l.39 |

## 9. Secrets et variables d'environnement

| Variable | Où | Requise en prod (garde-fou) | Origine | Remarque |
|---|---|---|---|---|
| `MASTER_KEY` | API | oui | `openssl rand -base64 32` | |
| `JWT_SECRET` | API | oui (≥ 32 car.) | aléatoire | |
| `DATABASE_URL` | API | oui (postgres) | fournisseur Postgres | voir M7 |
| `ENDPOINT_INGEST_SECRET` | API **et** conteneur | oui | `openssl rand -hex 32` | même valeur des deux côtés |
| `DASHBOARD_ACCESS_KEY` | API **et** serveur Next.js | oui | aléatoire | absente de `.env.example` |
| `BUILD_CALLBACK_SECRET` / `BUILD_CALLBACK_TOKEN` | API / secret GitHub | oui | aléatoire | absente de `.env.example` |
| `HEALTHCHECK_KEY` | API + sonde | oui | aléatoire | |
| `FAPSHI_WEBHOOK_SECRET` | API + tableau de bord Fapshi | oui | posé dans Fapshi | en-tête à corriger (M10) |
| `PAYMENT_PROVIDER=fapshi` | API | oui | — | |
| `FAPSHI_API_USER/KEY`, `FAPSHI_PAYOUT_USER/KEY` | API | **non** | Fapshi (deux services, D13) | absents = 5xx au premier paiement |
| `ENDPOINT_AUTO_APPROVE=true` | API | **non** | D46 | M4 |
| `PUBLIC_BASE_URL` | API | **non** | domaine API | défaut localhost |
| `OFFLINE_BUNDLE_SIGNING_KEY` | API ; clé publique dans le manifeste | non | `tools/offline-keygen.mjs` | absent = 409 à l'émission |
| `GITHUB_TOKEN`, `GITHUB_REPO`, `GITHUB_REF`, `MOCK_BUILDS=false` | API | non | GitHub | M14 |
| `TELEGRAM_*`, `DECOY_URL`, `MAIL_*`, `RESEND_API_KEY` | API | non | — | |
| `NODEJS_HELPERS=0` | Vercel | — | doc Vercel | M12 |
| `PUBLIC_HOST`, `API_URL`, `ENDPOINT_INGEST_SECRET`, `ENDPOINT_TTL`, (`ENDPOINT_TIER` à créer) | conteneur | exit 78 si absents (3 premiers) | URL réelle du service | M2 |
| `ANDROID_KEYSTORE_B64`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`, `ANDROID_KEYSTORE_PASSWORD` | secrets GitHub | non (APK non signé + avertissement) | keystore de la marque | |

---

## 10. Application Android (`apps/android`)

### 10.1 Build et moteur

| Point | État | Preuve / source | Manque → solution |
|---|---|---|---|
| `assembleDebug` | **V (preuve reprise du nœud, puis confirmée sur disque)** | `30-clients/android-toolchain` (section « Premier APK réellement exécuté (2026-10-21) ») cite `:app:assembleDebug BUILD SUCCESSFUL 44 s`, `app-debug.apk 85,3 Mo`, `adb install -r Success`. Constaté ici : `app-debug.apk` 89 580 046 o daté 2026-10-22 23:08 (≈ 85,4 Mio, cohérent). Je n'ai **pas** relancé Gradle. | — |
| libbox arm64-v8a seulement | **V** | `unzip -l` : `jni/arm64-v8a/libbox.so` seul dans l'AAR, `lib/arm64-v8a/libbox.so` seul dans l'APK | Conséquence : tunnel non prouvable sur émulateur x86_64 ; à prouver sur le Pixel 8 (arm64). Pas de manque de code. |
| Tunnel réel établi | **non vérifié** | aucune trace d'un `CONNECTED` sur appareil dans `knowledge/` | P9 : un essai sur le Pixel 8 avec un nœud réel |
| `tools/build-apk.ps1` | R | boucle de reprises sur `:app:assembleDebug`, JDK et Gradle locaux | — |
| `.github/workflows/android-brand.yml` | R | jamais exécuté (aucun run cité) | M13, M14 |
| `minSdk = 26` alors que le déchiffrement exige Android 12 (API 31) | **M15** | `libs.versions.toml` l.12 (le commentaire le dit) ; `ApiClient.kt` `fetchBundle` lève « Android 12 requis » | P12 : `minSdk = 31` |

### 10.2 Stockage, client signé, en-têtes

| Point | État | Source |
|---|---|---|
| Deux clés Keystore (SIGN + AGREE), coffre chiffré `SecureStore`, `ConfigVault` | R | `crypto/DeviceKeys.kt`, `crypto/SecureStore.kt`, `offline/OfflineBundle.kt` l.31-54 |
| Signature des octets envoyés, nonce neuf au rejeu, synchro d'horloge par l'en-tête `Date` | R | `ApiClient.kt` l.380-445 |
| `X-App-Id` + `User-Agent: vpn-android` + `Accept: application/json` sur **toutes** les requêtes (commit 339597d) | R — un seul point d'envoi `send()` pose l'en-tête, y compris pour challenge et enrôlement | `ApiClient.kt` l.421-426 |
| Le rideau ne gêne pas l'app (Accept JSON, pas `text/html`) | R | `lib/decoy.ts` l.65 |

### 10.3 Jonctions une à une (ce que l'app appelle ↔ ce que l'API expose)

| Appel Android (`ApiPaths`) | Route API | État |
|---|---|---|
| `POST /v1/devices/challenges`, `POST /v1/devices/enroll` | `devices.ts` l.98, l.125 | R (formes alignées ; e2e serveur en TS) |
| `POST /v1/auth/register` | `auth.ts` l.86-100, l.419 | **M16 : l'app n'envoie pas `phone`**, obligatoire depuis D53 → `422` à toute inscription (`ApiClient.kt` l.513-520) |
| `POST /v1/auth/login` | `auth.ts` l.102-110, l.505 | **M16 : l'app n'envoie pas `appId`**, obligatoire depuis D53 → `422` à toute connexion (`ApiClient.kt` l.231-232, l.522) |
| `POST /v1/auth/refresh`, `/logout` | `auth.ts` l.546, l.630 | R |
| `GET /v1/me`, `GET /v1/me/subscription` | `me.ts` l.301, l.338 | R (champs `entitlement`, `device`, `devicesUsed`, `devicesLimit` présents des deux côtés) |
| `GET/DELETE /v1/me/devices`, `POST /v1/me/devices/current/activate` | `devices.ts` l.219, l.234, l.259 | R |
| `GET /v1/apps/:appId/plans` | `catalog.ts` l.19 (`{ app, items }`) | R |
| `POST /v1/orders`, `GET /v1/orders/:id?refresh=1` | `orders.ts` l.137, l.168 | R ; l'app réconcilie au retour (`AppRoot.kt` l.153) — seul chemin d'activation tant que M10 n'est pas corrigé |
| `GET /v1/configuration-bundles/current` + `If-None-Match` | `bundle.ts` l.298 | R ; déchiffrement local `DeviceEnvelope.open` (`ApiClient.kt` `fetchBundle`) ; voir M6 |
| `POST /v1/me/telemetry` | `telemetry.ts` l.109 | **M17 : aucun appel côté app** (pas de chemin dans `ApiPaths`, aucun fichier ne contient « telemetry ») |
| `POST /v1/offline-bundles/:id/consumed` | `offline.ts` l.64 | M : jamais appelé (défaut d'observation, déjà noté dans `offline-bundle`) |

### 10.4 Cycle de vie de la connexion (VpnService)

| Point | État | Source | Manque |
|---|---|---|---|
| Service au premier plan, consentement `VpnService.prepare`, `onRevoke`, TUN `0.0.0.0/0` | R | `VpnTunnelService.kt` l.72-160, l.254-267 | — |
| Reconnexion préventive à `maxSessionSeconds − 60` (D25) | R | `SingBoxConfig.kt` l.263 ; `VpnTunnelService.kt` l.277-290 | — |
| **Échéance unique = le plus tôt des nœuds** | **M18** | `SingBoxConfig.kt` l.255 (`usable.minOf { it.third }`) ; `VpnTunnelService.kt` l.294-307 vide le coffre et affiche `SUBSCRIPTION_EXPIRED` à cette échéance | Contraire à D49 et D67 : au premier nœud de lab mort (≤ 4 h 30), l'app efface toute la liste et annonce un abonnement expiré. `rightsExpiresAtMs`/`nextConfigExpiryMs` n'existent nulle part. |
| Rafraîchissement du bundle par le service | **M** | le service ne fait aucun appel API ; seule l'UI tire le bundle (`AppRoot.kt` l.126-145) | Couvert par la solution de M18 |
| Bascule `selector` + `urltest` sing-box (D60) | R | `SingBoxConfig.kt` l.97-110, l.205 | — |
| Sonde 60 s à travers le tunnel + `selectOutbound` après 2 échecs (D70) | **M19** | `LibboxTunnelEngine.measureDelayMs` et `selectOutbound` existent mais **n'ont aucun appelant** | Sans producteur, le verdict `down` (D50/D63) ne reçoit jamais de rapport |
| Télémétrie en lots de 20, réinjection ≤ 200, backoff (D64) | **M17** | absent | idem |
| `NO_CONNECTION` = bandeau, pas écran plein (D61) | R partiel | `AppRoot.kt` l.181 mappe `NO_CONNECTION → Blocked.OFFLINE` ; `HomeScreen.kt` l.507 rend un état ; non vérifié visuellement | — |
| Un bundle vide n'écrase pas la liste locale (D61) | **M20** | `AppRoot.kt` l.138-140 : `vault.save(bundle.payload)` sans condition ; `ApiClient.kt` l.347-349 le propage volontairement | un `200` à liste vide efface les configurations locales |
| Import du fichier hors-ligne | M | `OfflineBundle` instancié (`VpnApplication.kt` l.51) mais aucun point d'entrée UI ; son KDoc dit encore « aucune route serveur ne produit ce fichier » (faux depuis `admin.ts` l.1174) | P14 |

## 11. Ce qui reste incertain

- Comportement de Fastify sous Vercel (corps brut, `req.url`, rate-limit) : aucun déploiement.
- Champs exacts des réponses Fapshi `initiate-pay` / `payment-status` / `payout`.
- Postgres réel, verrou consultatif et pooler.
- Tunnel réel sur arm64.
- Le dashboard Next.js (`apps/dashboard/`) : hors périmètre, non lu.
