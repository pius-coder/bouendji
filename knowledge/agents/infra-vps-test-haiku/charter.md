---
id: infra-vps-test-haiku
title: Test de l'image d'endpoint sur le VPS + env Cloud Run
kind: agent
status: done
updated: 2026-10-25
scope: "1) Déployer l'image ghcr.io/pius-coder/vpn-endpoint:latest sur aura-vps (Docker, conteneur de test jetable) contre https://api.numzer0.store et prouver register → ready → heartbeat → présence dans le pool admin. 2) Retirer de la doc/env toute exigence de saisir l'URL Cloud Run avant déploiement (PUBLIC_HOST déduit des métadonnées depuis 4105b82)."
owns: [infra/endpoint/README.md,infra/endpoint/cloudrun.env]
---

# Charte — Test de l'image d'endpoint sur le VPS + env Cloud Run

## Mission

1) Déployer l'image ghcr.io/pius-coder/vpn-endpoint:latest sur aura-vps (Docker, conteneur de test jetable) contre https://api.numzer0.store et prouver register → ready → heartbeat → présence dans le pool admin. 2) Retirer de la doc/env toute exigence de saisir l'URL Cloud Run avant déploiement (PUBLIC_HOST déduit des métadonnées depuis 4105b82).

## Périmètre

Ce sous-agent ne touche qu'à ce qui est listé ci-dessus. Tout le reste est hors
sujet, même si ça semble lié.

## Fichiers qu'il possède

- `infra/endpoint/README.md`
- `infra/endpoint/cloudrun.env`

## Interdits

1. Écrire hors de `knowledge/agents/infra-vps-test-haiku/` — sauf les fichiers explicitement
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
   ## 2026-10-25T05:23:55Z · <titre court>
   - fait: ...
   - etat: ok | partiel | bloqué
   - suite: ...
   - fichiers: ...
   ```

3. **À la fin** : une entrée `CLÔTURE` avec le résultat, ce qui est vérifié et
   ce qui ne l'est pas, et les questions laissées ouvertes.

## Journal

Le journal est `log.md`, append-only, dans ce dossier.
