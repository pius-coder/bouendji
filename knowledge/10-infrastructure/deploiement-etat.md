---
id: deploiement-etat
title: État du déploiement — 2026-10-20 22:50
tags: [deploiement, cloud-run, docker, reseau, etat]
status: stale
updated: 2026-10-20
related: [cloud-run-deploy-form, gcp-v2ray-repo, cloud-run, vercel]
---

> **Remplacé le 2026-10-20 (soir).** Cloud Run est abandonné (D32) : Vercel pour
> le dashboard et l'API, l'endpoint restant en dehors. Ce nœud reste comme trace
> des faits mesurés ce soir-là — dont l'état du réseau, qui n'a pas changé.

## Ce qui est vérifié

| Fait | Preuve |
|---|---|
| API : 94 tests, 0 échec | `pnpm test` dans `apps/api`, sortie citée (22:40) |
| `tsc --noEmit` propre après durcissement `JWT_SECRET` | `pnpm typecheck` → exit 0 |
| Dashboard exporté présent | `apps/admin/out/index.html` existe |
| Dockerfile + `.dockerignore` écrits à la racine | fichiers créés, build non abouti |
| Image de base `node:22-bookworm-slim` en cache local | `docker pull` réussie à l'essai 2 (WSL) |
| Docker tourne dans WSL (pas via Docker Desktop) | `docker info` → server 29.8.0 |
| Archive source prête | `dist/vpn-api-source.tar.gz`, 253 420 octets |
| Racine de dépôt : 1 commit, 4 fichiers modifiés depuis | `git log`, `git status` |

## Ce qui n'est pas vérifié

- **L'image API n'a jamais été construite.** Deux échecs : `corepack` n'a pas pu
  télécharger pnpm (`registry.npmjs.org`), puis Docker Hub a rendu un handshake
  TLS en échec. Le `Dockerfile` porte maintenant une boucle de 5 tentatives
  d'installation : non exécutée.
- **Aucun déploiement Cloud Run.** `gcloud` absent localement ; le compte de lab
  (`student-04-...@qwiklabs.net`) n'a que l'interface Cloud Run.
- **Postgres réel jamais utilisé.** Seul PGlite (`memory://` en test).
- **APK jamais compilé.** JDK partiel (`temurin17.zip` = 72,1 Mo sur ~190).
  Aucun `libbox` : même compilé, le tunnel ne peut pas s'établir.

## Pourquoi le build local a échoué

Le réseau de cette machine coupe les gros transferts : `EOF`, `SSL unexpected
eof`, handshake TLS. Relevé sur les mêmes URL, même machine, quelques minutes
d'écart : échec, puis succès. **La reprise est la seule stratégie qui marche**,
pas le diagnostic.

Conséquence : construire l'image ici est possible mais peu fiable. La voie qui
ne dépend pas de ce réseau est **Cloud Shell** (construit par Google, `gcloud`
déjà authentifié dans la session du lab).

## Contrainte structurante (rappel)

`gcp-v2ray-repo.md` : l'utilisateur n'a accès qu'à l'**interface Cloud Run**.
Donc pas de Secret Manager : les valeurs sensibles vivent en variables
d'environnement du service, **lisibles dans la console**. À assumer explicitement,
pas à masquer.