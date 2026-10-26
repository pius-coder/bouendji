---
id: w1-api-r7-haiku
title: Vague 1 - R7 3x-ui et bundle
kind: agent
status: active
updated: 2026-10-26
scope: "Serveurs 3x-ui enregistres par les owners, client dedie par abonnement limite, lecture du trafic et coupure, bundle a deux familles avec startsAt, fichier de secours borne."
owns: [knowledge/agents/w1-api-r7-haiku]
---

# Charte — Vague 1 - R7 3x-ui et bundle

## Mission

Serveurs 3x-ui enregistres par les owners, client dedie par abonnement limite, lecture du trafic et coupure, bundle a deux familles avec startsAt, fichier de secours borne.

## Périmètre

Ce sous-agent ne touche qu'à ce qui est listé ci-dessus. Tout le reste est hors
sujet, même si ça semble lié.

## Fichiers qu'il possède

- `knowledge/agents/w1-api-r7-haiku`

## Interdits

1. Écrire hors de `knowledge/agents/w1-api-r7-haiku/` — sauf les fichiers explicitement
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
   ## 2026-10-26T11:21:30Z · <titre court>
   - fait: ...
   - etat: ok | partiel | bloqué
   - suite: ...
   - fichiers: ...
   ```

3. **À la fin** : une entrée `CLÔTURE` avec le résultat, ce qui est vérifié et
   ce qui ne l'est pas, et les questions laissées ouvertes.

## Journal

Le journal est `log.md`, append-only, dans ce dossier.
