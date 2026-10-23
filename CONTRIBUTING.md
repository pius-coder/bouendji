# Contribution — monorepo Bouendji

Deux personnes, deux périmètres, une seule voie vers `master` : `dev`.

## Périmètres (qui touche à quoi)

| Chemin | Propriétaire | Review obligatoire |
|---|---|---|
| `apps/android/**`, `tools/build-libbox.ps1`, `tools/inject-brand.mjs`, `.github/workflows/android-brand.yml` | @pius-coder (Android) | @pius-coder |
| `apps/api/**`, `packages/contract/**`, `infra/endpoint/**` | @mani-iks (API) | @mani-iks |
| `apps/admin/**` (à recréer, Next.js) | @mani-iks (admin) | @mani-iks |
| `knowledge/**` | partagé | les deux si décision (Dxx) |
| `preview/**` | @pius-coder | info, jamais bloquant |
| `vercel.json`, `apps/api/src/lib/decoy.ts` | @mani-iks + @pius-coder | les deux (touche aux deux) |

Voir `.github/CODEOWNERS` : GitHub demande la review automatiquement.
Ne jamais merger sa propre PR sans l'autre review quand le fichier est hors
de son périmètre.

## Branches

**La seule porte d'entrée de `master` est `dev`.** Plus aucun commit direct sur
`master`, plus aucune PR qui la vise directement.

- `master` : production. Elle ne reçoit que des merges depuis `dev`.
- `dev` : intégration. Toute PR de travail vise `dev`.
- `android/*` : @pius-coder. Ex : `android/libbox-arm64`.
- `api/*` : @mani-iks. Ex : `api/catalog-public`.
- `admin/*` : @mani-iks. Ex : `admin/login`.
- `chore/*` : commun (docs, CI, vercel). Ex : `chore/decoy-url`.

Cycle d'une PR : branche → PR vers `dev` → CI verte → review du propriétaire →
squash-merge. Puis, quand `dev` est stable et vérifiée, PR `dev` → `master`
(la seule). Une PR = un sujet. 19 fichiers modifiés + 9 untracked comme le
2026-10-22, on ne refait plus : découper.

## PR minimale

Titre : `<scope>: <quoi>` (`android:`, `api:`, `admin:`, `chore:`).

