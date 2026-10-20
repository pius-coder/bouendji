---
id: api-core
title: API — routes internes, app, tests
kind: agent
status: done
updated: 2026-10-20
scope: "Écrire les routes d ingestion, app.ts, server.ts et les tests de apps/api, puis les faire passer au vert. Ne tranche aucune décision produit ouverte (TTL, mode d authentification) : les rendre configurables."
owns: [api-routes,endpoint-lifecycle]
---

# Charte — API — routes internes, app, tests

## Mission

Écrire les routes d ingestion, app.ts, server.ts et les tests de apps/api, puis les faire passer au vert. Ne tranche aucune décision produit ouverte (TTL, mode d authentification) : les rendre configurables.

## Périmètre

Ce sous-agent ne touche qu'à ce qui est listé ci-dessus. Tout le reste est hors
sujet, même si ça semble lié.

## Fichiers qu'il possède

- `api-routes`
- `endpoint-lifecycle`

## Interdits

1. Écrire hors de `knowledge/agents/api-core/` — sauf les fichiers explicitement
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
   ## 2026-10-20T13:26:32Z · <titre court>
   - fait: ...
   - etat: ok | partiel | bloqué
   - suite: ...
   - fichiers: ...
   ```

3. **À la fin** : une entrée `CLÔTURE` avec le résultat, ce qui est vérifié et
   ce qui ne l'est pas, et les questions laissées ouvertes.

## Journal

Le journal est `log.md`, append-only, dans ce dossier.
