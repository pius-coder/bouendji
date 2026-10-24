---
id: listing-vivante
title: Liste vivante — santé, verdict, probation, alertes
tags: [endpoints, sante, pool, failover, telegram]
status: decided
updated: 2026-10-23
related: [endpoint-lifecycle, pool-and-failover, failover-client, vercel]
---

## Le principe

Le TTL n'est plus un critère de vérité : c'est une **échéance de
redéploiement**. Un nœud sort de la liste parce que le trafic ne passe plus par
lui, pas parce que l'horloge l'a décidé (D45–D50).

```
app ──sonde 60 s (à travers le tunnel)──► POST /v1/me/telemetry
                                              │
                     ┌────────────────────────┴───────────────────────┐
                     │ 3 appareils distincts en échec sur 10 min      │
                     │        OU 1 témoin différentiel                │
                     └────────────────────────┬───────────────────────┘
                                              ▼
                                   endpoints.health = 'down'
                                              │
                          bump pool_state.revision → nouvel ETag
                                              │
                                   Telegram `endpointDown`
```

## Composition du pool

```sql
servedEndpoints(tier) =
  status = 'active'
  AND tier = $tier
  AND health <> 'down'
  AND expires_at > now() + drain (900 s)
ORDER BY healthy d'abord, latency_ms ASC NULLS LAST, created_at ASC
```

`last_seen_at` **ne retire jamais** un nœud (D24). Le heartbeat et `ready` ne
peuvent pas lever un `down` (D47) : le conteneur ne voit pas le chemin client.

## Verdict `down` — deux chemins

1. **Quorum** : 3 appareils distincts en échec sur 10 min.
2. **Témoin différentiel** : 2 échecs consécutifs sur ce nœud **et** ≥ 1 succès
   sur un autre nœud dans la même fenêtre. C'est la séquence exacte que produit
   la bascule du client, donc la preuve arrive en moins de deux minutes.

Au lancement il n'y a qu'un appareil : sans le second chemin, le quorum de 3 est
inatteignable et rien ne sortirait jamais de la liste.

## Retour

- 3 appareils distincts en succès → `healthy`.
- Un nœud `down` revient par **probation** après 30 min (`down → unknown`, servi
  en dernier). Jamais par la parole du nœud.

## Ce qui ne décide jamais

`last_seen_at`, le heartbeat du conteneur, `expires_at` (sauf drain et alertes).
Un nœud vivant dont le tunnel est mort est exactement le cas que ce système doit
voir.

## Alertes Telegram

| Message | Déclencheur |
|---|---|
| `endpointDown` | transition `→ down` (raison : `witness`, `reports:3`, `manual`) |
| `deployReminder` | seuils T-90 / T-30 / T-10 avant expiration |
| `noEndpoint` | pool vide |
| `poolSuspicion` | ≥ 2 appareils en échec sur **toutes** leurs configs (panne d'opérateur probable, aucune mutation de santé) |
| `payoutReview` | `processing → needs_review` |

L'anti-spam est en base (`alert_state`) : une ligne renvoyée = le droit d'envoyer,
zéro ligne = une autre instance vient de le faire.

## Entretien

Pas de cron : hook `onRequest`, au plus une fois par 60 s et par instance (D51).
Trois requêtes idempotentes — probation, expiration constatée, retrait ambigu →
`needs_review`. Une erreur est avalée : l'entretien ne casse jamais une requête.
