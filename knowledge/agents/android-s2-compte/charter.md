---
id: android-s2-compte
title: Android — S2 écran Compte
kind: agent
status: done
updated: 2026-10-24
scope: "Porter AccountScreen.kt (non connecté, connecté, appareil révoqué ; statut abonnement, appareils) selon ui-restructure-plan. Ne touche qu'à ui/AccountScreen.kt et ses previews."
owns: [ui-restructure-plan]
---

# Charte — Android — S2 écran Compte

## Mission

Porter AccountScreen.kt (non connecté, connecté, appareil révoqué ; statut abonnement, appareils) selon ui-restructure-plan. Ne touche qu'à ui/AccountScreen.kt et ses previews.

## Périmètre

Ce sous-agent ne touche qu'à ce qui est listé ci-dessus. Tout le reste est hors
sujet, même si ça semble lié.

## Fichiers qu'il possède

- `ui-restructure-plan`

## Interdits

1. Écrire hors de `knowledge/agents/android-s2-compte/` — sauf les fichiers explicitement
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
   ## 2026-10-24T13:33:25Z · <titre court>
   - fait: ...
   - etat: ok | partiel | bloqué
   - suite: ...
   - fichiers: ...
   ```

3. **À la fin** : une entrée `CLÔTURE` avec le résultat, ce qui est vérifié et
   ce qui ne l'est pas, et les questions laissées ouvertes.

## Journal

Le journal est `log.md`, append-only, dans ce dossier.
