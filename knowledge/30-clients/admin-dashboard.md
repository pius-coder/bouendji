---
id: admin-dashboard
title: Dashboard admin — console Next.js servie sous /admin/
tags: [admin, nextjs, dashboard, export-statique, apercu]
status: stale
updated: 2026-10-20
related: [roles-and-commissions, api-routes, brand-build]
---

> **Supprimé le 2026-10-20 (soir).** Le dashboard a été rejeté et
> `apps/admin/` a été retiré. Ce nœud reste comme **trace de ce qui a été
> essayé** — notamment les écrans, les faits mesurés et les pièges — pour que la
> réécriture ne les redécouvre pas. Ne pas s'en servir comme description de
> l'état actuel. Voir D32/D33 dans `00-brief/decisions.md`.

# Dashboard admin — console Next.js

## Principe

Le dashboard est une application **Next.js 15 (App Router, TypeScript)** en
export statique, pas une SPA écrite à la main (D31). Elle ne tourne pas : elle
est **produite**, puis servie par Fastify sous `/admin/`. Un seul processus en
production, aucun second service, aucune requête vers un CDN.

```js
// apps/admin/next.config.mjs
output: "export", basePath: "/admin", trailingSlash: true, images: { unoptimized: true }
```

Conséquence directe : les URL d'assets dans `out/index.html` commencent par
`/admin/_next/...`. Servir `out/` à la racine casserait tout ; c'est `app.ts`
qui monte `apps/admin/out` sur `/admin/` et répond **503** avec la commande de
build quand l'export manque.

## Arborescence

| Chemin | Rôle |
|---|---|
| `app/layout.tsx` | `lang="fr"`, `referrer: same-origin`, import de `globals.css` |
| `app/page.tsx` | unique route, rend `<Shell />` (tout l'état vit côté client) |
| `app/globals.css` | design system complet, clair/sombre, sans police distante |
| `components/Shell.tsx` | barre supérieure, navigation, routage d'écran par `ScreenId` |
| `components/SessionProvider.tsx` | jeton en mémoire + `sessionStorage`, login, bannière |
| `components/CommunitiesProvider.tsx` | liste des communautés, sélection courante |
| `lib/api.ts` | **seul** point réseau : chemins `/v1/...` obligatoires, un seul ajout d'`Authorization` |
| `lib/normalize.ts` | relit chaque champ en liste blanche (`unknown` → DTO typé) |
| `lib/permissions.ts` | copie de `permitted()` d'`apps/api/src/routes/admin.ts` |
| `lib/download.ts` | `Blob` + `createObjectURL` : fichier hors-ligne créé en mémoire, jamais via une URL |

## Écrans

Connexion, Vue d'ensemble, Communautés, Membres, Commandes, Commissions,
Appareils, Pool, Journal d'audit.

- **Appareils** : liste par communauté, réémission du fichier hors-ligne
  (`POST /v1/admin/devices/:deviceId/offline-bundles`, `{ttlHours}`), téléchargement
  du `file` signé, révocation.
- **Pool** : `GET /v1/admin/pool` — état des endpoints, TTL restant.
- **Commissions** : `GET /v1/admin/communities/:id/commissions` et
  `POST .../payouts`.
- **Audit** : `GET /v1/admin/audit-log?limit=…&community_id=…` (lecture seule).

Les chemins sont **ceux du serveur** : pas d'alias `overview`, pas de
`/v1/admin/orders` global. Une communauté est toujours dans le chemin.

## Permissions

`lib/permissions.ts` ne décide de rien : il **masque** ce que le serveur
refuserait. `platform_role = owner` voit tout ; `community_admin`, `support` et
`finance` voient un sous-ensemble par communauté ; un refus serveur (403)
revient comme une bannière, pas comme un écran vide.

## Construire et voir

```bash
pnpm --filter @vpn/admin typecheck        # tsc --noEmit
pnpm --filter @vpn/admin build            # produit apps/admin/out/
pnpm --filter @vpn/api dev                # sert http://localhost:8080/admin/
```

`apps/admin/out` n'est pas versionné : sans build, `/admin/` répond 503.

Aperçu local avec données réelles (base PGlite `apps/api/data`, dev seulement) :

```bash
cd apps/api
SEED_ADMIN_PASSWORD='<mot de passe >= 12 caracteres>' pnpm seed
PORT=8080 pnpm dev        # puis http://localhost:8080/admin/
```

Alternativement `pnpm --filter @vpn/admin dev` (port 3001, `basePath` conservé,
donc `http://localhost:3001/admin/`) pour recharger à chaud — mais les appels
`/v1/...` partent alors vers le serveur de dev Next et échouent : cet aperçu
sert à la mise en page, pas aux flux.

## Vérifié ici

- `pnpm --filter @vpn/admin typecheck` → **exit 0**.
- `pnpm --filter @vpn/admin build` → **exit 0**, Next 15.5.28, 4 pages
  générées, `Exporting (2/2)`, `out/index.html` 7 385 o.
- Assets : `out/index.html` référence `/admin/_next/static/css/643fff…css` ;
  `GET /admin/` → **200**, `GET /admin/_next/static/css/…` → **200** (14 227 o).
- `POST /v1/admin/auth/login` avec le compte seedé → **200**, `platformRole: owner`.
- `GET /v1/admin/me`, `/v1/admin/pool`, `/v1/admin/audit-log?limit=5`,
  `/v1/admin/communities` avec ce jeton → **200**.

## Non vérifié

- Aucun test automatisé de l'interface (pas de Playwright ici) : les parcours
  communautés, membres, commandes, commissions, appareils et hors-ligne sont
  **relus**, pas exécutés au navigateur.
- Aucune QA visuelle : rendu clair/sombre, focus clavier et débordements de
  tableaux non contrôlés.
- `pnpm --filter @vpn/admin dev` pas lancé ; le port 3001 et le `basePath` sont
  conformes à la configuration, pas à une observation.

## Pièges

- Le script `start` a été **retiré** de `apps/admin/package.json` : il pointait
  vers `scripts/serve.mjs`, qui n'existe pas. Le serveur, c'est l'API.
- `out/` est un artefact : le committer ferait diverger le servi du construit.
- Toute image distante ou police CDN casserait la promesse « aucun tiers » du
  dashboard ; le CSS n'embarque que des polices système.
