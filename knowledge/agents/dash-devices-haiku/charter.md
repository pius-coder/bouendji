---
id: dash-devices-haiku
title: Dashboard — détail appareil et fichiers de secours émis
kind: agent
status: done
updated: 2026-10-25
scope: "Tiroir appareil + page /[communityId]/offline (GET /v1/admin/offline-bundles)."
owns: [apps/dashboard/src/components/devices,apps/dashboard/src/components/offline,apps/dashboard/src/app/(dashboard)/[communityId]/devices,apps/dashboard/src/app/(dashboard)/[communityId]/offline,apps/dashboard/test/offline.test.ts]
---

# Charte — Dashboard — détail appareil et fichiers de secours émis

## Mission

Tiroir appareil + page /[communityId]/offline (GET /v1/admin/offline-bundles).

## Périmètre

Ce sous-agent ne touche qu'à ce qui est listé ci-dessus. Tout le reste est hors
sujet, même si ça semble lié.

## Fichiers qu'il possède

- `apps/dashboard/src/components/devices`
- `apps/dashboard/src/components/offline`
- `apps/dashboard/src/app/(dashboard)/[communityId]/devices`
- `apps/dashboard/src/app/(dashboard)/[communityId]/offline`
- `apps/dashboard/test/offline.test.ts`

## Interdits

1. Écrire hors de `knowledge/agents/dash-devices-haiku/` — sauf les fichiers explicitement
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
   ## 2026-10-25T06:12:16Z · <titre court>
   - fait: ...
   - etat: ok | partiel | bloqué
   - suite: ...
   - fichiers: ...
   ```

3. **À la fin** : une entrée `CLÔTURE` avec le résultat, ce qui est vérifié et
   ce qui ne l'est pas, et les questions laissées ouvertes.

## Journal

Le journal est `log.md`, append-only, dans ce dossier.
