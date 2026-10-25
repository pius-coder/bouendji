---
id: dash-network-audit-haiku
title: Dashboard — détail nœud et détail du journal
kind: agent
status: done
updated: 2026-10-25
scope: "Tiroirs de détail Réseau (nœud) et Journal (entrée, avant/après)."
owns: [apps/dashboard/src/components/network,apps/dashboard/src/components/audit,apps/dashboard/src/app/(dashboard)/network,apps/dashboard/src/app/(dashboard)/[communityId]/audit,apps/dashboard/test/network-audit.test.ts]
---

# Charte — Dashboard — détail nœud et détail du journal

## Mission

Tiroirs de détail Réseau (nœud) et Journal (entrée, avant/après).

## Périmètre

Ce sous-agent ne touche qu'à ce qui est listé ci-dessus. Tout le reste est hors
sujet, même si ça semble lié.

## Fichiers qu'il possède

- `apps/dashboard/src/components/network`
- `apps/dashboard/src/components/audit`
- `apps/dashboard/src/app/(dashboard)/network`
- `apps/dashboard/src/app/(dashboard)/[communityId]/audit`
- `apps/dashboard/test/network-audit.test.ts`

## Interdits

1. Écrire hors de `knowledge/agents/dash-network-audit-haiku/` — sauf les fichiers explicitement
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
