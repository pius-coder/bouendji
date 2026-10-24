---
id: api-routes
title: Routes API — implémentation et documentation
tags: [backend, fastify, routes, ingest]
status: open
updated: 2026-10-23
related: [endpoint-lifecycle, ingest-auth]
---

## État des routes

Le backend API décrit dans `AGENTS.md` est implémenté : routes internes,
authentification, appareils, bundles, profil/abonnement, catalogue,
commandes/paiements, administration, callbacks de build et mode hors ligne.
Les tests unitaires et le parcours E2E API sont présents dans `apps/api/test/`.
Ce nœud suit les contrats OpenAPI ; le dashboard web est un chantier séparé.

Reste à vérifier lors du travail suivant : essais du Playground sur un serveur
avec configuration réelle, notamment la preuve d'appareil, les secrets
d'ingestion/admin et le checkout mock. Cette note ne prétend pas que ces appels
ont été exécutés dans cette session.

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

## Documentation OpenAPI — état du 2026-10-23

`apps/api/src/http/contracts.ts` est la source des descriptions et schémas.
`apps/api/src/openapi.ts` les applique dans `@fastify/swagger` par `transform`
au seul document généré, sans les ajouter aux validateurs/sérialiseurs Fastify.
Scalar et `/openapi.json` consomment le même document ;
`apps/api/src/scripts/emit-openapi.ts` le régénère dans le dépôt.

Vérification du 2026-10-23 : `pnpm --filter @vpn/api typecheck` termine sans
erreur et `pnpm --filter @vpn/api openapi` génère le document. Analyse de
`apps/api/openapi.json` : 64 opérations, chacune avec résumé, description et
réponses ; 27 corps JSON documentés ; 59 opérations avec exigences de
sécurité ; les trois routes navigateur du mock sont documentées en `text/html`.
Les paramètres de chemin,
querystrings, champs, formats, codes de statut et enveloppes d'erreur sont
définis dans les contrats. Le compteur de corps ne comprend pas les actions
sans payload ni les lectures GET. Les paramètres et schémas sont publiés pour
le Playground Scalar et les exemples de requêtes peuvent être essayés avec les
authentifications configurées.

Contrôle navigateur le même jour : `/openapi.json` sur `localhost:8080` renvoie
bien le schéma `application/json` de `GET /healthz` (200, champs `status` et
`uptime`) et Scalar affiche son exemple JSON. La capture précédente montrait
l'ancienne description et l'ancien « No Body » ; recharger `/reference/`
actualise l'interface avec le document courant.

La preuve d'appareil utilise `X-Device-Timestamp` en millisecondes,
`X-Device-Nonce`, `X-Device-Signature` en base64 et, après enrôlement,
`X-Device-Token`. La chaîne signée est METHOD, PATH, SHA-256 du corps brut,
timestamp et nonce, séparés par LF ; la dérive tolérée est de ±120 secondes.
Les routes authentifiées combinent le JWT mobile, le jeton d'appareil et cette
preuve. Inscription/connexion exigent le jeton d'appareil et la preuve signée.
L'enrôlement initial signe la requête avec la clé publique fournie, sans jeton
préalable ; le challenge public n'est pas une authentification. L'administration
exige le JWT `vpn-admin` et `X-Access-Key`. Ingestion et callback de build ont
des Bearer secrets distincts.

Audit d'accès 2026-10-23 : 5 opérations n'ont aucune exigence OpenAPI de
sécurité : challenge appareil et catalogue public, ainsi que les trois routes
mock disponibles seulement avec `PAYMENT_PROVIDER=mock`, configuration refusée
en production. Le webhook fournisseur exige désormais `X-Webhook-Secret` en
production, `FAPSHI_WEBHOOK_SECRET` est obligatoire au démarrage et le statut
reste revérifié chez Fapshi. Les sondes exigent `X-Health-Check-Key`, avec
`HEALTHCHECK_KEY` obligatoire en production. Les groupes admin, mobile et
internes sont décrits dans `20-backend/admin-access-flows`.

`pnpm --filter @vpn/api test` après D77 : **162 passés, 0 échec**. Le parcours
achat/mobile et le nouveau parcours admin utilisent HTTP réel ; les tests BOLA
et rôles passent par Fastify `inject`. Ce n'est pas encore un E2E navigateur du
dashboard (l'interface n'existe pas encore).

Le JSON expose un schéma d'erreur commun (`error.code`, `error.message`,
`details`, `retryAfter`, `requestId`) et des réponses de succès décrites.
Cette vérification est statique : elle valide la génération et les types, pas
les réponses d'un serveur connecté à une base réelle. Avant de considérer les
exemples Playground comme un parcours E2E, il faut lancer l'API, fournir une
base et les secrets adaptés, puis vérifier les flux authentifiés et le mock
de paiement. Les propriétés de corps documentées doivent rester alignées sur
les parseurs Zod et les handlers lors de leurs modifications.

## Pièges

- Le corps brut doit être conservé pour la signature d'appareil (parseur
  personnalisé sur `application/json`).
- Les erreurs suivent `{ error: { code, message, details?, retryAfter? } }`.
- Le chemin WS est généré côté serveur, jamais accepté du client.
- Un `register` sur une clé expirée renvoie `409`, pas une résurrection.
