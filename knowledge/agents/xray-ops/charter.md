---
id: xray-ops
title: Xray / 3x-ui — révocation, trafic, API
kind: agent
status: done
updated: 2026-10-20
scope: "Déterminer si 3x-ui ou l API gRPC de Xray permet de désactiver un client à chaud, de lire son trafic par client, et de créer un inbound sans redémarrage. Produire un verdict, pas une collection de liens."
owns: [3x-ui,revocation]
---

# Charte — Xray / 3x-ui — révocation, trafic, API

## Mission

Déterminer si 3x-ui ou l API gRPC de Xray permet de désactiver un client à chaud, de lire son trafic par client, et de créer un inbound sans redémarrage. Produire un verdict, pas une collection de liens.

## Périmètre

Ce sous-agent ne touche qu'à ce qui est listé ci-dessus. Tout le reste est hors
sujet, même si ça semble lié.

## Fichiers qu'il possède

- `3x-ui`
- `revocation`

## Interdits

1. Écrire hors de `knowledge/agents/xray-ops/` — sauf les fichiers explicitement
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
   ## 2026-10-20T13:25:25Z · <titre court>
   - fait: ...
   - etat: ok | partiel | bloqué
   - suite: ...
   - fichiers: ...
   ```

3. **À la fin** : une entrée `CLÔTURE` avec le résultat, ce qui est vérifié et
   ce qui ne l'est pas, et les questions laissées ouvertes.

## Journal

Le journal est `log.md`, append-only, dans ce dossier.
