# Audit API — socle, config, schéma, contrats, tests

Périmètre lu : `apps/api/src/{app,server,config,db,schema,openapi}.ts`, `apps/api/src/http/{contracts,schemas}.ts`, `packages/contract/src/index.ts` (structure), `apps/api/package.json`, `apps/api/test` (structure + `support.ts`, `admin.test.ts` en tête). Lecture seule. Aucun `.env` ouvert.

## 1. Verdict

Le socle est sain et volontairement simple : un seul `buildApp` testable (app.ts:44), une base PGlite en dev/test et Postgres en prod sur le même SQL (db.ts:35-107), des tests d'intégration réels (`app.inject` + PGlite en mémoire). Trois choses bloquent le plan tel quel : (a) il n'y a **aucun versionnement de migrations**, le schéma est rejoué en entier à chaque démarrage, ce qui impose une discipline d'idempotence et rend les backfills délicats ; (b) **aucune session admin** n'existe (JWT sans ligne en base), donc « révoquer les autres sessions » demande une table ; (c) **SSE est faisable sur Cloud Run seulement** : Vercel est configuré avec `maxDuration: 60` et ne garde aucun processus, donc pas de LISTEN/NOTIFY là-bas. Rien d'incompatible avec Fastify 5.12.7 installé.

## 2. Inventaire

| Fichier | Rôle | Taille (lignes) | État |
|---|---|---|---|
| `apps/api/src/app.ts` | Construction Fastify, parseur JSON brut, erreurs, CORS, rate limit global, preHandler d'accès, maintenance paresseuse, sondes, enregistrement des routes | 300 | solide |
| `apps/api/src/server.ts` | Entrée process : listen, `setInterval` 60 s (balayage pool, rappel, purge), arrêt SIGTERM/SIGINT | 110 | solide, mais point unique pour les tâches de fond |
| `apps/api/src/config.ts` | Lecture `process.env`, garde-fou prod, valeurs par défaut | 215 | solide ; défauts à revoir (voir §4 point 6) |
| `apps/api/src/db.ts` | Pool `pg` (max 10), transaction, PGlite pour dev/tests, verrou consultatif de migration | 114 | solide ; pas de connexion dédiée LISTEN |
| `apps/api/src/schema.ts` | SCHEMA_SQL unique : CREATE/ALTER idempotents, règles d'append-only sur `audit_log` | 554 | solide, mais rejoué à chaque boot (risque §6) |
| `apps/api/src/openapi.ts` | Swagger dynamique + Scalar, transform depuis ROUTE_DOCS | 113 | solide |
| `apps/api/src/http/contracts.ts` | Table ROUTE_DOCS (doc OpenAPI seule, jamais validateur) | 979 | solide, couvert à ~64 routes |
| `apps/api/src/http/schemas.ts` | Fragments JSON Schema partagés (erreur, sécurité, réponses communes) | 90 | solide |
| `packages/contract/src/index.ts` | Types de fil partagés (47 exports) | 377 | partiel : utilisé par l'API, pas par le dashboard |
| `apps/api/package.json` | Scripts et dépendances | 36 | solide |
| `apps/api/test/support.ts` | Env de test, helpers d'appareil signé, enrôlement, abonnement | ~270 | solide |
| `apps/api/test/*.test.ts` | 18 fichiers de test (structure seule) | 18 | solide |

Constats cités :
- Pas de `schema_migrations` ni de table de version : `grep` de `schema_version|migration` dans `schema.ts` ne donne que des commentaires (schema.ts:375-383).
- Runner : `node --test --import tsx test/*.test.ts` (apps/api/package.json, script `test`).
- Versions réelles installées (node_modules) : fastify 5.12.7, pg 8.23.1, @fastify/cors 10.1.0, @fastify/rate-limit 10.3.0.
- Dépendances **absentes** : aucun plugin SSE, aucun `@fastify/compress`, aucun client LISTEN (`grep "text/event-stream|LISTEN|hijack"` sur `apps/api/src` : aucun résultat ; seul `setInterval` apparaît, server.ts:77).

## 3. Ce qui sert le plan