Checklist dans la description :
- [ ] `pnpm --filter @vpn/api typecheck` **et** `pnpm --filter @vpn/api typecheck:vercel` (l'adaptateur serverless est hors du `tsconfig` principal ; sans le second, une PR peut être verte avec une fonction cassée)
- [ ] `pnpm --filter @vpn/api test` (159 tests au 2026-10-23)
- [ ] `pnpm --filter @vpn/api openapi` si une route change : le `openapi.json` versionné doit être régénéré (`/openapi.json` et `/reference` doivent décrire la même surface)
- [ ] tests ajoutés/maj si route ou contrat changé (`apps/api/test/`)
- [ ] pas de `vless://` en clair, pas de secret (voir Interdits AGENTS.md)
- [ ] `knowledge/` maj si décision ou piège (un sujet = un nœud, décision datée en `00-brief/decisions.md`)

## Documentation de l'API

Code-first : `@fastify/swagger` (OpenAPI **3.1.0**) lit les schémas des routes,
et Scalar sert l'interface de lecture. Deux URL, une seule source :

- `/openapi.json` — le document, consommé par la CI et les générateurs de SDK ;
- `/reference` — l'interface (Scalar), pas Swagger UI.

`fastify-openapi-glue` est écarté : il impose des handlers non standard et
remplacerait les routes Fastify existantes. Un middleware OpenAPI en `preHandler`
aurait dupliqué la validation zod déjà en place.

## Contrats entre vous deux (ne pas casser sans prévenir)

1. **Routes** : `ApiPaths` (`apps/android/.../net/ApiClient.kt`) est le miroir
   de `apps/api/src/routes` **pour le mobile**. Toute route mobile ajoutée côté
   API doit avoir son appel `ApiClient` + test dans la même release. Les routes
   `/v1/admin/*`, `/v1/internal/*` et `/v1/offline-bundles/*` n'ont pas de
   pendant mobile par construction (console, conteneurs, admin) : elles sont
   couvertes par `apps/api/test/` et décrites dans `/openapi.json`.
2. **En-têtes leurre** : l'app envoie toujours `User-Agent: vpn-android` +
   `X-App-Id: <appId>` (+ preuve `X-Device-*` ou `Authorization: Bearer` quand
   la route l'exige). Voir `apps/api/src/lib/decoy.ts`. Ne pas renommer un
   en-tête sans PR commune.
3. **Catalogue** : `GET /v1/apps/:appId/plans` reste public. Le leurre ne teste
   que la **présence** de `X-App-Id` (≥ 2 caractères) et de `vpn-android` dans
   l'`User-Agent`, et ne redirige que si `Accept: text/html` — un client JSON
   sans métadonnées reçoit un JSON normal. La valeur de `X-App-Id` n'est **pas**
   confrontée au `:appId` : c'est un rideau, pas une autorisation, et l'`appId`
   est public par construction (il est dans l'APK). Le prix reste fixé par
   communauté (D35, `commission_bps <= 3000`).
4. **Vercel** : 2 projets, même repo :
   - `bouendji-api` : Root Directory `apps/api`, domaine `bouendji.numzer0.store`.
     Le routage est porté par `apps/api/vercel.json` (`rewrites` catch-all vers
     `/api/index`) — sans lui, `/v1/*` n'atteint jamais Fastify.
   - `bouendji-admin` : Root Directory `apps/admin` (à recréer), domaine à définir.
   Ne jamais mettre `apps/android` sur Vercel. `DECOY_URL` est une variable
   d'environnement Vercel (Preview = leurre de test, Production = vrai site SMS).
5. **Authentification** : le compte est **par marque** (`UNIQUE (app_id, lower(email))`),
   `phone` obligatoire à l'inscription, `appId` obligatoire à la connexion (D53).
   La console exige `X-Access-Key` sur **tous** les `/v1/admin/*`, login compris (D54).

## Vercel + leurre (résumé)

- Domaine réel visible dans l'APK : `bouendji.numzer0.store`. Le reverse est
  inévitable : le leurre n'est **pas** une sécurité, juste un rideau.
- La vraie sécurité reste : preuve d'appareil signée, JWT 15 min, refresh
  rotatif, bundle scellé ECDH (D4/D5). Le leurre ne remplace rien.
- Requête sans métadonnées + `Accept: text/html` (navigateur curieux) → `302`
  vers `DECOY_URL` (`https://example-sms.com` en attendant le vrai site SMS).
- Requête API légitime (`X-App-Id` + `User-Agent: vpn-android`) → JSON normal,
  jamais de redirect.
- Exceptions qui ne redirigent **jamais** : `/healthz`, `/readyz`,
  `/v1/payments/webhook/*` (Fapshi doit toujours passer, D14).
- Une seule couche : Fastify `apps/api/src/lib/decoy.ts`. Le `middleware.ts`
  Edge a été supprimé le 2026-10-23 : il importait `next/server` alors que
  `next` n'est pas une dépendance, il ne compilait pas, et il doublait le
  rideau Fastify. Un projet Vercel « Functions » ne charge pas de middleware Next.
- `apps/api/api/index.ts` porte `export const config = { api: { bodyParser: false } }` :
  la preuve d'appareil signe les octets **bruts**. Sans cette ligne, toutes les
  routes signées répondent 401 sur Vercel.

## Interdits (rappel AGENTS.md)

- `vless://` en clair dans app, log, test. Jamais.
- Secret, `.jks`, `.env` commité. Jamais.
- Prix/limite/endpoint inventé. Vérifier dans `knowledge/` ou le code.
- `apps/android/.gradle/`, `local.properties`, `*.apk` : ignorés, ne pas forcer.
