# Contribution — monorepo Bouendji

Deux personnes, deux périmètres, une seule `master` à protéger.

## Périmètres (qui touche à quoi)

| Chemin | Propriétaire | Review obligatoire |
|---|---|---|
| `apps/android/**`, `tools/build-libbox.ps1`, `tools/inject-brand.mjs`, `.github/workflows/android-brand.yml` | @pius-coder (Android) | @pius-coder |
| `apps/api/**`, `packages/contract/**`, `infra/endpoint/**` | @mani-iks (API) | @mani-iks |
| `apps/admin/**` (à recréer, Next.js) | @mani-iks (admin) | @mani-iks |
| `knowledge/**` | partagé | les deux si décision (Dxx) |
| `preview/**` | @pius-coder | info, jamais bloquant |
| `vercel.json`, `apps/api/middleware.ts`, `apps/api/src/lib/decoy.ts` | @mani-iks + @pius-coder | les deux (touche aux deux) |

Voir `.github/CODEOWNERS` : GitHub demande la review automatiquement.
Ne jamais merger sa propre PR sans l'autre review quand le fichier est hors
de son périmètre.

## Branches

- `master` : protégée, déployée. Jamais de commit direct.
- `android/*` : @pius-coder. Ex : `android/libbox-arm64`.
- `api/*` : @mani-iks. Ex : `api/catalog-public`.
- `admin/*` : @mani-iks. Ex : `admin/login`.
- `chore/*` : commun (docs, CI, vercel). Ex : `chore/decoy-url`.

Cycle : branche → PR → CI verte → review du propriétaire → squash-merge.
Une PR = un sujet. 19 fichiers modifiés + 9 untracked comme le 2026-10-22,
on ne refait plus : découper.

## PR minimale

Titre : `<scope>: <quoi>` (`android:`, `api:`, `admin:`, `chore:`).

Checklist dans la description :
- [ ] `pnpm --filter @vpn/api typecheck` ou `./gradlew :app:assembleDebug` selon scope
- [ ] tests ajoutés/maj si route ou contrat changé (`apps/api/test/`)
- [ ] pas de `vless://` en clair, pas de secret (voir Interdits AGENTS.md)
- [ ] `knowledge/` maj si décision ou piège (un sujet = un nœud, décision datée en `00-brief/decisions.md`)

## Contrats entre vous deux (ne pas casser sans prévenir)

1. **Routes** : `ApiPaths` (`apps/android/.../net/ApiClient.kt:770`) est le miroir
   de `apps/api/src/routes`. Toute route ajoutée côté API doit avoir son
   appel `ApiClient` + test dans la même release, ou la PR est refusée.
2. **En-têtes leurre** : l'app envoie toujours `User-Agent: vpn-android` +
   `X-App-Id: <appId>` (+ preuve `X-Device-*` ou `Authorization: Bearer` quand
   la route l'exige). Voir `apps/api/src/lib/decoy.ts`. Ne pas renommer un
   en-tête sans PR commune.
3. **Catalogue** : `GET /v1/apps/:appId/plans` reste public mais exige
   `X-App-Id` (même valeur que `:appId`) — sinon 302 vers le leurre. Le prix
   reste fixé par communauté (D35, `commission_bps <= 3000`).
4. **Vercel** : 2 projets, même repo :
   - `bouendji-api` : Root Directory `apps/api`, domaine `bouendji.numzer0.store`.
   - `bouendji-admin` : Root Directory `apps/admin` (à recréer), domaine à définir.
   Ne jamais mettre `apps/android` sur Vercel. `DECOY_URL` est une variable
   d'environnement Vercel (Preview = leurre de test, Production = vrai site SMS).

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
- Deux couches : Edge `apps/api/middleware.ts` (Vercel) + fallback Fastify
  `apps/api/src/lib/decoy.ts` (local, tests, si l'Edge est désactivé).

## Interdits (rappel AGENTS.md)

- `vless://` en clair dans app, log, test. Jamais.
- Secret, `.jks`, `.env` commité. Jamais.
- Prix/limite/endpoint inventé. Vérifier dans `knowledge/` ou le code.
- `apps/android/.gradle/`, `local.properties`, `*.apk` : ignorés, ne pas forcer.
