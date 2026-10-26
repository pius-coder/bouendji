---
id: audit-build-pipeline-haiku
title: Audit pipeline de build APK
kind: agent
status: done
updated: 2026-10-26
scope: ".github/workflows/android-brand.yml, .github/workflows/endpoint-image.yml, tools/inject-brand.mjs, tools/brands, tools/build-apk.ps1, routes/builds.ts (cote callback seulement), knowledge 30-clients sur le build. Plan point 2 : etat reel de la chaine demande, validation, R2, callback."
owns: [knowledge/agents/audit-build-pipeline-haiku]
---

# Charte — Audit pipeline de build APK

## Mission

.github/workflows/android-brand.yml, .github/workflows/endpoint-image.yml, tools/inject-brand.mjs, tools/brands, tools/build-apk.ps1, routes/builds.ts (cote callback seulement), knowledge 30-clients sur le build. Plan point 2 : etat reel de la chaine demande, validation, R2, callback.

## Périmètre

Ce sous-agent ne touche qu'à ce qui est listé ci-dessus. Tout le reste est hors
sujet, même si ça semble lié.

## Fichiers qu'il possède

- `knowledge/agents/audit-build-pipeline-haiku`

## Interdits

1. Écrire hors de `knowledge/agents/audit-build-pipeline-haiku/` — sauf les fichiers explicitement
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
   ## 2026-10-26T10:40:10Z · <titre court>
   - fait: ...
   - etat: ok | partiel | bloqué
   - suite: ...
   - fichiers: ...
   ```

3. **À la fin** : une entrée `CLÔTURE` avec le résultat, ce qui est vérifié et
   ce qui ne l'est pas, et les questions laissées ouvertes.

## Journal

Le journal est `log.md`, append-only, dans ce dossier.
