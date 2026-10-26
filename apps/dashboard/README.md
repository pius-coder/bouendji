# @vpn/dashboard

Console d'administration de la plateforme VPN marque blanche. Next.js 16 (App
Router, Cache Components), shadcn/ui `new-york-v4`, Tailwind 4, zod, nuqs,
TanStack Query. Patron : `knowledge/30-clients/dashboard-architecture.md`.

## Lancer

```bash
cp .env.example .env.local     # puis renseigner API_BASE_URL et DASHBOARD_ACCESS_KEY
pnpm dev
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

`API_BASE_URL` et `DASHBOARD_ACCESS_KEY` sont lues côté serveur uniquement (aucune
n'a le préfixe `NEXT_PUBLIC_`). La clé console est ajoutée par le serveur, jamais
saisie à l'écran. Le JWT `vpn-admin` vit dans un cookie `httpOnly`.

## Règles

- Pas d'i18n : libellés en français, constantes en tête de fichier.
- Server first : pages et blocs de lecture = Server Components `async`, chaque
  donnée dans son `<Suspense>`. Les Client Components reçoivent tout en props.
- Lecture côté client (amendement chantier vague 1, décision 8) : seul le hook
  `src/hooks/use-admin-query.ts` (TanStack Query, `staleTime` 30 s) lit des
  données admin côté navigateur, et uniquement par le BFF `/api/bff/...`. Aucun
  `fetch` direct vers l'API depuis le client.
- BFF de lecture : `src/app/api/bff/[...path]/route.ts`, GET seulement, chemins
  limités à la liste blanche `src/lib/bff-allowlist.ts`. Il ajoute le jeton de
  session et la clé d'accès côté serveur ; ni l'un ni l'autre n'atteint le
  navigateur. Une nouvelle lecture = une ligne dans la liste blanche, après relecture.
- Mutations : Server Actions uniquement (`src/server/actions/`), jamais de route
  handler en écriture. Après une mutation, invalider la clé concernée
  (`invalidateAdmin`) et appeler `refresh()` via `refreshAfter`.
- Un seul appel réseau côté serveur : `BaseService.call(endpoint, input)`
  (`src/server/api/`). Les services déclarent des endpoints (chemin relatif + options)
  et valident l'entrée avec zod avant tout envoi.
- Paramètres d'URL : un fichier de parseurs par table (`src/server/query/`),
  importé par la page serveur (`nuqs/server`) et par le bloc client (`useQueryStates`).
- Tiroirs : un seul hôte (`src/components/drawers/drawer-host.tsx`), piloté par
  `?abonne=`, `?appareil=`, `?commande=`, `?forfait=`, `?versement=`, `?build=`
  (`src/lib/drawers.ts`). Une seule feuille : `ResponsiveSheet` (à droite à partir de 768 px,
  en bas en dessous).
- `src/components/ui/` = code shadcn généré, non modifié (ignoré par ESLint).

## Cache

Données admin : aucun cache public (`cache: "no-store"` dans `BaseService` et dans
le BFF). Cache client : TanStack Query (`src/app/providers.tsx`), `staleTime` 30 s,
`gcTime` 5 min, rafraîchissement au retour sur l'onglet, aucun sondage périodique.
Le cache est vidé à la déconnexion et n'est jamais persisté (pas de localStorage
pour les données admin). Avec `cacheComponents`, toute lecture de cookie, `params`
ou `searchParams` se fait sous un `<Suspense>`.

## Navigation

Cinq sections : Accueil, Abonnés, Offres, Argent (barre basse) et « Plus »
(Communauté, Plateforme, Réseau, Mon compte). Les sections sont filtrées par rôle
et par communauté active (`src/components/shell/nav-model.ts`). Rôles plateforme
cumulables `owner` et `reseau` (`src/lib/roles.ts`). Ctrl K ouvre la navigation
(`src/components/shell/command-palette.tsx`).

## Écrans

Connexion, Accueil (à traiter), Communautés (+ création), Commandes (curseur +
filtre), Abonnés, Appareils (+ révocation), Versements (+ approbation), Réseau
(+ forcer l'état), Journal. Non faits : forfaits, membres, comptes admin,
fichier hors-ligne, builds, commissions, étapes de versement pay/confirm/resolve.
