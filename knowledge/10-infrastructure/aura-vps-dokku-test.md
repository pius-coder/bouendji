---
id: aura-vps-dokku-test
title: Environnement de test sur aura-vps — API + endpoint sous Dokku
tags: [vps, dokku, api, endpoint, test, tls]
status: verified
updated: 2026-10-24
related: [aura-vps-3x-ui, vercel, api-routes, brand-build]
---

Environnement de **test** (pas de production) monté le 2026-10-24 pour faire
tourner le parcours client complet sur le Pixel 8. Paiement **simulé**.

## Ce qui tourne (vérifié le 2026-10-24)

| App Dokku | Image | Domaine | État |
|---|---|---|---|
| `vpn-api` | `vpn-api:1` (`apps/api/Dockerfile`, construite sur le VPS) | `vpn-api.198.251.65.186.sslip.io` | `Server listening` sur 5000, catalogue public répond |
| `vpn-node1` | `vpn-node:2` (`infra/endpoint`, construite sur le VPS) | `vpn-node1.198.251.65.186.sslip.io` | `register` → `ready : status=active`, heartbeat 45 s |
| `vpn-db` | `dokku postgres` 18.6 | interne | lié à `vpn-api` (`DATABASE_URL`) |

- `vpn-api` : `NODE_ENV=development`, `PAYMENT_PROVIDER=mock`,
  `ENDPOINT_AUTO_APPROVE=true`. Secrets générés **sur le VPS** (`openssl rand`),
  jamais affichés : `MASTER_KEY`, `JWT_SECRET`, `ENDPOINT_INGEST_SECRET`,
  `DASHBOARD_ACCESS_KEY`, `HEALTHCHECK_KEY`.
- Seed : communauté `bouendji` (`9872c0b4-…`), app `bouendji-android`
  **`f3d5ee21-55f5-4885-bf6a-ba3af77ec70b`**, owner `admin@example.com`. Mot de
  passe owner : `/root/vpn-api-admin.txt` (0600), jamais recopié.
- Forfait de test `test-1m` : 5 000 XAF / 30 jours / 1 appareil — **prix
  provisoire** (O12 ouverte), créé via `POST /v1/admin/apps/:appId/plans`.
- `vpn-node1` : `ENDPOINT_TTL=2592000` (30 j, = `ENDPOINT_MAX_TTL` par défaut),
  `API_URL` en http vers l'origine locale (le trafic d'ingestion reste sur l'hôte).
- Marque Android de test : `tools/brands/aura-test.json`, package
  `cm.bouendji.vpn.test`. `supportUrl` **provisoire** (origine de l'API, pas un
  contact) : à remplacer (D19).

## TLS

`dokku letsencrypt` activé le 2026-10-24 sur `vpn-api` et `vpn-node1`, avec
l'e-mail de l'utilisateur (accord donné en chat). Cron de renouvellement ajouté.
`https://vpn-api…/v1/apps/:appId/plans` → 200, `ssl_verify_result=0`.

## Pièges relevés

- Le garde-fou de production (`config.ts`) exige `PAYMENT_PROVIDER=fapshi` et
  ses secrets : sans clés Fapshi, seul `NODE_ENV=development` démarre.
- `/v1/admin/*` exige `x-access-key: $DASHBOARD_ACCESS_KEY` **avant** le jeton
  Bearer, y compris pour `auth/login`.
- `/v1/internal/*` exige `X-Ingest-Timestamp` (D56, écart ≤ 120 s) hors tests.
  `infra/endpoint/entrypoint.sh` ne l'envoyait pas : **aucun endpoint ne pouvait
  s'enregistrer** hors tests. Corrigé le 2026-10-24 (`post_json`).
- `tools/inject-brand.mjs` cherchait `const val accent: String?` — non valide en
  Kotlin (pas de `const` nullable) : l'injecteur échouait pour toute marque.
  Corrigé : accepte `val` ou `const val` et garde le préfixe.
- `docker` sur le VPS demande `sudo` ; `npx tsc` ne trouve pas le TypeScript
  installé par bun → `bun run --cwd <pkg> build`.
- Sortie de `dokku postgres:create` : affiche la DSN avec mot de passe (réseau
  Docker interne seulement).

## Vérifications du 2026-10-24

- API : `node --test --import tsx test/*.test.ts` → **162 tests, 162 réussis, 0 échec**.
- APK de la marque de test : `tools/build-apk.ps1` → `OK APK produit … app-debug.apk
  (89 533 242 octets)`, 15:50.
- Pixel 8 : `adb devices` → **liste vide** (non branché ou non autorisé ce jour-là).

## Parcours client sur le Pixel 8 — VÉRIFIÉ le 2026-10-24

Journal API (`dokku logs vpn-api`) et écran (`uiautomator dump`) :

