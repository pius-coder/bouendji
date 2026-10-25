# Notes de construction — dashboard-build-sonnet (2026-10-23)

## Dépendances ajoutées (justification)
- nuqs 2.10.2 : décision utilisateur (paramètres d'URL). API vérifiée dans node_modules/nuqs/dist/server.d.ts :
  createLoader(parsers,{urlKeys}) accepte une Promise (searchParams), createSerializer, useQueryStates ; `shallow` vaut true par défaut -> `shallow:false` requis pour relancer le rendu serveur.
- react-hook-form + @hookform/resolvers 6 : formulaires (dashboard-ux : Field + Controller + zodResolver). Typecheck OK avec zod 3.25.
- sonner : toasts (toast absent de new-york-v4). next-themes : thème .dark. lucide-react : icônes shadcn.
- radix-ui, vaul, cmdk, class-variance-authority, clsx, tailwind-merge, tw-animate-css : dépendances des composants shadcn récupérés.
- Non ajouté : @tanstack/react-table (tableau = shadcn Table + colonnes déclaratives, aucun tri/pagination client à gérer), TanStack Query (interdit : pas de lecture client).

## shadcn : méthode
`pnpm dlx shadcn@latest add` échoue par intermittence (TLS "socket disconnected" vers ui.shadcn.com) et prend ~3 min/composant (pnpm install à chaque appel). Les composants new-york-v4 ont été récupérés par curl sur https://ui.shadcn.com/r/styles/new-york-v4/<nom>.json (script de scratchpad, retries), imports @/registry/... réécrits en @/components/ui. components.json écrit à la main. Contenu identique à ce que le CLI écrit (même JSON).
Un CLI interrompu a laissé des lignes hsl sidebar-primary dans globals.css : supprimées.

## Docs Next lues (node_modules/next/dist/docs/01-app, Next 16.4.2)
- page.md : "`searchParams` ... A promise" -> await dans un bloc, jamais dans la page synchrone.
- 01-getting-started/08-caching.md : "Components that access runtime APIs should be wrapped in <Suspense>" (cookies, params, searchParams). C'est la règle qui impose pages synchrones + blocs async (cacheComponents:true dans next.config.ts, déjà présent).
- refresh.md : "`refresh` can only be called from within Server Actions" -> afterMutation=refresh() n'est atteint que par les actions.
- error.md : l'erreur-boundary reçoit `retry` (pas `reset`) dans cette version.
- proxy.md : matcher négatif ; proxy.ts = garde cookie seulement.
- redirect.md : redirect() utilisable pendant le rendu (streaming : meta tag) -> withSession() redirige vers /login sur 401.
Pas de "use cache", cacheLife, cacheTag, updateTag ni revalidatePath utilisés : données admin non cachées.

## Écarts avec le patron
1. nuqs : `useQueryStates` appelé avec `shallow:false` + `history:"replace"` + `clearOnDefault:true` dans chaque bloc client (3 options répétées par table). Pas de wrapper maison : ajouter une fabrique si le nombre de tables grandit.
2. Pagination commandes : "Page suivante" = <Link replace> dont l'href est produit côté serveur par createSerializer ; pas de "Charger plus" (accumuler les pages demande un état client, contraire à server first). Pas de retour page précédente (curseur sans pile) : "Revenir au début".
3. Listes abonnés/appareils : le filtre `q` est appliqué par le serveur Next sur les 100 derniers (l'API n'a ni recherche ni pagination), pas par l'API.
4. Dossiers de services : un dossier par ressource d'API, nommé d'après les chemins (openapi.json n'a qu'un tag 'administration' pour 33 routes) : admin-auth, admins, audit, builds, communities, devices, network, orders, payouts, plans, subscribers.
5. Fuseau : dates affichées en UTC avec suffixe, le fuseau d'exploitation n'est écrit nulle part.
6. Un `useEffect` subsiste côté client uniquement pour nettoyer le minuteur de la recherche (pas de chargement).
7. Les composants `ui/` et `use-mobile.ts` sont exclus d'ESLint (Math.random dans SidebarMenuSkeleton, setState dans effet : code upstream).
8. Les colonnes (`*-columns.tsx`) sont des fabriques serveur ; DataTable rend un <table> ET une liste de cartes (CSS sm:), donc le HTML contient les lignes deux fois.

## Vérifié (commandes lancées)
- pnpm typecheck : sans sortie. pnpm lint : sans sortie. pnpm test : 39 tests, 39 passent (26 BaseService/services + 13 rôles, navigation, nuqs, schéma formulaire). pnpm build (API_BASE_URL/DASHBOARD_ACCESS_KEY factices) : réussi, 12 routes, toutes "Partial Prerender".
- Fumée sur `next start` + faux API (scratchpad/fake-api.mjs, Node, aucune base réelle) : / sans cookie -> 307 /login ; /c1/orders?o_status=paid -> 307 /login?next=... ; connexion via navigateur -> redirection vers /c1/orders, tableau rendu avec nom d'abonné résolu ; filtre "Payées" -> URL ?o_status=paid et appel API limit=20&status=paid ; journal du faux API : X-Access-Key sur tous les appels, Authorization Bearer sur les appels admin, aucun Authorization sur le login. Rendu mobile 375 px : cartes + barre basse.
- Console navigateur : une erreur React #418 (hydratation) vue une fois en build de production après émulation mobile ; non reproduite en `next dev` (aucun avertissement sur /, /c1/orders, /c1/devices, /payouts) ni dans un onglet neuf. Cause non établie.

## Relu, non exécuté
Révocation d'appareil, forcer l'état d'un nœud, approbation de versement, création de communauté (formulaire RHF) : écrits, typés, jamais déclenchés (le faux API n'a pas ces routes ; aucune API réelle). Écrans devices/network/payouts/home vus rendus seulement via texte de page (réseau) ; subscribers, audit, communities, home non ouverts dans le navigateur.
Droits par rôle : miroir de permitted() relu, jamais éprouvé contre l'API réelle.

