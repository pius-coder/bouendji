---
id: audit-dash-domain-haiku
title: Audit dashboard - composants metier
kind: agent
status: done
updated: 2026-10-26
scope: "apps/dashboard/src/components/{admins,audit,auth,builds,commissions,communities,devices,members,network,offline,orders,payouts,plans,subscribers,kit}. Pages creuses ou statiques, champ VLESS casse, page Forfaits en erreur, reutilisable ou a jeter. Plan points 2, 5, 7, 8."
owns: [knowledge/agents/audit-dash-domain-haiku]
---

# Charte — Audit dashboard - composants metier

## Mission

apps/dashboard/src/components/{admins,audit,auth,builds,commissions,communities,devices,members,network,offline,orders,payouts,plans,subscribers,kit}. Pages creuses ou statiques, champ VLESS casse, page Forfaits en erreur, reutilisable ou a jeter. Plan points 2, 5, 7, 8.

## Périmètre

Ce sous-agent ne touche qu'à ce qui est listé ci-dessus. Tout le reste est hors
sujet, même si ça semble lié.

## Fichiers qu'il possède

- `knowledge/agents/audit-dash-domain-haiku`

## Interdits

1. Écrire hors de `knowledge/agents/audit-dash-domain-haiku/` — sauf les fichiers explicitement
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
