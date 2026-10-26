---
id: w1-dash-r2-haiku
title: Vague 1 - R2 shell, navigation, cache
kind: agent
status: done
updated: 2026-10-26
scope: "React Query + BFF, navigation 5 sections + Plateforme + Reseau, barre basse, en-tete sans doublon, hote de tiroirs pilote par l'URL, Ctrl K, nettoyage du kit."
owns: [knowledge/agents/w1-dash-r2-haiku]
---

# Charte — Vague 1 - R2 shell, navigation, cache

## Mission

React Query + BFF, navigation 5 sections + Plateforme + Reseau, barre basse, en-tete sans doublon, hote de tiroirs pilote par l'URL, Ctrl K, nettoyage du kit.

## Périmètre

Ce sous-agent ne touche qu'à ce qui est listé ci-dessus. Tout le reste est hors
sujet, même si ça semble lié.

## Fichiers qu'il possède

- `knowledge/agents/w1-dash-r2-haiku`

## Interdits

1. Écrire hors de `knowledge/agents/w1-dash-r2-haiku/` — sauf les fichiers explicitement
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
