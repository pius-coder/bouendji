---
id: pages-cloudflare-2026-10-30
title: Pages de téléchargement dynamiques sur Cloudflare (sous-domaines)
tags: [cloudflare, worker, pages, download, api, automation]
status: verified
updated: 2026-10-30
related: [android-update-push-2026-10-30, livraison-apk-2026-10-30, decisions]
---

# Pages de téléchargement dynamiques — Cloudflare

## Architecture

Un **Worker** `cleanforce-plus` (compte `tuekampius13@gmail.com`) sert une page
de téléchargement **par sous-domaine** :

- `saitrix.cleanforceplus.online`, `nevpn.cleanforceplus.online`,
  `gregor44…`, `james-pro…`, `dalas-npv…`, `goatvpn…`, `teste…`,
  `bouendji…` et `www`/racine (404 volontaire, D144 : pas d'annuaire).
- Le Worker lit le sous-domaine, interroge **le catalogue public de l'API**
  (`GET /v1/apps/:appId/plans`) et rend le HTML : nom, version publiée, APK
  versionné, contacts saisis par l'administrateur.
- Plus **aucune page HTML à réécrire** : une nouvelle version publiée
  apparaît automatiquement (cache 5 min côté Worker).
- Repli si l'API est injoignable : asset statique « indisponible, réessaie ».

## Piège corrigé

Avec `[assets]` + `binding = "ASSETS"`, l'asset `/index.html` est servi
**avant** le Worker : tous les sous-domaines affichaient le repli. La config
doit porter `run_worker_first = true`.

## Ajouter une marque

1. Enregistrement DNS proxied `*.cleanforceplus.online` (existe déjà via les
   entrées par sous-domaine du compte Cloudflare) ;
2. une ligne dans `APPS` (`cloudflare/cleanforce-plus/worker.js`) :
   sous-domaine → `apps.id` ;
3. `wrangler deploy` depuis `cloudflare/cleanforce-plus/`.

Les domaines personnalisés du Worker (`www`, chaque sous-domaine) restent
attachés au Worker lors d'un nouveau déploiement.

## Vérifié (2026-10-30)

- Déploiement `wrangler deploy` : version `17af50c6-…`.
- **8/8 sous-domaines** en 200 avec la version et l'APK attendus
  (`apps.cleanforceplus.online/brands/<pkg>/<pkg>-<version>-<code>.apk`, HEAD 200).
- `www.cleanforceplus.online` et racine : 404 (comportement conservé).

## Ancien système

`dl.numzer0.store` (nginx `vpn-dl` sur aura-vps, HTML statique réécrit à la
main) reste en place mais est **supplanté** : à retirer ou rediriger quand la
décision est prise. Les APK restent sur Cloudflare R2 (`apps.numzer0.store`,
alias `apps.cleanforceplus.online`).
