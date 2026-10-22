---
id: roles-and-commissions
title: Rôles, périmètres et commissions
tags: [admin, roles, commissions, securite, dashboard]
status: decided
updated: 2026-10-20
related: [schema, fapshi, threat-model]
---

## Modèle

Un seul rôle global, des appartenances locales.

```
users.platform_role ∈ { none, owner }
community_memberships.role ∈ { community_admin, support, finance }
```

Pourquoi pas `super_admin` : un rôle global finit toujours par être testé avec
`role === 'admin'` quelque part, et c'est là que naissent les élévations de
privilèges. `owner` est une identité unique, pas un niveau de plus.

## Périmètres

| Capacité | owner | community_admin | support | finance |
|---|---|---|---|---|
| Créer / suspendre une communauté | ✅ | — | — | — |
| Fixer le % de commission (≤ 30 %) | ✅ | lecture | — | lecture |
| Fixer le prix des forfaits de sa marque | ✅ | sa communauté | — | — |
| Voir les commandes | toutes | sa communauté | sa communauté (lecture) | toutes, montants |
| Déclencher un versement | ✅ | — | — | prépare, owner valide |
| Approuver un endpoint | ✅ | — | — | — |
| Voir UUID / chemin WS | ✅ | jamais | jamais | jamais |
| Révoquer un appareil | ✅ | sa communauté | sa communauté | — |
| Émettre un bundle hors-ligne | ✅ | sa communauté | sa communauté | — |
| Changer son propre taux | ✘ | ✘ | ✘ | ✘ |

## Application

1. `community_id` lu dans le **membership de session**, jamais dans le corps.
2. Audiences de jeton séparées : `vpn-mobile` ≠ `vpn-admin`.
3. Argent **calculé** : le solde est la somme des commissions.
4. `audit_log` append-only sur toute action privilégiée.
5. Retirer un membre = `status='disabled'` + `token_version++`.
6. Aucun admin ne voit une configuration VLESS, jamais.

## Commission

> **D35 (2026-10-21) remplace le modèle « prix global ».** Le prix de vente est
> fixé par la communauté ; la plateforme encaisse 100 %, réserve **30 %** du CA
> en enveloppe de commissions répartie **à la performance**, et garde **70 %**.
> Voir `00-brief/decisions.md` et `00-brief/open-questions.md` (O18).

- Attachée à la **commande** : `community_id`, `app_id`, prix réellement payé,
  taux appliqué, montant.
- Le taux est plafonné à **30 %** (`commission_bps <= 3000`) ; l'`owner` peut
  accorder moins, jamais plus. Une communauté ne modifie pas son propre taux.
- Indépendante des UTM, qui ne servent qu'au suivi de campagne.
- Renouvellements : règle configurable (premier achat seulement, ou récurrent).
- Remboursement → annulation de la commission, jamais de solde négatif silencieux.
- Prix, taux et montant sont **figés dans la commande** au paiement : changer le
  prix d'un forfait ne réécrit pas les commandes passées.

## Dashboard

- Owner : communautés, offres, réseau, encaissements, commissions, versements,
  builds, incidents.
- Admin : ses abonnés, ses ventes, son solde, ses campagnes, son thème, ses
  builds, son support.
