---
id: schema
title: Schéma de base — tables et rôles
tags: [backend, schema, postgres, roles]
status: decided
updated: 2026-10-20
related: [roles-and-commissions, endpoint-lifecycle]
---

## Existant dans `apps/api/src/schema.ts`

Utilisateurs, communautés, membres, appareils, offres, commandes, commissions,
versements, builds, sessions de support, endpoints, `pool_state`.

## Tables pivots du réseau

```sql
endpoints(
  id, deployment_key UNIQUE, host, port, protocol, transport, security, sni,
  ws_path, credential, identity_mode, capacity, status, healthy, latency_ms,
  last_seen_at, expires_at, created_at, updated_at
)

pool_state(id text primary key default 'pool', revision bigint, updated_at)
```

`credential` est chiffré par `encryptSecret` et n'est déchiffré que dans
`endpointToConfig`.

## Rôles (proposition, à implémenter)

```sql
users.platform_role  ∈ { none, owner }          -- un seul owner en pratique

community_memberships(
  user_id, community_id, role, status,
  unique(user_id, community_id)
)  role ∈ { community_admin, support, finance }

audit_log(
  id, actor_id, actor_role, action, target_type, target_id,
  community_id, ip, user_agent, before, after, created_at
)  -- append-only
```

## Règles

1. Aucun `role = 'super_admin'` global : une seule valeur `owner`.
2. Le `community_id` est lu **dans la session**, jamais dans le corps.
3. `users.token_version` incrémenté à la désactivation → invalide les jetons.
4. L'argent est calculé, jamais stocké comme champ modifiable.
5. `audit_log` n'a pas d'`UPDATE` ni de `DELETE` applicatif.

## À ajouter

- `offline_bundles(id, community_id, device_id, created_by, not_after,
  consumed_at, config_count)`
- `endpoint_traffic(endpoint_id, device_id, rx_bytes, tx_bytes, reported_at)`
  pour les quotas.
- `staff_sessions` si le dashboard a sa propre session cookie.
