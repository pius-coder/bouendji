---
id: api-routes
title: Routes API — écrit, à écrire
tags: [backend, fastify, routes, ingest]
status: decided
updated: 2026-10-20
related: [endpoint-lifecycle, ingest-auth]
---

## Écrit

`lib/crypto.ts`, `lib/auth.ts`, `lib/errors.ts`, `lib/mailer.ts`,
`lib/fapshi.ts`, `lib/vless.ts`, `db.ts`, `schema.ts`, `config.ts`,
`services/endpoints.ts`.

## Reste à écrire (dans cet ordre)

1. `routes/internal.ts` — ingestion.
2. `app.ts` — parseur JSON qui préserve `req.rawBody`, enveloppe d'erreur,
   `/healthz`.
3. `server.ts` — écoute, balayage `sweepEndpoints` toutes les 60 s, arrêt
   propre.
4. `test/ingest.test.ts` — idempotence, pas d'extension de TTL, `409` sur
   expiré, `ready`, heartbeat, `401`, drain, aller-retour d'enveloppe.
5. Routes publiques : bundle, me, devices, orders.
6. Dashboard.

## Contrat d'ingestion

```
POST /v1/internal/endpoints/register
  { deployment_key, public_host, port?, sni?, ws_path?, region?, ttl_seconds? }
  → { endpoint_id, uuid, ws_path, expires_at, status, pool_revision }

POST /v1/internal/endpoints/ready
  { deployment_key }
  → { status, pool_revision }

POST /v1/internal/endpoints/heartbeat
  { deployment_key, latency_ms?, healthy? }
  → { status, expires_at }

GET  /v1/internal/pool          (diagnostic)
```

Auth : `Authorization: Bearer <ENDPOINT_INGEST_SECRET>`, comparaison à temps
constant. Secret vide → **503**, jamais d'ouverture.

## Pièges

- Le corps brut doit être conservé pour la signature d'appareil (parseur
  personnalisé sur `application/json`).
- Les erreurs suivent `{ error: { code, message, details?, retryAfter? } }`.
- Le chemin WS est généré côté serveur, jamais accepté du client.
- Un `register` sur une clé expirée renvoie `409`, pas une résurrection.
