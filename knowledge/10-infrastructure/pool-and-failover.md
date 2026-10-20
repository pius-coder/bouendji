---
id: pool-and-failover
title: Pool — composition, révision, ordre de service
tags: [backend, pool, revision, selection]
status: decided
updated: 2026-10-20
related: [endpoint-lifecycle, failover-client, cloud-run]
---

## Composition

`servedEndpoints` ne renvoie que les endpoints dont :

- `status = 'active'`
- `expires_at > now()`
- `last_seen_at` récent (au-delà du seuil, le nœud est considéré mort)

## Ordre

1. sains d'abord (`healthy = true`)
2. latence croissante
3. date de création (stabilité du tri)

L'ordre n'est pas la décision finale : le client reteste de toute façon. Il sert
à éviter que le pire nœud soit essayé en premier.

## Révision

`pool_state.revision` est un compteur unique. Il est bumpé **uniquement** quand
la composition change :

- un endpoint devient `active`
- un endpoint passe `draining` ou `expired`
- un endpoint est retiré ou révoqué

Il n'est **pas** bumpé par un heartbeat ni par une mise à jour de latence. Le
numéro sert à deux choses : clé de cache HTTP et sel HKDF du bundle
(`vpn-bundle-v1|deviceId|revision`).

## Conséquence assumée

Un client dont la révision est en retard continue d'utiliser son ancien bundle.
C'est voulu : la liste locale doit rester utilisable quand l'API est
inaccessible. Le prix est qu'un nœud mort reste dans son bundle jusqu'à la
prochaine synchronisation — d'où le failover côté client, qui ne dépend d'aucun
appel réseau.

## Angle mort

Rien ne déduplique deux endpoints qui pointent vers le même serveur physique
(redéploiement, doublon de `PUBLIC_HOST`). Un même hôte peut apparaître
plusieurs fois dans le pool et fausser les tests de latence.
