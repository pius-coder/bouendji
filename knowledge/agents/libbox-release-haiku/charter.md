---
id: libbox-release-haiku
title: Release GitHub libbox-1.14.3 et étape CI
kind: agent
status: done
updated: 2026-10-25
scope: "Publier libbox.aar dans la Release libbox-1.14.3 (autorisée par l'utilisateur le 2026-10-25), vérifier son SHA-256 après téléchargement, adapter l'étape « Moteur libbox » de android-brand.yml (vérification d'empreinte). Ne touche à rien d'autre."
owns: [.github/workflows/android-brand.yml]
---

# Charte — Release GitHub libbox-1.14.3 et étape CI

## Mission

Publier libbox.aar dans la Release libbox-1.14.3 (autorisée par l'utilisateur le 2026-10-25), vérifier son SHA-256 après téléchargement, adapter l'étape « Moteur libbox » de android-brand.yml (vérification d'empreinte). Ne touche à rien d'autre.

## Périmètre

Ce sous-agent ne touche qu'à ce qui est listé ci-dessus. Tout le reste est hors
sujet, même si ça semble lié.

## Fichiers qu'il possède

- `.github/workflows/android-brand.yml`

## Interdits

1. Écrire hors de `knowledge/agents/libbox-release-haiku/` — sauf les fichiers explicitement
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
   ## 2026-10-25T05:03:04Z · <titre court>
   - fait: ...
   - etat: ok | partiel | bloqué
   - suite: ...
   - fichiers: ...
   ```

3. **À la fin** : une entrée `CLÔTURE` avec le résultat, ce qui est vérifié et
   ce qui ne l'est pas, et les questions laissées ouvertes.

## Journal

Le journal est `log.md`, append-only, dans ce dossier.
