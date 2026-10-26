---
id: audit-api-money-haiku
title: Audit API - Fapshi, commandes, paiements, catalogue
kind: agent
status: done
updated: 2026-10-26
scope: "lib/fapshi.ts, services/payments.ts, services/mockPayments.ts, routes/orders.ts, routes/payments.ts, routes/catalog.ts, routes/me.ts, tables orders/subscriptions/commissions/payouts de schema.ts, knowledge/40-money. Plan points 4, 5 et etat reel de Fapshi."
owns: [knowledge/agents/audit-api-money-haiku]
---

# Charte — Audit API - Fapshi, commandes, paiements, catalogue

## Mission

lib/fapshi.ts, services/payments.ts, services/mockPayments.ts, routes/orders.ts, routes/payments.ts, routes/catalog.ts, routes/me.ts, tables orders/subscriptions/commissions/payouts de schema.ts, knowledge/40-money. Plan points 4, 5 et etat reel de Fapshi.

## Périmètre

Ce sous-agent ne touche qu'à ce qui est listé ci-dessus. Tout le reste est hors
sujet, même si ça semble lié.

## Fichiers qu'il possède

- `knowledge/agents/audit-api-money-haiku`

## Interdits

1. Écrire hors de `knowledge/agents/audit-api-money-haiku/` — sauf les fichiers explicitement
   possédés ci-dessus.
2. Modifier un nœud de connaissance partagé : il **propose**, l'orchestrateur
   intègre.
3. Affirmer sans source. Ce qui n'est pas vérifié porte `(non vérifié)`.
4. Inventer un chiffre, une limite d'API, un nom de fichier.

## Protocole

1. **Avant** de travailler : lire les nœuds utiles
   (`node knowledge/cli.mjs read <id>`) et la charte.
2. **Pendant** : une entrée de journal par étape réelle, dans `log.md` :

   ```
   ## 2026-10-26T10:40:08Z · <titre court>
   - fait: ...
   - etat: ok | partiel | bloqué
   - suite: ...
   - fichiers: ...
   ```

3. **À la fin** : une entrée `CLÔTURE` avec le résultat, ce qui est vérifié et
   ce qui ne l'est pas, et les questions laissées ouvertes.

## Journal

Le journal est `log.md`, append-only, dans ce dossier.
