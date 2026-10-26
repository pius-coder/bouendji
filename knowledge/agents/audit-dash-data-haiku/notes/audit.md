# Audit — couche données, BFF, session, cache (apps/dashboard)

Tranche : `apps/dashboard/src/server`, `src/lib`, `src/hooks`, `src/proxy.ts`, `next.config.ts`, `package.json`. Lecture seule. Chemins relatifs à `apps/dashboard/`.

## 1. Verdict

- La couche données est saine et cohérente : un seul point d'appel réseau (`BaseService.call`), validation zod avant et après, aucun cache sur les données admin, JWT dans un cookie httpOnly lu côté serveur.
- Elle ne contient **rien** du plan : pas de `mustChangePassword`, connexion email seul, pas de « Mon compte », pas de sessions, pas de cache client, pas de flux SSE, pas de présence.
- Le README interdit explicitement le fetch client et les route handlers (`README.md:24-25`). Le BFF proposé contredit donc une règle écrite : la décision doit être prise avant d'écrire.
- Le skeleton à chaque navigation est un effet direct de `cacheComponents` + `no-store` + cache client dynamique à 0 s. Ce n'est pas un bug, c'est le modèle actuel.
- Déconnexion sans révocation côté API : le JWT reste valide jusqu'à son expiration (8 h).

## 2. Inventaire

| Fichier | Rôle | Taille | État |
|---|---|---|---|
| `src/server/api/base-service.ts` | Process unique d'appel API (validation, URL, en-têtes, timeout, no-store, erreurs) | 202 l | solide |
| `src/server/api/endpoint.ts` | Type `Endpoint` + `endpoint()` | 71 l | solide |
| `src/server/api/api-error.ts` | `ApiError`, enveloppe d'erreur, `ActionFailure` | 107 l | solide (`isForbidden` `:48` jamais utilisé) |
| `src/server/api/session.ts` | Cookie JWT httpOnly (lecture, pose, suppression) | 36 l | solide |
| `src/server/api/config.ts` | `API_BASE_URL`, `DASHBOARD_ACCESS_KEY` | 21 l | solide |
| `src/server/api/schema-kit.ts` | `pageOf`, `listOf` | non lu | (non vérifié) |
| `src/proxy.ts` | Garde : présence du cookie, sinon `/login?next=` | 23 l | partiel (ne vérifie ni signature ni rôle, `:6-7`) |
| `src/server/context.ts` | `getMe`, `getCommunities` (cache React par requête), `withSession` (401 → `/login`) | 31 l | solide, point d'accroche idéal (voir §5) |
| `src/server/actions/auth.action.ts` | `loginAction`, `logoutAction` | 31 l | partiel (email seul, pas de révocation) |
| `src/server/actions/action-result.ts` | `runAction`, `safeNextPath`, `text` | 42 l | solide |
| `src/server/actions/*.action.ts` (10 fichiers) | Server Actions de mutation | non détaillé | solide (même patron `runAction`) |
| `src/server/services/index.ts` | Fabrique des 11 services, `getServices()` | 56 l | solide |
| `src/server/services/admin-auth/admin-auth.service.ts` | `login` (clé seule), `me` | 28 l | creux (2 endpoints) |
| `src/server/services/admin-auth/admin-auth.schema.ts` | `loginBody` (email), `loginResult`, `adminMe` | 36 l | partiel (pas de `mustChangePassword`, pas de WhatsApp) |
| `src/server/services/*/` (autres) | Services par domaine, `refreshAfter` sur 10 fichiers | 2 000 l env. | solide (hors tranche détaillée) |
| `src/server/loaders/home.ts` | Lectures de l'accueil, `cache()` par requête | 61 l | solide, lourd (N+1, voir §6) |
| `src/server/query/table.ts` | Parseurs nuqs partagés par table | ~60 l | solide |
| `src/server/query/*.params.ts` (8 fichiers) | Parseurs par table | <40 l chacun | solide |
| `src/lib/*.ts` (7 fichiers) | Format, rôles (`can`), VLESS, accent, métriques | n.d. | solide ; `roles.ts:50` `can()` côté client |
| `src/hooks/use-local-preference.ts` | Préférence localStorage (`"use client"`) | 30 l | solide |
| `src/hooks/use-media-query.ts`, `use-mobile.ts` | Responsive | courts | solide |
| `next.config.ts` | `cacheComponents: true`, `partialPrefetching: true`, Turbopack Tailwind | 17 l | partiel (pas de `staleTimes`) |
| `package.json` | Dépendances | 46 l | voir §5 |
| `app/(dashboard)/layout.tsx` | Shell synchrone, Suspense par bloc | 72 l | solide (`:23`, sync) |
| `app/(dashboard)/[communityId]/orders/page.tsx` | Exemple de page : shell statique + Suspense | 41 l | solide (`:16-39`) |
| `components/orders/orders-table.tsx` | `readOrders` (cache) + `OrdersRows` (async) | ~70 l | solide (`:20-35`, `:44`) |
| `README.md` | Règles d'architecture | 45 l | à amender (voir §4.7) |

