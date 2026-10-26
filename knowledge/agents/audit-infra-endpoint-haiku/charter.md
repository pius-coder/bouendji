---
id: audit-infra-endpoint-haiku
title: Audit infra - conteneur endpoint et deploiement de nuit
kind: agent
status: done
updated: 2026-10-26
scope: "infra/endpoint (Dockerfile, entrypoint.sh, README, config.example.json), knowledge/10-infrastructure (cloud-run, cloud-run-deploy-form, aura-vps-3x-ui, endpoint-lifecycle, traffic-stats, node-control). Plan points 4 et 6 : procedure de deploiement manuel a 20 h et minuit, noms, 3x-ui."
owns: [knowledge/agents/audit-infra-endpoint-haiku]
---

# Charte — Audit infra - conteneur endpoint et deploiement de nuit

## Mission

infra/endpoint (Dockerfile, entrypoint.sh, README, config.example.json), knowledge/10-infrastructure (cloud-run, cloud-run-deploy-form, aura-vps-3x-ui, endpoint-lifecycle, traffic-stats, node-control). Plan points 4 et 6 : procedure de deploiement manuel a 20 h et minuit, noms, 3x-ui.

## Périmètre

Ce sous-agent ne touche qu'à ce qui est listé ci-dessus. Tout le reste est hors
sujet, même si ça semble lié.

## Fichiers qu'il possède

- `knowledge/agents/audit-infra-endpoint-haiku`

## Interdits

1. Écrire hors de `knowledge/agents/audit-infra-endpoint-haiku/` — sauf les fichiers explicitement
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
   ## 2026-10-26T10:40:10Z · <titre court>
   - fait: ...
   - etat: ok | partiel | bloqué
   - suite: ...
   - fichiers: ...
   ```

3. **À la fin** : une entrée `CLÔTURE` avec le résultat, ce qui est vérifié et
   ce qui ne l'est pas, et les questions laissées ouvertes.

## Journal

Le journal est `log.md`, append-only, dans ce dossier.
