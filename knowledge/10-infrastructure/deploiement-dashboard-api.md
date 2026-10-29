---
id: deploiement-dashboard-api
title: Déploiement dashboard (Vercel) et API (Dokku) — procédures réelles
tags: [vercel, dokku, deploiement, dashboard, api]
status: verified
updated: 2026-10-29
related: [vercel, deploiement-etat, D109, livraison-apk-2026-10-26]
---

# Déploiement dashboard + API — procédures vérifiées

## Dashboard → Vercel (D109)

- **Projet : `freeteam5/vpn-dashboard`** (`prj_QArRAIICvVgwUSRSTxpOpgjBl5wB`),
  Root Directory `apps/dashboard`, Node 24, région iad1.
  Alias production : https://vpn-dashboard-seven.vercel.app
- Variables **déjà posées** sur le projet : `API_BASE_URL`,
  `DASHBOARD_ACCESS_KEY` (production). Ne pas les recréer ailleurs.
- **Pas de lien Git** (refusé, D109) : chaque mise à jour = déploiement manuel
  `npx vercel deploy --prod --scope freeteam5` **depuis la racine du dépôt**.
- Pièges vérifiés le 2026-10-29 :
  - Un projet parasite `freeteam5/dashboard` a été créé le 28/10 par erreur
    (Root Directory `.`, commandes install/build custom avec `cd ../..`) : son
    unique déploiement est en Error. Ne pas s'y lier.
  - Depuis la racine, le dépôt dépasse **15 000 fichiers** : `vercel deploy`
    refuse (`missing_archive`). Passer **`--archive=tgz`**.
  - L'upload coupe sur ce réseau (`fetch failed`) : **relancer** (comme les
    uploads R2, ça passe en général avant le 3e essai).
  - `.vercel/` à la racine doit pointer sur `vpn-dashboard`
    (`vercel link --project vpn-dashboard`).

## API → Dokku `vpn-api` (aura-vps)

1. **Sauvegarde DB** avant tout :
   `ssh aura-vps "sudo docker exec dokku.postgres.vpn-db pg_dump -U postgres vpn_db | gzip > ~/backups/vpn-db-<date>.sql.gz"`
2. **Dépôt réduit** (contexte = `apps/api/Dockerfile`, qui copie `package.json`,
   `bun.lock`, `packages/contract`, `apps/api`) : `git archive <branche>
   package.json bun.lock packages/contract apps/api`, extraire, copier
   `apps/api/Dockerfile` → racine, `git init -b master`, commit.
3. Transférer sur le VPS (`scp /tmp`), puis :
   `sudo chown -R dokku:dokku /tmp/vpn-api-reduced` **obligatoire** (sinon
   « dubious ownership »), puis
   `dokku git:sync --build vpn-api /tmp/vpn-api-reduced master`.
   - `dokku git:build` **n'existe pas** sur cette version ; c'est
     `git:sync --build` qui enchaîne fetch + build + deploy + healthchecks.
4. Vérif : healthchecks dans la sortie, puis `curl https://api.numzer0.store/readyz`
   → 401 sans clé (attendu), `/openapi.json` → 200.

## État au 2026-10-29

- API prod déployée sur `9d62b36` (= `5e8ab45` de `api/prod-hardening`,
  parseur VLESS multi-liens inclus). Healthchecks OK, API répond.
- Sauvegarde : `~/backups/vpn-db-2026-10-29-avant-multilien.sql.gz` (80 Ko).
