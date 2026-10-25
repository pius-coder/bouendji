---
id: design-rules-opus
title: Règles de design Apple HIG du dashboard
kind: agent
status: active
updated: 2026-10-24
scope: "Établir les règles de design du dashboard admin (Apple HIG, iOS récent, sans ombres, listes groupées, inputs Apple) à partir du HIG, d'aura_stack et des skills better-*. Propose notes/design-rules.md, n'intègre pas."
owns: []
---

# Charte — Règles de design Apple HIG du dashboard

## Mission

Établir les règles de design du dashboard admin (Apple HIG, iOS récent, sans ombres, listes groupées, inputs Apple) à partir du HIG, d'aura_stack et des skills better-*. Propose notes/design-rules.md, n'intègre pas.

## Périmètre

Ce sous-agent ne touche qu'à ce qui est listé ci-dessus. Tout le reste est hors
sujet, même si ça semble lié.

## Fichiers qu'il possède

- (aucun nœud partagé : il produit des propositions)

## Interdits

1. Écrire hors de `knowledge/agents/design-rules-opus/` — sauf les fichiers explicitement
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
   ## 2026-10-24T03:16:55Z · <titre court>
   - fait: ...
   - etat: ok | partiel | bloqué
   - suite: ...
   - fichiers: ...
   ```

3. **À la fin** : une entrée `CLÔTURE` avec le résultat, ce qui est vérifié et
   ce qui ne l'est pas, et les questions laissées ouvertes.

## Journal

Le journal est `log.md`, append-only, dans ce dossier.
