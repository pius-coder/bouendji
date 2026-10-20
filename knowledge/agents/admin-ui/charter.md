---
id: admin-ui
title: Dashboard admin
kind: agent
status: done
updated: 2026-10-20
scope: "Écrire apps/admin : SPA statique sans build, sans CDN, servie par l API. Connexion, communautés, membres, commandes, réseau, bundles hors-ligne."
owns: [roles-and-commissions,ui-identities]
---

# Charte — Dashboard admin

## Mission

Écrire apps/admin : SPA statique sans build, sans CDN, servie par l API. Connexion, communautés, membres, commandes, réseau, bundles hors-ligne.

## Périmètre

Ce sous-agent ne touche qu'à ce qui est listé ci-dessus. Tout le reste est hors
sujet, même si ça semble lié.

## Fichiers qu'il possède

- `roles-and-commissions`
- `ui-identities`

## Interdits

1. Écrire hors de `knowledge/agents/admin-ui/` — sauf les fichiers explicitement
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
   ## 2026-10-20T15:02:56Z · <titre court>
   - fait: ...
   - etat: ok | partiel | bloqué
   - suite: ...
   - fichiers: ...
   ```

3. **À la fin** : une entrée `CLÔTURE` avec le résultat, ce qui est vérifié et
   ce qui ne l'est pas, et les questions laissées ouvertes.

## Journal

Le journal est `log.md`, append-only, dans ce dossier.
