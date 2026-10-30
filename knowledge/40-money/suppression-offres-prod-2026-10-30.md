---
id: suppression-offres-prod-2026-10-30
title: Suppression de toutes les offres en production (2026-10-30)
status: verified
updated: 2026-10-30
---

# Suppression de toutes les offres en production

## Décision

L'owner a demandé de **retirer les offres de toutes les communautés en base de
production**, et explicitement refusé la simple désactivation (`active=false`).
Les lignes `plans` ont donc été **supprimées**, ainsi que les lignes qui les
référencent (FK `NO ACTION`) : commissions, abonnements, commandes.

## Exécution (vérifiée)

Base : `vpn_db` sur `aura-vps` (conteneur `dokku.postgres.vpn-db`).

Sauvegarde préalable :

```
~/backups/vpn-db-2026-10-30T07-05-50-053Z-avant-suppression-offres.sql.gz  (128 Ko)
```

Transaction unique (`ON_ERROR_STOP=1`) :

```sql
BEGIN;
DELETE FROM commissions;     -- 10
DELETE FROM subscriptions;   -- 10
DELETE FROM orders;          -- 28
DELETE FROM plans;           -- 21
COMMIT;
```

Résultat relu en base :

- `plans` : **0** (avant : 21, dont 10 actives)
- `orders` : **0** (avant : 28 — 10 payées, 2 échouées, 16 en attente)
- `subscriptions` : **0** (avant : 10)
- `commission` : **0**

`plan_night_options` et `plan_custom_terms` ont suivi par `ON DELETE CASCADE`.

## Vérification côté public

Les 9 catalogues (`GET https://api.numzer0.store/v1/apps/:appId/plans`)
répondent **HTTP 200 avec `items=0`** : Bouendji, dalas-npv, goat-vpn,
gregor-44, james-pro, nevpn, saitrix, test, aura-test.

Dashboard : `https://vpn-dashboard-seven.vercel.app/login` -> HTTP 200.

## Conséquences

- Plus aucune offre n'est achetable ni affichée par les apps / pages Cloudflare.
- Plus aucun abonnement actif : les anciens abonnés perdent leurs droits
  (leur abonnement a été supprimé avec les commandes).
- Les réglages tarifaires (`pricing_settings`) sont **conservés** :
  coût 100 FCFA/Go, nuit 500, illimité 500/j, marge 0, plafond commission 30 %.
- Les forfaits devront être **recréés** au-dessus des planchers.

## Restauration possible

En cas de besoin, restaurer la sauvegarde ci-dessus dans `vpn_db` (elle contient
les 21 forfaits et l'historique de commandes/abonnements d'avant suppression).
