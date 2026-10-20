---
id: admin-web
title: Dashboard — Next.js
kind: agent
status: active
updated: 2026-10-20
scope: "Porter le dashboard en Next.js (App Router, TypeScript), export statique sous basePath /admin, servi par l API. Mêmes écrans, mêmes contrôles, mêmes garde-fous que apps/admin-legacy. Ne touche pas apps/api."
owns: [admin-ui]
---

# Charte — Dashboard — Next.js

## Mission

Porter le dashboard en Next.js (App Router, TypeScript), export statique sous basePath /admin, servi par l API. Mêmes écrans, mêmes contrôles, mêmes garde-fous que apps/admin-legacy. Ne touche pas apps/api.

## Périmètre

Ce sous-agent ne touche qu'à ce qui est listé ci-dessus. Tout le reste est hors
sujet, même si ça semble lié.

## Fichiers qu'il possède

- `admin-ui`

## Interdits

1. Écrire hors de `knowledge/agents/admin-web/` — sauf les fichiers explicitement
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
   ## 2026-10-20T17:42:30Z · <titre court>
   - fait: ...
   - etat: ok | partiel | bloqué
   - suite: ...
   - fichiers: ...
   ```

3. **À la fin** : une entrée `CLÔTURE` avec le résultat, ce qui est vérifié et
   ce qui ne l'est pas, et les questions laissées ouvertes.

## Journal

Le journal est `log.md`, append-only, dans ce dossier.
