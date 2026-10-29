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

## Panne réseau du 29/10 au soir — ce qui a débloqué le déploiement

Le déploiement dashboard de `0bdaa67` a échoué **8 fois** avec
`TypeError: fetch failed` (JSON `{"status":"error","reason":"deploy_failed"}`).
Le CLI mourait 3 s après « Creating the deployment and starting upload », sur
`Determining necessary files for upload` — donc avant tout build Vercel.
Ce n'est **pas** le projet : 2 930 fichiers détectés (sous la limite de 15 000),
`vercel whoami`, `vercel env ls` et `vercel pull` répondaient.

Diagnostic réseau : `curl -6 https://api.vercel.com` échoue instantanément
(IPv6 morte), `curl -4` répond mais en ~16 s. Node choisissait la mauvaise
famille d'adresses.

Ce qui a fait passer le déploiement (tentative 1 avec ces réglages) :

```bash
VERCEL=C:/Users/lenovo/AppData/Local/npm-cache/_npx/69f9afb961c37556/node_modules/.bin/vercel
NODE_OPTIONS="--dns-result-order=ipv4first --no-network-family-autoselection" \
  "$VERCEL" deploy --prod --scope freeteam5 --archive=tgz
```

- **Forcer IPv4** (`--dns-result-order=ipv4first`,
  `--no-network-family-autoselection`) : c'est le correctif principal.
- **Appeler le binaire en cache**, pas `npx vercel` : `npx` a tenté de
  télécharger la 65.8.0 en pleine panne et a bloqué 240 s (exit 124).
- `.vercelignore` exclut désormais `re-geny`, `re-simonfree`, `test_*.png`
  (en plus de `knowledge`, `docs`, `tools`, `apps/android`, `*.apk`).

Résultat : déploiement `E9dWLSK62PRWD67vYRii7mhQ6Deo`, **Ready**, alias
`vpn-dashboard-seven.vercel.app` → `/login` 200, `/` 307, contenu neuf servi
(« Bon retour parmi nous », « Pilotez votre réseau »).

### `vercel build --prebuilt` : impossible sur cette machine

Le chemin « prebuilt » (upload de `.vercel/output` seul) échoue avant le
build : la commande d'installation du projet est du shell POSIX
(`if [ -f turbo.json ]; then … else cd ../.. …`), exécutée par `cmd.exe` sous
Windows → `-f était inattendu`. `vercel pull --yes --environment production`
fonctionne, mais `vercel build` ne peut pas enchaîner. Ne pas perdre de temps
dessus : utiliser `deploy --archive=tgz` avec IPv4 forcé.

