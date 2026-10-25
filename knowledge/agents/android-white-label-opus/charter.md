---
id: android-white-label-opus
title: Android white label - application complete
kind: agent
status: active
updated: 2026-10-24
scope: "Implementer l application Android white label complete dans apps/android : parcours, logique, UI, tunnel, stockage, telemetrie, bundle, marque, compatibilite appareils (ABI, minSdk). Propose les changements de noeuds partages, ne les applique pas."
owns: []
---

# Charte — Android white label - application complete

## Mission

Implementer l application Android white label complete dans apps/android : parcours, logique, UI, tunnel, stockage, telemetrie, bundle, marque, compatibilite appareils (ABI, minSdk). Propose les changements de noeuds partages, ne les applique pas.

## Périmètre

Ce sous-agent ne touche qu'à ce qui est listé ci-dessus. Tout le reste est hors
sujet, même si ça semble lié.

## Fichiers qu'il possède

- (aucun nœud partagé : il produit des propositions)

## Interdits

1. Écrire hors de `knowledge/agents/android-white-label-opus/` — sauf les fichiers explicitement
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
   ## 2026-10-24T03:26:15Z · <titre court>
   - fait: ...
   - etat: ok | partiel | bloqué
   - suite: ...
   - fichiers: ...
   ```

3. **À la fin** : une entrée `CLÔTURE` avec le résultat, ce qui est vérifié et
   ce qui ne l'est pas, et les questions laissées ouvertes.

## Journal

Le journal est `log.md`, append-only, dans ce dossier.
