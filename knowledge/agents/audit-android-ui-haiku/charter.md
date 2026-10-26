---
id: audit-android-ui-haiku
title: Audit Android - interface Compose
kind: agent
status: done
updated: 2026-10-26
scope: "apps/android/app/src/main/java/cm/bouendji/vpn/ui (AppController, Shell, screens, kit, theme) et MainActivity.kt. Plan point 9 : ou inserer pop-up de bienvenue, page de paiement, jauge, feuille Activite, aide WhatsApp."
owns: [knowledge/agents/audit-android-ui-haiku]
---

# Charte — Audit Android - interface Compose

## Mission

apps/android/app/src/main/java/cm/bouendji/vpn/ui (AppController, Shell, screens, kit, theme) et MainActivity.kt. Plan point 9 : ou inserer pop-up de bienvenue, page de paiement, jauge, feuille Activite, aide WhatsApp.

## Périmètre

Ce sous-agent ne touche qu'à ce qui est listé ci-dessus. Tout le reste est hors
sujet, même si ça semble lié.

## Fichiers qu'il possède

- `knowledge/agents/audit-android-ui-haiku`

## Interdits

1. Écrire hors de `knowledge/agents/audit-android-ui-haiku/` — sauf les fichiers explicitement
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
   ## 2026-10-26T10:40:09Z · <titre court>
   - fait: ...
   - etat: ok | partiel | bloqué
   - suite: ...
   - fichiers: ...
   ```

3. **À la fin** : une entrée `CLÔTURE` avec le résultat, ce qui est vérifié et
   ce qui ne l'est pas, et les questions laissées ouvertes.

## Journal

Le journal est `log.md`, append-only, dans ce dossier.
