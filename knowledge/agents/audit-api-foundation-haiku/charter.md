---
id: audit-api-foundation-haiku
title: Audit API - socle, config, schema, contrats, tests
kind: agent
status: done
updated: 2026-10-26
scope: "app.ts, server.ts, config.ts, db.ts, schema.ts (style de migration), openapi.ts, http/contracts.ts, http/schemas.ts, packages/contract, apps/api/test (structure seulement). Faisabilite SSE + LISTEN/NOTIFY, ajout de colonnes, conventions."
owns: [knowledge/agents/audit-api-foundation-haiku]
---

# Charte — Audit API - socle, config, schema, contrats, tests

## Mission

app.ts, server.ts, config.ts, db.ts, schema.ts (style de migration), openapi.ts, http/contracts.ts, http/schemas.ts, packages/contract, apps/api/test (structure seulement). Faisabilite SSE + LISTEN/NOTIFY, ajout de colonnes, conventions.

## Périmètre

Ce sous-agent ne touche qu'à ce qui est listé ci-dessus. Tout le reste est hors
sujet, même si ça semble lié.

## Fichiers qu'il possède

- `knowledge/agents/audit-api-foundation-haiku`

## Interdits

1. Écrire hors de `knowledge/agents/audit-api-foundation-haiku/` — sauf les fichiers explicitement
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
   ## 2026-10-26T10:40:08Z · <titre court>
   - fait: ...
   - etat: ok | partiel | bloqué
   - suite: ...
   - fichiers: ...
   ```

3. **À la fin** : une entrée `CLÔTURE` avec le résultat, ce qui est vérifié et
   ce qui ne l'est pas, et les questions laissées ouvertes.

## Journal

Le journal est `log.md`, append-only, dans ce dossier.
