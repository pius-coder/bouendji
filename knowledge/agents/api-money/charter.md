---
id: api-money
title: API — commandes, paiements, commissions
kind: agent
status: done
updated: 2026-10-20
scope: "Écrire les routes de commande, l initialisation de paiement, le webhook Fapshi re-vérifié, le calcul de commission et la page mock. Tests verts. Ne pas modifier app.ts."
owns: [fapshi,roles-and-commissions]
---

# Charte — API — commandes, paiements, commissions

## Mission

Écrire les routes de commande, l initialisation de paiement, le webhook Fapshi re-vérifié, le calcul de commission et la page mock. Tests verts. Ne pas modifier app.ts.

## Périmètre

Ce sous-agent ne touche qu'à ce qui est listé ci-dessus. Tout le reste est hors
sujet, même si ça semble lié.

## Fichiers qu'il possède

- `fapshi`
- `roles-and-commissions`

## Interdits

1. Écrire hors de `knowledge/agents/api-money/` — sauf les fichiers explicitement
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
   ## 2026-10-20T15:02:56Z · <titre court>
   - fait: ...
   - etat: ok | partiel | bloqué
   - suite: ...
   - fichiers: ...
   ```

3. **À la fin** : une entrée `CLÔTURE` avec le résultat, ce qui est vérifié et
   ce qui ne l'est pas, et les questions laissées ouvertes.

## Journal

Le journal est `log.md`, append-only, dans ce dossier.
