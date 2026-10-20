---
id: infra-endpoint
title: Conteneur d endpoint
kind: agent
status: done
updated: 2026-10-20
scope: "Écrire infra/endpoint : Dockerfile, entrypoint POSIX, config Xray générée depuis l enregistrement, heartbeat, arrêt sans désinscription. Livrable exécutable sur Cloud Run, sans dépendance à gcloud."
owns: [gcp-v2ray-repo,endpoint-lifecycle,cloud-run-deploy-form]
---

# Charte — Conteneur d endpoint

## Mission

Écrire infra/endpoint : Dockerfile, entrypoint POSIX, config Xray générée depuis l enregistrement, heartbeat, arrêt sans désinscription. Livrable exécutable sur Cloud Run, sans dépendance à gcloud.

## Périmètre

Ce sous-agent ne touche qu'à ce qui est listé ci-dessus. Tout le reste est hors
sujet, même si ça semble lié.

## Fichiers qu'il possède

- `gcp-v2ray-repo`
- `endpoint-lifecycle`
- `cloud-run-deploy-form`

## Interdits

1. Écrire hors de `knowledge/agents/infra-endpoint/` — sauf les fichiers explicitement
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
