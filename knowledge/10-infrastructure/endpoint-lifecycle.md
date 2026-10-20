---
id: endpoint-lifecycle
title: Cycle de vie d'un endpoint
tags: [backend, endpoints, ttl, drain, idempotence]
status: decided
updated: 2026-10-20
related: [gcp-v2ray-repo, pool-and-failover, ingest-auth]
---

## États

`pending` → `active` → `draining` → `expired`, plus `failed`.

- `pending` : enregistré, identité attribuée, pas encore joignable.
- `active` : `ready` reçu, servi par l'API.
- `draining` : proche de l'expiration, plus proposé aux nouveaux bundles.
- `expired` : au-delà de `expires_at`.
- `failed` : le conteneur a signalé une erreur de démarrage.

## Transitions

| Événement | Effet |
|---|---|
| `register` (nouveau `deployment_key`) | crée `pending`, génère UUID + chemin WS, fixe `expires_at` |
| `register` (même clé) | **idempotent** : renvoie l'identité et l'`expires_at` existants, n'étend rien |
| `register` (clé expirée) | `409` — il faut un nouveau déploiement |
| `ready` | `pending` → `active`, +1 révision du pool |
| `heartbeat` | met à jour `last_seen_at` et la latence, **rien d'autre** |
| balayage (60 s) | `expires_at - drainLead` → `draining` ; `expires_at` → `expired` |

## Valeurs actuelles du code

- `ENDPOINT_DEFAULT_TTL` = **16 200 s** (4 h 30) — voir D21
- `ENDPOINT_MIN_TTL` = 3 600 s
- `ENDPOINT_MAX_TTL` = 30 jours
- drain = **900 s**
- `autoApprove` = vrai hors production

## Règles qui protègent le pool

1. Un restart ne prolonge **jamais** la vie : sinon un nœud immortel
   contournerait la rotation.
2. Un heartbeat ne bump **jamais** la révision : sinon chaque battement force
   tous les appareils à retélécharger un bundle.
3. Le drain précède l'expiration pour que les clients migrent avant la coupure.
4. Un endpoint n'est jamais supprimé : il est marqué `expired` (traçabilité et
   statistiques).

## Angle mort

Rien ne garantit aujourd'hui qu'un endpoint `active` répond réellement. Le
`ready` est déclaratif. Il faut soit une sonde côté API, soit accepter que les
clients fassent le tri.
