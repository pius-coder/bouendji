# Journal — api-core

## 2026-10-20T13:26:32Z · Création
- fait: charte créée
- portée: Écrire les routes d ingestion, app.ts, server.ts et les tests de apps/api, puis les faire passer au vert. Ne tranche aucune décision produit ouverte (TTL, mode d authentification) : les rendre configurables.
- etat: actif
- suite: lecture des nœuds liés

## 2026-10-20T13:32:03Z · Lecture charte, noeuds et code existant

- fait: Lu api-routes, endpoint-lifecycle, ingest-auth, cloud-run; lu config.ts, schema.ts, db.ts, services/endpoints.ts, lib/{auth,errors,crypto,vless}.ts; pnpm install fait (108 paquets)
- etat: ok
- suite: ecrire routes/internal.ts

## 2026-10-20T13:56:12Z · app.ts et server.ts

- fait: app.ts : parseur JSON qui preserve req.rawBody, enveloppe { error: { code, message, details, retryAfter, requestId } }, /healthz sans DB, /readyz avec SELECT 1; server.ts : PORT/HOST, sweep 60 s unref, arret SIGTERM/SIGINT avec delai de 15 s
- etat: ok
- suite: tests
- fichiers: apps/api/src/app.ts, apps/api/src/server.ts

## 2026-10-20T13:56:12Z · Routes d'ingestion ecrites

- fait: apps/api/src/routes/internal.ts : register/ready/heartbeat/pool; auth bearer timingSafeEqual, secret vide => 503; ws_path jamais accepte du client; logique deleguee a services/endpoints.ts (aucune duplication)
- etat: ok
- suite: app.ts et server.ts
- fichiers: apps/api/src/routes/internal.ts

## 2026-10-20T13:56:19Z · Piege Fastify : hook synchrone = requete bloquee

- fait: preHandler sync (retour void) ne rend jamais la main : fastify 5.12.7 lib/hooks.js:242-249 n'enchaine que sur promesse ou next(). Corrige en async. Corrige aussi 2 erreurs de typage dans db.ts (one<T>, tx<T>), sans changement de comportement. pnpm install exige --config.strict-dep-builds=false (ERR_PNPM_IGNORED_BUILDS esbuild)
- etat: ok
- suite: ecrire test/ingest.test.ts

## 2026-10-20T13:56:19Z · Tests d'ingestion : 16/16 verts

- fait: pnpm --filter @vpn/api test => 16 tests, 16 pass, 0 fail, EXIT=0. Couvre idempotence, non-extension du TTL, 409 sur cle expiree, ready/une seule revision, heartbeat sans bump, 401/503, drain a -900 s puis expired, aller-retour VLESS, enveloppe scellee, rawBody. Serveur demarre sur PORT et repond en HTTP reel (healthz/readyz/register 200, pool sans jeton 401). Typecheck : reste 1 erreur hors perimetre (lib/fapshi.ts importe services/mockPayments.js inexistant)
- etat: ok
- suite: rapport + cloture

## 2026-10-20T13:56:40Z · CLÔTURE
Routes internes + app + server + 16 tests verts (EXIT=0). 409 sur cle expiree, drain a -900 s, secret vide => 503, rawBody preserve. 2 corrections documentees : hook Fastify sync (blocage total) et typage db.ts. Reste non verifie : SIGTERM sous Windows, chemin pg/Postgres, typecheck bloque par lib/fapshi.ts (mockPayments absent, hors perimetre).