## Propositions pour les nœuds partagés
- dashboard-architecture.md : remplacer l'arborescence 'services/<dossier>/' par les 11 dossiers réels ; documenter `server/context.ts` (cache() de React + withSession) et `server/query/` ; consigner que cacheComponents impose params/searchParams/cookies sous Suspense et donc pages synchrones.
- dashboard-ux.md : "Charger plus" remplacé par "Page suivante" (server first) ; fuseau UTC ; la clé console est bien injectée par le serveur (question 1 : décidée).
- open-questions : fuseau d'affichage ; durée max offline 24 h vs 72 h (inchangé) ; communauté "support" voit-elle les noms d'abonnés sur les commandes (oui via listSubscribers, member.read).
- Écarts API déjà relevés par dashboard-base-sonnet : Idempotency-Key jamais lue par l'API (le dashboard l'envoie quand même sur les POST) ; openapi n'a qu'un tag.

## Ajout 2026-10-23 : forfaits et membres
Routes relues dans apps/api/src/routes/admin.ts : GET/POST /apps/:appId/plans (l.805, l.817), PATCH /plans/:planId (l.863), GET/POST /communities/:id/memberships (l.913, l.924), PATCH/DELETE /memberships/:id (l.965, l.1006), GET /apps (l.784), GET /admins (l.1074, owner seul). Droits : plan.manage et membership.read/write = owner ou community_admin local (permitted(), l.229-310) ; lecture des forfaits = tout rôle local. Auto-modification d'appartenance refusée hors owner (403) ; dernier community_admin protégé (409) ; DELETE = désactivation logique et renvoie la ligne ; code de forfait immuable (PATCH strict, sans `code`).
Choix : /[communityId]/plans (une section par marque, Suspense par marque), /[communityId]/members (filtre nuqs m_disabled, défaut = actifs seulement). Ajout de membre : owner choisit dans l'annuaire (GET /admins), community_admin saisit l'identifiant (l'API ne lui donne pas l'annuaire : question 11 de dashboard-ux toujours ouverte).
(non vérifié) : que /apps?communityId existe (non : le dashboard filtre côté Node par communityId) ; effets réels des transitions de statut de membre (disabled -> active) contre la base ; que `description` vide soit acceptée (schéma : oui, optionnel, string).
Vérifié : typecheck, lint sans sortie ; 54 tests passent (dont 15 nouveaux : plans-members.test.ts) ; build 14 routes ; fumée sur faux API : /c1/members rendu, Retirer -> confirmation -> DELETE /v1/admin/memberships/1 avec X-Access-Key + Bearer, toast, relecture ; /c1/plans rendu, Modifier -> feuille préremplie -> PATCH /v1/admin/plans/p1.
Relu seulement : création de forfait, ajout de membre, changement de rôle, réactivation (écrans non déclenchés).
