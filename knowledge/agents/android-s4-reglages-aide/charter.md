---
id: android-s4-reglages-aide
title: Android — S4 Réglages et Aide
kind: agent
status: done
updated: 2026-10-24
scope: "Porter SettingsScreen.kt (apparence AUTO/CLAIR/SOMBRE, mouvement réduit) et HelpScreen.kt (contact de marque D19, confidentialité en section). Ne touche qu'à ces fichiers."
owns: [ui-restructure-plan]
---

# Charte — Android — S4 Réglages et Aide

## Mission

Porter SettingsScreen.kt (apparence AUTO/CLAIR/SOMBRE, mouvement réduit) et HelpScreen.kt (contact de marque D19, confidentialité en section). Ne touche qu'à ces fichiers.

## Périmètre

Ce sous-agent ne touche qu'à ce qui est listé ci-dessus. Tout le reste est hors
sujet, même si ça semble lié.

## Fichiers qu'il possède

- `ui-restructure-plan`

## Interdits

1. Écrire hors de `knowledge/agents/android-s4-reglages-aide/` — sauf les fichiers explicitement
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
