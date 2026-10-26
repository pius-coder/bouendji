---
id: w1-api-r6-haiku
title: Vague 1 - R6 forfaits, tarifs, paiement
kind: agent
status: active
updated: 2026-10-26
scope: "Familles de forfaits, quota, options de nuit, reglages tarifaires saisis par les owners, prix plancher, commande avec plage, abonnement avec quota, corrections webhook et double abonnement."
owns: [knowledge/agents/w1-api-r6-haiku]
---

# Charte — Vague 1 - R6 forfaits, tarifs, paiement

## Mission

Familles de forfaits, quota, options de nuit, reglages tarifaires saisis par les owners, prix plancher, commande avec plage, abonnement avec quota, corrections webhook et double abonnement.

## Périmètre

Ce sous-agent ne touche qu'à ce qui est listé ci-dessus. Tout le reste est hors
sujet, même si ça semble lié.

## Fichiers qu'il possède

- `knowledge/agents/w1-api-r6-haiku`

## Interdits

1. Écrire hors de `knowledge/agents/w1-api-r6-haiku/` — sauf les fichiers explicitement
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
   ## 2026-10-26T11:21:30Z · <titre court>
   - fait: ...
   - etat: ok | partiel | bloqué
   - suite: ...
   - fichiers: ...
   ```

3. **À la fin** : une entrée `CLÔTURE` avec le résultat, ce qui est vérifié et
   ce qui ne l'est pas, et les questions laissées ouvertes.

## Journal

Le journal est `log.md`, append-only, dans ce dossier.
