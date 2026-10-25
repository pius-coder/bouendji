---
id: dash-roles-haiku
title: Dashboard — matrice des rôles
kind: agent
status: active
updated: 2026-10-25
scope: "Comparer permitted() de l'API et can() du dashboard pour chaque capacité et chaque rôle ; vérifier écrans, menu et actions ; corriger roles.ts et nav-model.ts ; test matrice."
owns: [apps/dashboard/src/lib/roles.ts,apps/dashboard/src/components/shell/nav-model.ts,apps/dashboard/test/roles-matrix.test.ts]
---

# Charte — Dashboard — matrice des rôles

## Mission

Comparer permitted() de l'API et can() du dashboard pour chaque capacité et chaque rôle ; vérifier écrans, menu et actions ; corriger roles.ts et nav-model.ts ; test matrice.

## Périmètre

Ce sous-agent ne touche qu'à ce qui est listé ci-dessus. Tout le reste est hors
sujet, même si ça semble lié.

## Fichiers qu'il possède

- `apps/dashboard/src/lib/roles.ts`
- `apps/dashboard/src/components/shell/nav-model.ts`
- `apps/dashboard/test/roles-matrix.test.ts`

## Interdits

1. Écrire hors de `knowledge/agents/dash-roles-haiku/` — sauf les fichiers explicitement
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
   ## 2026-10-25T06:16:22Z · <titre court>
   - fait: ...
   - etat: ok | partiel | bloqué
   - suite: ...
   - fichiers: ...
   ```

3. **À la fin** : une entrée `CLÔTURE` avec le résultat, ce qui est vérifié et
   ce qui ne l'est pas, et les questions laissées ouvertes.

## Journal

Le journal est `log.md`, append-only, dans ce dossier.