Aucun fichier `mort` repéré dans la tranche. Aucun `mustChangePassword` dans tout `src/` (grep).

## 3. Ce qui sert le plan

- **Patron d'appel unique** : `base-service.ts:58-173`. Validation d'entrée `:72-74` (aucun appel si invalide), réponse validée `:158-166`, `refreshAfter` `:171`. Réutilisable tel quel pour le BFF et les SSE tickets.
- **Erreurs typées** : `parseErrorEnvelope` (`api-error.ts:76-97`) accepte l'enveloppe `{error:{code,message}}` ; `ActionFailure` sérialisable (`api-error.ts:19-26`) : bon contrat pour une API BFF.
- **Session httpOnly** : `session.ts:17-31` (nom `__Host-vpn_admin` en prod, `httpOnly`, `secure`, `sameSite: lax`, `path /`). Réutilisable pour le ticket et le BFF.
- **Secrets serveur** : `base-service.ts:100` ajoute `X-Access-Key` côté serveur ; `config.ts:3-6` garantit l'absence de `NEXT_PUBLIC_`. Le modèle « clé ajoutée par le serveur, jamais au navigateur » est déjà là.
- **Lectures dédoublonnées** : `context.ts:12-13` et `loaders/home.ts:20-36` (`cache()` de React). Utile, mais limité à la requête.
- **Parseurs d'URL partagés** : `query/table.ts:27-50`, `components/orders/orders-table.tsx:14` : URL = source de vérité des filtres, cohérent avec « état du tiroir dans l'URL ».
- **Clé de connexion** : `admin-auth.service.ts:13` (`admin: "key"`) : le JWT n'existe pas avant le login.

## 4. Écarts avec le plan

Points hors tranche (2 à 6, 8, 9) : non audités ici, voir §7.

**4.1 Mot de passe forcé (R1) — écart majeur**
- Aucun champ `mustChangePassword` : `admin-auth.schema.ts:16-35` (`loginResult`, `adminMe`) ; grep `mustChange` dans `src/` : 0 occurrence.
- Connexion par email seul : `admin-auth.schema.ts:11-14` (`email` requis, `.email()`), `auth.action.ts:16`. Le plan exige email OU WhatsApp.
- Pas de révocation des autres sessions : `auth.action.ts:28-31` ne fait qu'effacer le cookie local.
- Pas d'écran « Mon compte » : aucun endpoint profil, mot de passe, sessions dans `admin-auth.service.ts:11-15` (2 endpoints).
- Redirection forcée : aucun point d'accroche encore. Voir §5.1.

**4.2 Libre-service / onboarding — données**
- Création d'admin : `admins.service.ts:19` (`refreshAfter`), `actions/admins.action.ts:8-13`. Pas d'invitation WhatsApp ni d'état d'onboarding dans cette tranche : `(non vérifié hors tranche)` pour `admins.service.ts` entier.

**4.3 Guide par rôle — progression serveur**
- Aucun endpoint ni schéma de progression dans `src/server/services/` (liste des 11 services : `index.ts:20-32`).

