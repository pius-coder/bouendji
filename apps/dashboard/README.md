# @vpn/dashboard

Console d'administration de la plateforme VPN marque blanche. Next.js 16 (App
Router, Cache Components), shadcn/ui `new-york-v4`, Tailwind 4, zod, nuqs.
Patron : `knowledge/30-clients/dashboard-architecture.md`.

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
  Aucun `useEffect`/`useQuery`/`fetch` de chargement côté client.
- Aucun route handler : mutations par Server Actions (`src/server/actions/`).
- Un seul appel réseau : `BaseService.call(endpoint, input)` (`src/server/api/`).
  Les services déclarent des endpoints (chemin relatif + options) et valident
  l'entrée avec zod avant tout envoi.
- Paramètres d'URL : un fichier de parseurs par table (`src/server/query/`),
  importé par la page serveur (`nuqs/server`) et par le bloc client (`useQueryStates`).
- `src/components/ui/` = code shadcn généré, non modifié (ignoré par ESLint).

## Cache

Données admin : aucun cache public (`cache: "no-store"` dans `BaseService`).
Après mutation, `refresh()` (Server Action uniquement) via `refreshAfter`.
Avec `cacheComponents`, toute lecture de cookie, `params` ou `searchParams`
se fait sous un `<Suspense>`.

## Écrans

Connexion, Accueil (à traiter), Communautés (+ création), Commandes (curseur +
filtre), Abonnés, Appareils (+ révocation), Versements (+ approbation), Réseau
(+ forcer l'état), Journal. Non faits : forfaits, membres, comptes admin,
fichier hors-ligne, builds, commissions, étapes de versement pay/confirm/resolve.