| Étape | Preuve |
|---|---|
| challenge + enrôlement signé (Keystore) | `/v1/devices/challenges` 200, `/v1/devices/enroll` 201 |
| inscription | `/v1/auth/register` 201, puis `/v1/me` 200 |
| commande | `/v1/orders` 201 |
| paiement simulé | `/pay/mock/:ref/confirm` 200 |
| vérification | `/v1/orders/:id?refresh=1` 200 → « Accès activé · paid » |
| bundle chiffré | `/v1/configuration-bundles/current` 200 puis 304 |
| tunnel | nginx `vpn-node1` : `GET /ws/<secret>` → **101** depuis l'IP opérateur |
| trafic réel | `api.ipify.org` dans Chrome, VPN actif → **198.251.65.186** (IP du VPS) |

## Défauts trouvés en route et corrigés (2026-10-24)

1. **Contrat D53 non suivi par l'app** : `register` exige `phone`, `login`
   exige `appId`. `ApiClient.kt` + champ Téléphone dans `AppRoot.kt`.
2. **Signature avec query** : `order(..., refresh=true)` passait `?refresh=1`
   à `DeviceAuth.proof`, qui refuse une query → exception locale, message
   générique. `sendSigned` signe désormais `path.substringBefore('?')`.
3. **Leurre sur les pages de paiement** : `lib/decoy.ts` renvoyait
   `/pay/mock/*` et `/pay/return/*` vers le site leurre. `/pay/` ajouté au
   BYPASS + test (`test/decoy.test.ts`, 7/7).
4. **Configuration sing-box obsolète** : `sniff` dans l'inbound, sortie
   `block`, `domain_strategy` en dial → refusés par la libbox embarquée
   (« legacy inbound fields … removed in sing-box 1.13.0 »). Migré : règles de
   route `sniff` + `hijack-dns`, plus de `block`, plus de `domain_strategy`.
5. **Tunnel monté mais aucun trafic** : `startDefaultInterfaceMonitor` était
   vide ; avec `auto_detect_interface`, sing-box n'avait aucune interface de
   sortie. Implémenté avec `ConnectivityManager` (NOT_VPN + INTERNET), comme
   `DefaultNetworkMonitor` de sing-box-for-android.
6. Journal **debug seulement** du motif d'arrêt du tunnel (`VpnTunnel`),
   UUID et `vless://` masqués.

## Restes connus

- L'écran affiche « connecté » dès que l'interface est montée, avant toute
  preuve de trafic : à rendre honnête (mesure urltest/Clash).
- Un compte neuf sans forfait voit « Votre accès a expiré » : libellé faux.
- Paiement : simulé (`NODE_ENV=development`) tant que Fapshi n'est pas branché.

## Mise à jour 2026-10-24 (soir) — design, bascule, secours, fronting

**Vérifié sur le Pixel 8 et le VPS :**

| Fait | Preuve |
|---|---|
| Bascule automatique | `vpn-node2` (Paris) arrêté à 17:22:23 → trafic par Francfort en < 30 s ; bandeau « Votre choix ne répondait plus — bascule automatique vers Francfort » + « Mon choix » |
| Plus aucun serveur | `vpn-node1` arrêté aussi → « Aucun serveur » + bandeau « Aucun serveur disponible… Nouvel essai automatique » + « Contacter » ; nœuds relancés ensuite |
| Fichier de secours `.bvpn` | émis par `POST /v1/admin/devices/:id/offline-bundles` (201, 1 831 o, aucun `vless://`), importé via Paramètres › Importer → « 2 serveurs ajoutés » ; `POST /v1/offline-bundles/:id/consumed` → 200 |
| Clé de signature hors-ligne | Ed25519 tirée **sur le VPS** dans l'image API ; privée dans `OFFLINE_BUNDLE_SIGNING_KEY` (jamais sortie du VPS), publique épinglée dans `tools/brands/aura-test.json` |
| Nœuds manuels (fronting) | `POST /v1/admin/endpoints/manual` → 201, 8 lignes `manual:cloudrun-uswest1:*` (Oregon, 5 h) ; depuis le VPS, poignée WS via `192.179.18.100` + SNI Google + Host `*.run.app` → **101** |
| API | `node --test` → **171 / 171** |

**Infra :** `vpn-node2` (Paris, `fr`) ajouté ; `vpn-node1` renommé Francfort (`de`).
`K_SERVICE`/`K_REVISION` posés pour une `deployment_key` stable. `API_URL` des
nœuds en **https** : depuis le TLS, le http répond 301 et `entrypoint.sh` ne suit
pas les redirections (les nœuds bouclaient sur `HTTP 301`).

**Pièges :** appels admin depuis le VPS : `curl --resolve <domaine>:443:127.0.0.1
https://…` (le http local redirige). Le Pixel 8 décroche de l'USB par
intermittence : attendre 3 `adb devices` stables avant d'agir.