**4.7 (point 7) Cache client, SSE, présence — écart majeur**
- Pas de cache client : `package.json:13-34` ne contient ni `@tanstack/react-query` ni autre lib de données. Le README interdit `useQuery`/`fetch` client (`README.md:24`).
- Pas de route handler : `README.md:25` (« Aucun route handler »). Le dossier `src/app/api` n'existe pas.
- Pas de SSE : aucun `EventSource` dans `src/` (grep). Pas de LISTEN/NOTIFY côté dashboard (hors tranche).
- Pas de présence : aucune lecture ni écriture de « qui est connecté » dans la tranche.
- Données admin en `no-store` : `base-service.ts:126` ; `README.md:35` l'affirme. Rien à réutiliser pour un cache client sans règle nouvelle.
- Invalidation : `refresh()` seulement, via `services/index.ts:52` et `base-service.ts:171`, déclenché par 10 services (`refreshAfter`). Cela ne couvre que le RSC de la requête en cours.

**4.8 Réseau — lecture de la tranche**
- `src/server/services/network/network.service.ts` et `query/` : `(non vérifié hors tranche)` pour le champ `vless` ; `src/lib/vless-link.ts` existe (`src/lib/`), contenu non détaillé ici.

## 5. Structure de code proposée

### 5.1 Redirection forcée « changer le mot de passe » (point 1)

- Point d'accroche recommandé : `src/server/context.ts:12` (`getMe`), qui est déjà appelé par chaque lecture du dashboard (`components/orders/orders-table.tsx:21`, `server/loaders/home.ts:21`). Ajouter :
  ```ts
  // context.ts
  export const getMe = cache(async () => {
    const me = await withSession(() => getServices().auth.getMe());
    if (me.mustChangePassword) redirect("/compte/mot-de-passe");
    return me;
  });
  ```
- Schéma : `admin-auth.schema.ts:29-35` ajoute `mustChangePassword: z.boolean()` (et `loginResult.admin` le même champ, `:19-23`).
- Le proxy (`src/proxy.ts:11-18`) ne doit pas appeler l'API (il ne vérifie rien aujourd'hui, et l'appel serait à chaque requête). Option : cookie-indice `vpn_admin_pwd` posé par `loginAction` (`auth.action.ts:20`), lu par le proxy pour rediriger tôt. C'est un indice d'UX, pas une barrière : l'API doit refuser (403 `PASSWORD_CHANGE_REQUIRED`) tant que le mot de passe n'est pas changé. `(non vérifié côté API)`.
- Route `src/app/(dashboard)/compte/mot-de-passe/page.tsx` et action `src/server/actions/account.action.ts` (`changePasswordAction`, `runAction`, `auth.action.ts` convention) : après succès, `clearSession()` si l'API révoque, puis `setSession(newToken)`.
- Rejet : mettre la redirection dans `(dashboard)/layout.tsx:23` (sync) : le shell est déjà streamé, une redirection ultérieure ne change pas le statut HTTP (comportement Next non vérifié ici).

### 5.2 Déconnexion propre

- `auth.action.ts:28-31` : appeler un endpoint `POST /v1/admin/auth/logout` (à créer dans `admin-auth.service.ts:11-15`, `admin: true`) avant `clearSession()`. Ignorer une erreur réseau, mais toujours effacer le cookie.

### 5.3 Cache client et BFF (point 7)

Décision préalable : amender `README.md:24-25` et `README.md:33-38` (règles « server first », « aucun route handler »). À noter dans `knowledge/30-clients/dashboard-architecture.md` (non lu hors tranche).