- **Parseur JSON brut** : `app.addContentTypeParser` (app.ts:57-70) garde `req.rawBody`. Indispensable pour les signatures d'appareil. À conserver.
- **Erreur unique** : `setErrorHandler` (app.ts:74-102) + `ApiFailure` (lib/errors.ts). Toute nouvelle route admin passe par `fail.validation`, `fail.forbidden`, etc. Le plan (écran d'erreur, 403 vs 404) en dépend déjà.
- **Garde d'accès centralisée** : preHandler (app.ts:177-218) — clé `X-Access-Key` sur tout `/v1/admin` (app.ts:192), pour R1 (mot de passe forcé) on ajoute un contrôle là ou dans `requireAdmin`, pas ailleurs.
- **Vérification du rôle en base à chaque requête** : `requireAdmin` (lib/auth.ts:198-215) relit `admin_users` et `community_memberships`. C'est le point d'accroche naturel pour `must_change_password` et pour la révocation de session.
- **Routes admin déjà structurées** : `registerAdminRoutes` (routes/admin.ts:707), `parseBody` zod (routes/admin.ts:49-57), audit `appendAudit` (routes/admin.ts:445). Modèle à copier pour les nouvelles routes (onboarding, forfaits, builds).
- **Probes et CORS** : /healthz et /readyz (app.ts:270-280) ; CORS lit `env.allowedOrigins` (app.ts:118-137).
- **OpenAPI dynamique** : `documentationTransform` (openapi.ts:12-31) enrichit sans valider : aucun risque de casser la réponse.
- **Idempotence du schéma** : tout le bloc « additif » (schema.ts:375-553) est déjà écrit en `IF NOT EXISTS`.
- **Tests** : `buildApp` + `app.inject` + PGlite `memory://` (test/support.ts:1-33, test/admin.test.ts:30-36).

## 4. Écarts avec le plan

**1. Mot de passe forcé (R1).**
- `admin_users` (schema.ts:111-121) n'a ni `must_change_password` ni `password_changed_at`.
- `requireAdmin` (lib/auth.ts:198-215) ne contrôle aucun drapeau : il faut ajouter le contrôle ici, avant toute route métier.
- Le plan demande aussi que les admins **déjà en prod** soient forcés : c'est un backfill. Or SCHEMA_SQL est rejoué à chaque boot (db.ts:77) : un `UPDATE ... SET must_change_password = true` sans garde réarmerait le drapeau à chaque démarrage. Il faut une garde (cf. §5).
- Login par email **ou** WhatsApp : `admin_users.email` est `NOT NULL UNIQUE` (schema.ts:113), pas de colonne téléphone côté admin (comparer `users.phone`, schema.ts:490-491, réservé aux utilisateurs finaux).

**2. Libre-service / onboarding (6 étapes, états de build).**
- Table `apps` (schema.ts:17-35) : `community_id text NOT NULL` avec `slug UNIQUE`, `package_name UNIQUE`. Le plan « un admin = une application » n'est pas contraint en base : rien n'empêche deux apps pour une communauté (non vérifié : à confirmer dans routes/admin.ts:738-764 sans lire le détail).
- États de build : `builds` (schema.ts:340-355) connaît `queued | running | succeeded | failed` (packages/contract/src/index.ts:18) ; le plan ajoute `brouillon | demandé | refusé | en cours | publié | échec`. Écart de vocabulaire et de transitions.
- Motif de refus : aucune colonne `reject_reason` observée dans la liste des colonnes `builds` ajoutées (schema.ts:536-540) — `(non vérifié)` sur la table entière.

**3. Guide par rôle, avancement serveur.** Aucune table d'onboarding/progression trouvée (grep `onboarding|progress` sur `apps/api/src` non lancé en détail — `(non vérifié)`).

**4. Forfaits limité / limité+nuit, 3x-ui, nœuds éphémères.**
- `plans` (schema.ts:123-137) : `price_xaf`, `duration_days`, `device_limit`, `endpoint_tier` (schema.ts:480-482). Aucune colonne « quota data », « plage de nuit », « famille de forfait ».
- `endpoints` (schema.ts:178-211) porte `tier` (`free-labs | paid-gcp`, schema.ts:471-473) et `expires_at` : c'est le modèle à étendre pour les nœuds Cloud Run de 4 h.
- Aucun compteur de trafic par abonnement n'apparaît dans les tables de ce périmètre (`usage_daily`, schema.ts:506-517, est le candidat à lire : hors tranche).

**5. Prix plancher.** `communities.commission_bps` (schema.ts:6-16, contrainte 0-3000 schema.ts:452-455) est le seul levier de marge. Aucun coût/Go, coût par plage, prix plancher en base.

**6. Telegram : rappels 15 min avant, relance 5 min, plusieurs destinataires.**
- `config.ts:150` : `deployWarnMinutes` vaut **30** par défaut (plan : 15).
- `config.ts:148` : `chatId` est **unique** (`TELEGRAM_CHAT_ID`) : le plan demande plusieurs destinataires.
- Pas de relance de retard : `checkPoolExpiry` (services/poolWatch.ts:34) est un rappel unique, pas une boucle 5 min (non vérifié dans le corps de la fonction).

**7. Dashboard : cache client, SSE d'invalidation, présence.**
- Aucune route SSE, aucun `LISTEN` (absence confirmée, voir §2). Entrée à créer : nouvelle route `GET /v1/admin/events` (ou `/v1/admin/stream`).
- Présence : aucune table ni route (`grep presence` non lancé — `(non vérifié)`).
- Le `preHandler` (app.ts:192-199) exige l'en-tête `X-Access-Key` : un `EventSource` natif **ne peut pas** envoyer d'en-tête (voir §5, SSE auth).

**8. Réseau (noms génériques, ajout par lien VLESS).** Le modèle `endpoints` a déjà `ws_host`, `client_pool` (schema.ts:474-478) et `lib/vless.ts` existe (parsing, hors tranche). Pas de « nom générique aléatoire » côté API (non vérifié).

**9. App Android (feuille Activité, ping, aide WhatsApp).** Hors de ma tranche (`apps/api/src/routes/telemetry.ts`, non lu). Rien à déclarer ici, sauf : `ALLOWED_ORIGINS` et `allowedHeaders` (app.ts:121-134) ne couvrent pas `last-event-id` ni `cache-control` ; à ajouter si le dashboard passe en SSE (`Last-Event-ID` pour reprise).

## 5. Structure de code proposée

### Q1 — Migrations, convention et « ne pas casser la prod »

Constat : pas de versionnement. SCHEMA_SQL (schema.ts:5-554) est exécuté **en un seul `client.query`** à chaque démarrage (db.ts:73-81), sous verrou `pg_advisory_lock(727_001)` avec `lock_timeout = 10s`. Deux conventions coexistent :
- Création : `CREATE TABLE IF NOT EXISTS` (ex. schema.ts:397, 547).
- Ajout de colonne : `ALTER TABLE x ADD COLUMN IF NOT EXISTS` (ex. schema.ts:390, 442-443, 536-540).
- Index : `CREATE [UNIQUE] INDEX IF NOT EXISTS` (ex. schema.ts:489, 546).
- Changement de contrainte : `DROP CONSTRAINT IF EXISTS` puis `ADD CONSTRAINT` (schema.ts:452-454, 472-473, 481-482) — **non idempotent sous charge** (voir §6).
- Données : `UPDATE ... WHERE <condition qui devient fausse>` (schema.ts:391-393, 452).
- Règle append-only sur audit_log : `CREATE OR REPLACE RULE` (schema.ts:458-463).

Proposition pour les nouveaux besoins, à écrire **à la fin** de SCHEMA_SQL (après schema.ts:553, avant le backtick de fermeture ligne 554), dans un bloc commenté « D70+ » comme les précédents :

```sql
-- R1 : mot de passe forcé. Additif, défaut sûr (false = aucun effet sur l'existant).
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS password_changed_at timestamptz;

-- Backfill une seule fois : la garde password_changed_at IS NULL ne se rejoue pas
-- après un changement (le compte n'est plus « jamais changé »).
-- (ATTENTION : voir §6 — à n'écrire que si la colonne vient d'être créée,
--  sinon il faut une table schema_migrations.)

-- Sessions admin (révocation des autres sessions, « Mon compte »)
CREATE TABLE IF NOT EXISTS admin_sessions (
  id            text PRIMARY KEY,
  admin_id      text NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz,
  expires_at    timestamptz NOT NULL,
  revoked_at    timestamptz,
  user_agent    text,
  ip            text
);
CREATE INDEX IF NOT EXISTS admin_sessions_admin_idx ON admin_sessions(admin_id);
```

Pour le backfill sûr, la **recommandation** est d'introduire une table de version (`schema_migrations(id text primary key, applied_at timestamptz)`) et d'exécuter les migrations *données* une seule fois via `INSERT ... ON CONFLICT DO NOTHING RETURNING id` dans la transaction (db.ts, après SCHEMA_SQL). Ce n'est pas présent aujourd'hui : c'est une création.

Créneaux de nuit, tarifs, forfaits :
- `night_slots(id, endpoint_id, starts_at, ends_at, status, reminded_at)` — à créer, lié à `endpoints` (schema.ts:178).
- Plages au paiement : `orders` (schema.ts:139-159) à étendre par `slot_window text CHECK (slot_window IN ('20-24','00-04','20-04'))` ajouté en `ADD COLUMN IF NOT EXISTS`.
- Prix plancher : colonnes `cost_per_gb_xaf integer`, `night_cost_xaf integer`, `margin_bps integer` sur `communities` (schema.ts:6-16) ou une table `pricing_settings`.

### Q2 — SSE et LISTEN/NOTIFY

**SSE dans Fastify 5.12.7.** Faisable via `reply.hijack()` (présent : `fastify/lib/reply.js:134`), puis écriture directe `reply.raw.writeHead(200, {...})`. Points à traiter :
- CORS : le plugin pose ses en-têtes dans `onRequest`, mais `hijack` court-circuite l'envoi Fastify ; il faut **répéter** `Access-Control-Allow-Origin` (et Vary) dans `writeHead`. `(non vérifié : à tester dans app.inject ou via un vrai socket)`.
- Auth : `EventSource` ne transmet ni `Authorization` ni `X-Access-Key`. Solution proposée : flux via `fetch` + `ReadableStream` côté dashboard (en-têtes complets), jamais un jeton dans l'URL (il finirait dans les journaux Cloud Run).
- Keep-alive : envoyer `: ping\n\n` toutes les 25 s (aucun `setInterval` SSE aujourd'hui).
- Compression : pas de `@fastify/compress` dans `package.json`. Rien n'est compressé aujourd'hui ; ne pas en ajouter pour ce flux.
- Timeouts : aucun `requestTimeout`/`connectionTimeout` explicite dans app.ts:47-53 (défauts Fastify, non relus). `reply.hijack` retire la limite de handler (comportement décrit dans reply.js:136).
- Vercel : `apps/api/vercel.json:6-8` fixe `maxDuration: 60`. **Le flux SSE ne peut pas vivre sur Vercel.** Il faut une instance Cloud Run (ou le serveur dédié).
- Proxy : Cloud Run ne tamponne pas les réponses streamées (non vérifié). Dokku/nginx : `knowledge/10-infrastructure/aura-vps-dokku-test.md` existe (hors tranche, non lu) : il faudra `proxy_buffering off` et `proxy_read_timeout` élevé si Dokku est en façade.

**LISTEN/NOTIFY avec le pool actuel.** Oui, une **connexion dédiée est nécessaire** : `pool.query` rend la connexion après chaque requête, donc aucune notification n'est reçue. Proposition :
- Un `pg.Client` séparé, hors pool, créé dans `createDb` (db.ts) pour les seuls canaux `LISTEN`.
- Un seul listener par instance, fan-out vers un `Set` de connexions SSE en mémoire.
- Reconnexion avec backoff sur `error`/`end`.
- Le pooler transaction-mode ne conserve pas LISTEN (même raison que db.ts:69-71) : il faut l'URL directe.
- Coût : 1 connexion de plus par instance Cloud Run (le pool est à 10, db.ts:37). `(non vérifié : limite de connexions du Postgres)`.
- En tests : PGlite expose `listen(channel, cb)` (node_modules/@electric-sql/pglite/dist/pglite-Csk75SCB.d.ts:493). Un test mono-instance est donc possible sans Postgres réel ; un test multi-instance ne l'est pas.

Émission : `await db.query("SELECT pg_notify($1, $2)", ["admin_invalidate", JSON.stringify({ scope: "community", id })])` **dans la même transaction** que la mutation (db.ts:44-62 `tx`) pour ne jamais notifier une écriture annulée.

### Q3 — Contrats et partage avec le dashboard

- `http/contracts.ts` : `ROUTE_DOCS: Record<string, RouteDoc>` clé `"METHOD /v1/chemin"` (contracts.ts:90, `docFor` contracts.ts:977-979). C'est **documentation seule** : jamais un validateur (commentaire contracts.ts:1-16 et openapi.ts:8-11).
- Validation d'exécution : zod dans chaque route (`parseBody`, routes/admin.ts:49-57).
- `packages/contract/src/index.ts` : types de fil (camelCase, dates ISO). Consommé par l'API (`import type` dans `lib/errors.ts`, `routes/bundle.ts:26`, `services/endpoints.ts:2`). **Le dashboard ne l'importe pas** : `apps/dashboard/package.json:15` le déclare, aucun `from "@vpn/contract"` dans `apps/dashboard/src`. Le dashboard a ses propres schémas zod (`apps/dashboard/src/server/services/communities/communities.schema.ts:15`).
- `packages/contract/package.json` déclare `"./openapi.json"` en export, **fichier absent** du package (listing : dist/, src/, package.json, tsconfig.json). Le document OpenAPI réel est `apps/api/openapi.json` (listing `apps/api`).

Recette pour une nouvelle route admin (ex. `POST /v1/admin/apps/:appId/build-requests`) :
1. Ajouter le schéma zod et le type de fil dans `packages/contract/src/index.ts` (ex. `export interface BuildRequest`), **sans** modifier les types existants.
2. Dans `routes/admin.ts`, dans `registerAdminRoutes` (routes/admin.ts:707) :
```ts
app.post<{ Params: { appId: string } }>(`${PREFIX}/apps/:appId/build-requests`, async (req, reply) => {
  const admin = await requireAdmin(db, req);
  const body = parseBody(buildRequestSchema, req.body);
  // une transaction : mutation + appendAudit (routes/admin.ts:445)
  return db.tx(async (q) => { /* ... */ });
});
```
3. Ajouter l'entrée `"POST /v1/admin/apps/:appId/build-requests": { summary, tags: ["administration"], security: ADMIN_SECURITY, body, response: { 200: ..., ...COMMON_ERRORS } }` dans `ROUTE_DOCS` (contracts.ts:90), en utilisant `shape`, `str`, `int` (contracts.ts:36-49) et `ADMIN_SECURITY` (schemas.ts:83).
4. Vérifier la couverture : `ROUTE_DOCS` compte ~64 entrées pour ~65 déclarations `app.get|post|patch|delete` dans `routes/` (comptage grep, `(non vérifié)` au caractère près). Écart à combler.
5. Régénérer `openapi.json` : `pnpm --filter @vpn/api openapi` (script `openapi`, apps/api/package.json).

### Q4 — Tests

- Runner : `node --test --import tsx test/*.test.ts` (apps/api/package.json, `test`). Pas de Vitest.
- Base : PGlite `memory://` (test/support.ts:1-33 ; test/admin.test.ts:19-20 via `DATABASE_URL = "memory://"`).
- Env : posée **avant** les `await import("../src/...")` (test/support.ts:1-27 et test/admin.test.ts:8-18), car `config.ts` lit `process.env` à l'évaluation.
- Helpers : `call(method, url, as, payload)` (test/admin.test.ts:226-247) via `app.inject` ; `tokenFor(adminId)` (test/admin.test.ts:212-219) qui appelle `issueAdminToken` (lib/auth.ts:87) ; `test/support.ts` fournit `deviceClient`, `enrollDevice`, `seedApp`, `grantSubscription`, `publishEndpoint`, `closeAll` (test/support.ts:35-254).
- Modèle de test admin : `test("...", async () => { ... })` avec `assert/strict` (test/admin.test.ts:258-272 : « cross-community : 403, jamais 404 »).

Écrire un test d'une nouvelle route admin :
```ts
test("forcer le changement de mot de passe bloque les routes métier", async () => {
  const res = await call("GET", "/communities", MUST_CHANGE_ADMIN);
  assert.equal(res.status, 403);
  assert.equal((res.body as { error: { code: string } }).error.code, "PASSWORD_CHANGE_REQUIRED");
});
```
Prérequis : créer la fixture admin en base dans le bloc `before`/tête de fichier (comme `OWNER`, `ADMIN_A` dans test/admin.test.ts:40-200 — non relus en détail), puis `tokens[id] = await tokenFor(id)`.

### Q5 — Tâches de fond

- `server.ts:19` `SWEEP_INTERVAL_MS = 60_000`, `server.ts:77-81` `setInterval(...).unref()`. Dans la même tick : `sweepEndpoints` (services/endpoints.ts:528), `checkPoolExpiry` (services/poolWatch.ts:34) puis `purgeExpired` (services/maintenance.ts:40).
- `app.ts:227-256` : maintenance paresseuse à chaque requête (au plus une fois par minute et par instance) : probation des nœuds down, expiration, versements ambigus `needs_review`. C'est le seul entretien actif sous Vercel.
- Telegram : `services/telegram.ts:73` `notify(text)`, `deployReminder` (telegram.ts:109), `paymentReceived` (telegram.ts:132). Config : `config.ts:145-150`.

Brancher les nouvelles tâches :
- **Rappels de créneau (15 min avant, relance 5 min)** : nouvelle fonction `checkNightSlots(db, state)` dans `services/nightSlots.ts`, appelée dans `sweep()` (server.ts:44-67), sur le même modèle que `checkPoolExpiry`. Idempotence via `night_slots.reminded_at` (ou `reminder_count`), pas via un état mémoire, sinon un redémarrage renvoie le rappel.
- **Multi-destinataires** : remplacer `chatId` (config.ts:148) par `chatIds: string[]` (split sur `,`) ; `notify` (telegram.ts:73) boucle.
- **Lecture trafic 3x-ui** : ne pas le mettre dans `sweep()` (60 s, Cloud Run seulement) sans borner la durée : créer un job dédié `services/trafficPoll.ts`, intervalle configurable (`env.traffic.intervalSeconds`), à brancher dans `server.ts` à côté du `timer`. Côté Vercel il n'y a rien.
- Verrou : deux instances Cloud Run lanceraient le même job. Utiliser `pg_try_advisory_lock(<clé>)` sur la connexion dédiée LISTEN ou un `UPDATE ... WHERE claimed_at IS NULL` (modèle `payouts`, app.ts:247-252).

## 6. Bugs et risques

1. **Migration rejouée à chaque boot avec verrou fort** — schema.ts:452-455 : `ALTER TABLE communities DROP CONSTRAINT ... ADD CONSTRAINT` prend un `ACCESS EXCLUSIVE` à chaque démarrage à froid. Scénario : une requête longue tient un verrou sur `communities`, `lock_timeout = 10s` (db.ts:75) expire, `SCHEMA_SQL` lève une erreur, `createDb` échoue (db.ts:77), le process top-level de server.ts:36 plante → boucle de redémarrage Cloud Run. Même risque pour `ALTER TABLE endpoints/plans` (schema.ts:472-482).
2. **Backfill non idempotent** — schema.ts:391-393 et :452 sont des `UPDATE` rejoués. Pour R1 (forcer tous les admins existants), un `UPDATE admin_users SET must_change_password = true` sans garde réarme le drapeau à chaque boot, y compris après changement. Scénario : un admin change son mot de passe, redémarrage, il est de nouveau forcé.
3. **Pas de table de version** — impossible de savoir si une migration de données a déjà été jouée ; le plan a besoin de ces migrations (R1, nuit, prix).
4. **Échec de boot sous Vercel** — `db.ts:73-81` est exécuté aussi sur Vercel (`api/index.ts`) à chaque cold start : même risque que le point 1, multiplié par le nombre de fonctions.
5. **Port incohérent** — Dockerfile `EXPOSE 5000` (apps/api/Dockerfile:18) vs `config.ts:58` `PORT` défaut 8080. Sans effet si Cloud Run injecte `$PORT` (commentaire server.ts:12-13), mais trompeur pour un test local en container.
6. **Défauts Telegram** — `config.ts:150` 30 min (plan : 15) ; `config.ts:148` un seul `chatId`.
7. **Tests et PGlite** — `DATABASE_URL = "memory://"` ne couvre pas la prise de verrou `pg_advisory_lock` (db.ts:73-81 est dans la branche Postgres uniquement). Ce bloc n'est jamais exécuté en test : toute erreur de SQL de migration sur Postgres réel n'est vue qu'en prod.
8. **CORS et SSE** — `allowedHeaders` (app.ts:121-134) sans `last-event-id`, sans `cache-control` ; le flux SSE via `reply.hijack` contournera les en-têtes CORS posés par le plugin (voir §5 Q2).
9. **`onRequest` écrit en base** — app.ts:228-256 : une requête tirée au sort (la première de la minute) exécute trois `UPDATE` avant son traitement. Les erreurs sont avalées (app.ts:253-255) : sain, mais la latence de cette requête est payée par l'utilisateur.
10. **Limite de rate global** — app.ts:148-156 : 300/min par IP pour tout le monde ; l'SSE ne consomme qu'une requête, mais un dashboard qui recharge souvent peut atteindre la limite (non mesuré).

## 7. Dépendances hors tranche

- `apps/api/src/lib/auth.ts` : `requireAdmin` (198-215) et `issueAdminToken` (87) — pour la session admin et R1. À lire en entier avant de toucher.
- `apps/api/src/routes/adminAuth.ts:72` (`POST /v1/admin/auth/login`) : login par email uniquement à ce stade ; WhatsApp non vérifié.
- `apps/api/src/routes/admin.ts:738-764` (création de communauté) et `:1074` (création d'admin) : pour l'écart onboarding « une app par admin ».
- `apps/api/src/routes/builds.ts` et `knowledge/` build pipeline : états `builds` et callbacks CI (non lus).
- `apps/api/src/services/endpoints.ts:528` (`sweepEndpoints`) et `services/poolWatch.ts:34` : corps non relus, seulement signatures.
- `apps/api/src/services/payments.ts` et `lib/fapshi.ts` : colonne de plage au paiement.
- `knowledge/10-infrastructure/aura-vps-dokku-test.md` et `aura-vps-3x-ui.md` : proxy Dokku, timeouts, 3x-ui.
- `knowledge/10-infrastructure/cloud-run-deploy-form.md` : instances, timeouts Cloud Run, concurrence, nombre max d'instances (non lu).
- `apps/dashboard` : pourquoi `@vpn/contract` est déclaré mais inutilisé ; génération de client ou pas (non lu au-delà de `communities.schema.ts:15`).
- Tests `apps/api/test/*.test.ts` (18 fichiers) : contenu non lu, seulement la structure et `admin.test.ts:1-36, 212-272`.

## 8. Non vérifié

- Comportement réel de `reply.hijack()` avec `@fastify/cors` (en-têtes sur le flux) : non exécuté.
- Timeouts Fastify par défaut (`connectionTimeout`, `requestTimeout`) : non relus dans la doc installée.
- Cloud Run : buffering des réponses streamées et timeout de requête configuré : non vérifié (fichier knowledge non lu).
- Limite de connexions Postgres (Cloud SQL / pooler) : non vérifié.
- Comptage exact des routes : 64 entrées ROUTE_DOCS (grep `^  "(GET|POST|PATCH|DELETE|PUT) `, contracts.ts) vs 65 déclarations dans `routes/*.ts` (grep) : la différence exacte n'est pas identifiée.
- `checkPoolExpiry` : pas de relance 5 min confirmée dans son corps.
- Présence (qui est connecté) : aucune trace dans la tranche, pas de recherche globale faite.
- Colonne « motif de refus » pour les builds : non trouvée dans schema.ts:340-355 et :536-540 ; corps de la table non relu entièrement.
- Contenu exact de `admin.test.ts` 40-200 (fixtures OWNER, ADMIN_A…) : non relu.
- Possibilité de LISTEN sur PGlite en tests multi-canaux : seule la signature est vérifiée (d.ts), pas le comportement.
