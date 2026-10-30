---
id: audit-reseau-app
title: App verdicts clients et remonte de sante
kind: agent
status: active
updated: 2026-10-30
scope: "Audit en lecture seule du flux reseau, axe : App verdicts clients et remonte de sante. Ne modifie aucun fichier de code."
owns: []
---

# Charte — App verdicts clients et remonte de sante

## Mission

Audit en lecture seule du flux reseau, axe : App verdicts clients et remonte de sante. Ne modifie aucun fichier de code.

## Périmètre

Ce sous-agent ne touche qu'à ce qui est listé ci-dessus. Tout le reste est hors
sujet, même si ça semble lié.

## Fichiers qu'il possède

- (aucun nœud partagé : il produit des propositions)

## Interdits

1. Écrire hors de `knowledge/agents/audit-reseau-app/` — sauf les fichiers explicitement
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
   ## 2026-10-30T06:32:39Z · <titre court>
   - fait: ...
   - etat: ok | partiel | bloqué
   - suite: ...
   - fichiers: ...
   ```

3. **À la fin** : une entrée `CLÔTURE` avec le résultat, ce qui est vérifié et
   ce qui ne l'est pas, et les questions laissées ouvertes.

## Journal

Le journal est `log.md`, append-only, dans ce dossier.