Fichiers à créer :
- `src/app/api/bff/orders/route.ts` : `export async function GET(req: NextRequest)` ; une route par ressource, allowlist explicite, pas de proxy générique. Vérifie `Sec-Fetch-Site: same-origin` (le cookie est `sameSite: lax`, `session.ts:8`). Répond `Cache-Control: private, no-store`. Appelle `getServices()` (`services/index.ts:43`), donc aucun secret ne sort.
- `src/app/api/stream/ticket/route.ts` : `POST`, même garde. Appelle `services.auth.issueStreamTicket()` (endpoint à créer dans `admin-auth.service.ts`, `admin: true`) et renvoie `{ ticket, expiresAt }`. Le ticket : 60 s, usage unique, lié à `adminId`. Mint côté API, pour que la clé de signature reste hors dashboard.
- `src/lib/query/query-client.ts` : `createQueryClient()` (`staleTime` 30 s, `gcTime` 5 min) ; le client est vidé à la déconnexion (`queryClient.clear()`), jamais persisté (pas de localStorage pour données admin).
- `src/components/providers/query-provider.tsx` : `"use client"`, `QueryClientProvider`, branché dans `app/(dashboard)/layout.tsx` autour de `:24`.
- `src/hooks/use-live-invalidation.ts` : `"use client"`, ouvre `new EventSource(\`${apiPublicUrl}/v1/admin/events?ticket=${ticket}\`)` (EventSource ne peut pas poser d'en-tête, donc le ticket est en query ; il expire en 60 s). Sur message `{ scope }` → `queryClient.invalidateQueries({ queryKey: [scope] })`. Reconnexion : redemander un ticket à chaque ouverture.
- `apiPublicUrl` : nouvelle variable **publique** (`NEXT_PUBLIC_API_URL`), seule variable publique autorisée ; `config.ts:3-6` reste pour les secrets. `(non vérifié)` : CORS de l'API pour l'origine dashboard, et l'API doit accepter le ticket sans `X-Access-Key`.

Invalidation après mutation : la Server Action appelle `updateTag`/`refresh()` (`refreshAfter`, `base-service.ts:171`) et renvoie `ActionResult` (`action-result.ts:6`) ; le client invalide la même `queryKey`. L'événement SSE couvre les changements faits par un autre admin ou par le serveur.

Route Handler SSE : le guide Next (`node_modules/next/dist/docs/01-app/02-guides/streaming.md:484-486`) décrit un flux SSE depuis un route handler. Inutile si le navigateur ouvre directement l'API (choix recommandé : pas de connexion longue portée par une fonction Next ; coût réel sur Vercel `(non vérifié)`). `(non vérifié)` : limites de durée de fonction Vercel (`vercel.json` non lu).

Ce que le BFF garde côté serveur : cookie JWT (`session.ts:20`), `DASHBOARD_ACCESS_KEY` (`config.ts:15`), réponses validées zod (`base-service.ts:158`).

### 5.4 Skeleton à chaque navigation (point 3, mécanisme exact)

Pas de correctif de code dans cette tranche. Causes cumulées :
1. `next.config.ts:5` `cacheComponents: true` : tout bloc qui lit cookie / params se rend à chaque requête.
2. `session.ts:21` lit `cookies()` et `base-service.ts:126` pose `cache: "no-store"` : aucune réponse réutilisable.
3. Le client ne garde pas le segment : `next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/staleTimes.md:37-40` (défaut `dynamic` = 0 s, depuis v15.0.0 ligne 42) et `prefetching.md:35` (route dynamique non préchargée). `next.config.ts` ne fixe pas `staleTimes`.
4. Résultat : la page affiche d'abord le `Suspense fallback={<TableRowsSkeleton …/>}` (`app/(dashboard)/[communityId]/orders/page.tsx:35`), puis les lignes arrivent (`components/orders/orders-table.tsx:44-57`).
5. `cache()` de React (`orders-table.tsx:20`, `context.ts:12`) ne dure qu'une requête.

Correctif possible : `staleTimes: { dynamic: N }` dans `next.config.ts` (fonctionnalité expérimentale, `staleTimes.md:7`), ou cache client TanStack (§5.3). Dans les deux cas, vider le cache à la déconnexion `(non vérifié : comportement de vidage du router cache à la déconnexion)`.

### 5.5 Dépendances

Présentes (`package.json`) : `next` 16.4.2 épinglé (`:21`), `react`/`react-dom` 19.3.0 épinglés (`:25-26`), `zod` ^3.24.1 (`:33`, v3), `react-hook-form` ^7.90.0 (`:27`) + `@hookform/resolvers` ^6.0.0 (`:14`, utilisé avec `zodResolver` dans 3 Sheets), `nuqs` ^2.10.2 (`:23`), `vaul` ^1.1.2 (`:32`, tiroir mobile), `radix-ui` ^1.8.1 (`:24`, Sheet desktop), `cmdk` ^1.1.1 (`:18`, Ctrl K), `sonner` (`:29`), `next-themes` (`:22`), `server-only` (`:28`).

À vérifier : `@hookform/resolvers` ^6.0.0 (version majeure inhabituelle, compatibilité zod 3, `(non vérifié)`) ; `lucide-react` ^1.61.0 (`:20`, `(non vérifié)`) ; `cn` ^0.5.0 (`:17`, `src/lib/utils.ts:1` importe `cn/config`, `(non vérifié)` que ce paquet soit voulu).

Manque pour le plan : `@tanstack/react-query` (cache client), rien d'autre pour SSE (EventSource natif). Pour la présence, rien côté dashboard. Pour le mot de passe, rien (zod suffit).

## 6. Bugs et risques

1. **Déconnexion sans révocation** — `auth.action.ts:28-31` : le JWT reste valide jusqu'à `accessExpiresAt` (8 h, `session.ts:12`) si copié. Scénario : cookie volé avant déconnexion, réutilisé.
2. **Garde proxy de présence seule** — `proxy.ts:12` : un cookie périmé ou forgé passe. Scénario : chaque page charge le shell puis reçoit 401 → `/login` (`context.ts:23`), donc un skeleton puis une redirection. Effet UX, pas de fuite de données (l'API refuse).
3. **Cookie périmé conservé après 401 d'action** — `action-result.ts:20` et commentaire `:12-13` : `redirect("/login")` sans `clearSession()`. Scénario : le login suivant écrase le cookie, mais un `/login` ouvert ne le nettoie pas.
4. **403 non géré** — `api-error.ts:48` `isForbidden` jamais utilisé dans `src/`. `context.ts:17` suppose que `can()` (`lib/roles.ts:50`) évite tout 403. Scénario : rôle ou communauté changé pendant la session → `error.tsx` au lieu d'un message « accès retiré ».
5. **Fan-out de l'accueil** — `loaders/home.ts:15-18` : jusqu'à 25 communautés × (100 commandes + 100 abonnés) = 50 appels API `no-store` par rendu, chacun avec timeout 10 s (`base-service.ts:42`). Scénario : API lente → rendu lent à chaque navigation.
6. **Pas de nouvelle tentative** — `base-service.ts:129-139` : une erreur réseau sur une lecture GET est immédiatement `UNREACHABLE`/`TIMEOUT`. Acceptable, mais à décider avant le cache.
7. **Login sans limite côté dashboard** — `auth.action.ts:15-26` : pas de contrôle de fréquence ; `RATE_LIMITED` (`api-error.ts:51`) est seulement propagé. `(non vérifié : limite côté API)`.
8. **Email seul en connexion** — `admin-auth.schema.ts:12` : `.email()` rejette un numéro WhatsApp, donc le plan (point 1) est impossible sans changement de schéma.

## 7. Dépendances hors tranche

- `apps/api` : endpoint de connexion, `/me` (schéma `mustChangePassword` à créer), révocation de session, endpoint de ticket SSE, LISTEN/NOTIFY, CORS pour l'origine dashboard, 403 `PASSWORD_CHANGE_REQUIRED`. Source citée dans `admin-auth.schema.ts:3` (`apps/api/src/routes/adminAuth.ts`, non lu).
- `knowledge/30-clients/dashboard-architecture.md` : décision sur fetch client et route handlers (`README.md:5`, non lu).
- `vercel.json` (`apps/dashboard/vercel.json`) : durée des fonctions, pour un éventuel flux SSE via Next.
- Services `communities`, `builds`, `network`, `devices` et leurs schémas : détail non audité.
- `src/lib/vless-link.ts` et `network` : format du lien collé (point 8).
- `src/components/` : consommateurs réels de `useQueryStates`, `Sheet`/`Drawer` (points 7 et 9).

## 8. Non vérifié

- Comportement exact de la redirection dans un Suspense streamé (statut HTTP, pas de cookie) avec `cacheComponents` : non testé, seulement lu dans la doc.
- Vidage du cache client Next à la déconnexion : non vérifié.
- Versions réellement installées (`node_modules` non vérifié pour `@hookform/resolvers`, `lucide-react`, `cn`) ; pas de lockfile à la racine (`pnpm-lock.yaml` absent).
- `schema-kit.ts`, `query/*.params.ts`, `lib/*.ts` : lus par leur nom uniquement, contenu non audité.
- Ce qui est « solide » pour les actions (`*.action.ts`) : seuls `auth`, `admins`, `action-result` ont été lus.
- Aucune commande réseau ni build n'a été lancée (lecture seule, forfait limité).
