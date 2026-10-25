---
id: dashboard-kit-opus
title: Design system et shell du dashboard (Chariow + orya + Solar)
kind: agent
status: done
updated: 2026-10-24
scope: "Tokens Chariow (accent jaune D85, ombres hiérarchiques D84), kit components/common style iOS à bordures fines, shell orya, icônes Solar, page d'accueil fonctionnelle, spec 30-clients/dashboard-kit.md. Ne touche pas aux fichiers modifiés par un autre agent depuis moins de 15 min."
owns: [apps/dashboard,30-clients/dashboard-kit.md]
---

# Charte — Design system et shell du dashboard (Chariow + orya + Solar)

## Mission

Tokens Chariow (accent jaune D85, ombres hiérarchiques D84), kit components/common style iOS à bordures fines, shell orya, icônes Solar, page d'accueil fonctionnelle, spec 30-clients/dashboard-kit.md. Ne touche pas aux fichiers modifiés par un autre agent depuis moins de 15 min.

## Périmètre

Ce sous-agent ne touche qu'à ce qui est listé ci-dessus. Tout le reste est hors
sujet, même si ça semble lié.

## Fichiers qu'il possède

- `apps/dashboard`
- `30-clients/dashboard-kit.md`

## Interdits

1. Écrire hors de `knowledge/agents/dashboard-kit-opus/` — sauf les fichiers explicitement
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
   ## 2026-10-24T08:39:26Z · <titre court>
   - fait: ...
   - etat: ok | partiel | bloqué
   - suite: ...
   - fichiers: ...
   ```

3. **À la fin** : une entrée `CLÔTURE` avec le résultat, ce qui est vérifié et
   ce qui ne l'est pas, et les questions laissées ouvertes.

## Journal

Le journal est `log.md`, append-only, dans ce dossier.
