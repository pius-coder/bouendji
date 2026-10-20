---
id: android-ui
title: Android — interface Compose
kind: agent
status: done
updated: 2026-10-20
scope: "Écrire la couche UI : MainActivity, écrans, 4 identités, états de connexion, minuterie dans le contrôle principal, barre 1+3, clair/sombre. Ne touche ni au socle (vpn/, crypto/, net/, config/), ni aux fichiers Gradle. Le manifeste sera complété par l orchestrateur."
owns: [ui-identities,android-app]
---

# Charte — Android — interface Compose

## Mission

Écrire la couche UI : MainActivity, écrans, 4 identités, états de connexion, minuterie dans le contrôle principal, barre 1+3, clair/sombre. Ne touche ni au socle (vpn/, crypto/, net/, config/), ni aux fichiers Gradle. Le manifeste sera complété par l orchestrateur.

## Périmètre

Ce sous-agent ne touche qu'à ce qui est listé ci-dessus. Tout le reste est hors
sujet, même si ça semble lié.

## Fichiers qu'il possède

- `ui-identities`
- `android-app`

## Interdits

1. Écrire hors de `knowledge/agents/android-ui/` — sauf les fichiers explicitement
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
   ## 2026-10-20T16:51:32Z · <titre court>
   - fait: ...
   - etat: ok | partiel | bloqué
   - suite: ...
   - fichiers: ...
   ```

3. **À la fin** : une entrée `CLÔTURE` avec le résultat, ce qui est vérifié et
   ce qui ne l'est pas, et les questions laissées ouvertes.

## Journal

Le journal est `log.md`, append-only, dans ce dossier.
