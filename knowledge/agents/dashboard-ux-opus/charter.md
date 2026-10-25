---
id: dashboard-ux-opus
title: Système UI/UX du dashboard (shadcn)
kind: agent
status: active
updated: 2026-10-23
scope: "Refaire le noeud 30-clients/dashboard-ux : système UI/UX complet du dashboard Next.js + shadcn/ui, tokens Halo v2, patterns, rôles. Propose, n'intègre pas."
owns: []
---

# Charte — Système UI/UX du dashboard (shadcn)

## Mission

Refaire le noeud 30-clients/dashboard-ux : système UI/UX complet du dashboard Next.js + shadcn/ui, tokens Halo v2, patterns, rôles. Propose, n'intègre pas.

## Périmètre

Ce sous-agent ne touche qu'à ce qui est listé ci-dessus. Tout le reste est hors
sujet, même si ça semble lié.

## Fichiers qu'il possède

- (aucun nœud partagé : il produit des propositions)

## Interdits

1. Écrire hors de `knowledge/agents/dashboard-ux-opus/` — sauf les fichiers explicitement
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
   ## 2026-10-23T11:03:10Z · <titre court>
   - fait: ...
   - etat: ok | partiel | bloqué
   - suite: ...
   - fichiers: ...
   ```

3. **À la fin** : une entrée `CLÔTURE` avec le résultat, ce qui est vérifié et
   ce qui ne l'est pas, et les questions laissées ouvertes.

## Journal

Le journal est `log.md`, append-only, dans ce dossier.
