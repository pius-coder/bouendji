# Audit — routes, layouts, shell, navigation, accueil (apps/dashboard)

Lecture seule. Chemins relatifs à `apps/dashboard/` sauf mention. Lignes vérifiées par Grep/Read le 2026-10-26.

## 1. Verdict

- Les écrans métier existent et sont branchés sur de vraies données (15 routes, toutes vivantes sauf `/kit`, démo fictive, coupée en production).
- Le shell est solide sur la structure (rail, sous-menu, barre basse, puces, tiroir URL) mais la navigation est pilotée par des helpers qui ne correspondent pas au plan : 4 sections au lieu de 5, pas d'espace Réseau dédié, rôle `reseau` absent, pas de Ctrl K, pas de « Mon compte ».
- Le mot de passe forcé (plan 1) n'a aucun point d'accroche : `proxy.ts` ne lit que la présence du cookie, et aucun drapeau de changement de mot de passe n'existe côté dashboard ni côté API.
- Les skeletons à chaque navigation viennent de frontières `Suspense` posées dans chaque page et de l'absence de `loading.tsx` et de cache client (cf. section 2).
- Les tiroirs sont déjà à l'URL (`<prefix>_open`), mais chaque table a son propre tiroir : pas d'hôte unique.

## 2. Inventaire

### 2a. Arbre des routes et layouts (état actuel)

| Route | Fichier:ligne | Layout | Rôle |
|---|---|---|---|
| `/login` | `src/app/(auth)/login/page.tsx:14` | `src/app/layout.tsx` seul (pas de shell) | Connexion, `next` en query |
| `/` | `src/app/(dashboard)/page.tsx:34` | `(dashboard)/layout.tsx:23` | Accueil |
| `/[communityId]/subscribers` | `…/[communityId]/subscribers/page.tsx:12` | shell | Abonnés |
| `/[communityId]/devices` | `…/devices/page.tsx:13` | shell | Appareils |
| `/[communityId]/orders` | `…/orders/page.tsx:16` | shell | Commandes |
| `/[communityId]/commissions` | `…/commissions/page.tsx:9` | shell | Commissions |
| `/[communityId]/audit` | `…/audit/page.tsx:12` | shell | Journal |
| `/[communityId]/builds` | `…/builds/page.tsx:14` | shell | Applications (APK) |
| `/[communityId]/plans` | `…/plans/page.tsx:10` | shell | Forfaits |
| `/[communityId]/members` | `…/members/page.tsx:12` | shell | Membres |
| `/[communityId]/offline` | `…/offline/page.tsx:11` | shell | Fichiers de secours (lecture) |
| `/payouts` | `(dashboard)/payouts/page.tsx:15` | shell | Versements (global) |
| `/network` | `(dashboard)/network/page.tsx:11` | shell | Réseau (global) |
| `/communities` | `(dashboard)/communities/page.tsx:10` | shell | Communautés (owner) |
| `/admins` | `(dashboard)/admins/page.tsx:9` | shell | Administrateurs (owner) |
| `/kit` | `(dashboard)/kit/page.tsx:22` | shell | Démo interne, `notFound()` si production (l.23) |

- `src/app/` ne contient **aucun** `loading.tsx`, `not-found.tsx`, `template.tsx`, `default.tsx`, ni segment parallèle `@slot` ni route interceptée (Glob, vérifié).
- Un seul `error.tsx` global : `src/app/error.tsx:7-22` (réessayer + référence digest).
- `src/app/layout.tsx:16-29` : `ThemeProvider`, `NuqsAdapter`, `Toaster`. Pas de garde d'auth ici.
- Il n'y a **pas** de segment `[communityId]/layout.tsx` : la communauté n'est validée nulle part dans l'arbre ; elle est lue dans l'URL (`src/components/shell/use-active-community.ts:9-14`), avec repli sur la première communauté accessible (l.13).
- Garde d'accès : `src/proxy.ts:11-18` redirige vers `/login?next=` si le cookie `__Host-vpn_admin` est absent ; ne vérifie ni signature ni rôle (commentaire l.3-6).

### 2b. Fichiers de la tranche

| Fichier | Rôle | Taille (lignes) | État |
|---|---|---|---|
| `src/app/(dashboard)/layout.tsx` | Shell : rail, sous-menu, bande, barre du haut, surface `#contenu`, barre basse, chaque bloc dans son `Suspense` | 72 | solide |
| `src/app/(dashboard)/page.tsx` | Accueil : 4 cartes, tendance, file, communautés, tiroir | 95 | solide |
| `src/app/layout.tsx` | Racine : thème, nuqs, toaster, script d'accent | 30 | solide |
| `src/app/error.tsx` | Erreur de rendu | 23 | solide |
| `src/app/(auth)/login/page.tsx` | Connexion | 33 | solide |
| `src/app/(dashboard)/kit/page.tsx` | Démo interne, données fictives (l.44-47 : « 1 240 000 XAF », « 418 ») | 72 | creux/statique (dev) |
| 11 pages `[communityId]/*` + 4 globales | Une page = `PageHeader` + `Toolbar` + `TableCard` + `Suspense` sur les lignes | 25-48 chacune | solide, toutes vivantes |
| `components/shell/nav-model.ts` | Modèle de navigation (`buildNav`, `buildSections`, `resolveSection`) | 158 | solide, mais contredit le plan (2) |
| `components/shell/shell-nav.tsx` | Rail, sous-menu, bande, puces, barre basse, sélecteur mobile | 167 | solide, duplications (2) |
| `components/shell/shell-nav-section.tsx` | Blocs serveur (`readNav` l.17-20) | 49 | solide |
| `components/shell/bottom-bar.tsx` | Barre basse < 1024 px + feuille « Plus » | 83 | solide |
| `components/shell/top-bar.tsx` | En-tête mobile (communauté, titre replié, compte) | 38 | solide |
| `components/shell/community-switcher.tsx` | Sélecteur de communauté (menu) | 86 | solide |
| `components/shell/user-menu.tsx` | Compte : couleur, apparence, déconnexion (l.53-106) | 106 | partiel (pas de « Mon compte », plan 1) |
| `components/shell/use-active-community.ts` | Communauté active depuis l'URL | 14 | solide |
| `components/shell/nav-icon.tsx` | Icône de navigation | 7 | solide |
| `components/page/page.tsx` | `PageContent`, `PageHeader`, `Toolbar`, `TOOLBAR_HEIGHT` | 43 | solide |
| `components/page/table.tsx` | `TableCard`, `TableRowsSkeleton` | 173 | solide (non lu en détail) |
| `components/page/stat.tsx`, `section.tsx`, `empty.tsx`, `icon-tile.tsx` | Primitives de carte, section, vide, tuile | 59 / 40 / 33 / 32 | solide |
| `components/page/search-box.tsx`, `chip-filter.tsx`, `confirm-dialog.tsx` | Recherche, puces, confirmation | 51 / 60 / 87 | solide (survol) |
| `components/home/home-period.tsx` | Sélecteur 7 j / 30 j / 90 j (`h_period`) | 37 | solide |
| `components/home/home-stats.tsx` | Chiffres des 4 cartes, calcul unique par requête (`cache`, l.15) | 91 | solide, données tronquées (6) |
| `components/home/home-queue.tsx` | « À traiter » : versements à traiter + nœuds hors service | 80 | solide |
| `components/home/home-detail.tsx` | Tiroir de détail de la file (`h_open`) | 160 | solide |
| `components/home/home-communities.tsx` | « Par communauté » | 66 | solide, tri à unités mélangées (6) |
| `components/home/home-trend.tsx` | Tendance (commandes + abonnés réels) | 85 | solide (rendu du graphe non lu) |
| `components/home/home-row.tsx` | Ligne cliquable de l'accueil | 73 | solide |
| `components/home/approve-payout-button.tsx` | Approuver un versement depuis l'accueil | 53 | non lu en détail |

## 3. Ce qui sert le plan

- Shell à 4 blocs serveur isolés, chacun dans son `Suspense` : `src/app/(dashboard)/layout.tsx:33-68`, lecture par `shell-nav-section.tsx:17-20` (`getMe` + `getCommunities`, dédoublonnés par `cache()` dans `src/server/context.ts:12-13`).
- Tiroir déjà à l'URL, serveur first : `components/common/detail-panel.tsx:8-13` (« l'ouverture vit dans l'URL (`<prefix>_open`) ») ; clé générique `src/server/query/table.ts:39` et `:48` (`${p}_open`) ; accueil : `src/server/query/home.params.ts:20` et `:23` (`h_open`). `closeHref` reconstruit sans le paramètre (`home-detail.tsx:28`).
- Recherche de commandes : `components/ui/command.tsx:32` (`CommandDialog`, cmdk) est présent mais **jamais utilisé** (aucun import dans `src`).
- Accueil réel : tous les chiffres passent par `loaders/home` (`home-stats.tsx:5`), pas de constante.
- Espace Plateforme déjà séparé par rôle : `nav-model.ts:59-62` (owner) et `:129-135`.
- Barre basse en 5 entrées au plus avec « Plus » : `bottom-bar.tsx:15-20`, `nav-model.ts:12`.
- Rôle et capacités lus d'une seule source : `src/lib/roles.ts:17-34` (`Capability`), `can()` l.50.
- Démarrage du shell en Suspense granulaire et `PageHeader` statique (D104) : `components/page/page.tsx:16-20`.

## 4. Écarts avec le plan

**Point 1 — Mot de passe forcé, « Mon compte » (R1).**
- Aucun drapeau « mot de passe temporaire » côté dashboard (grep `mustChange|must_change|temporary|mot de passe temporaire` : aucun résultat dans `apps/dashboard/src` ni `apps/api/src`).
- `src/proxy.ts:11-18` ne regarde que la présence du cookie. Il ne peut pas imposer le changement sans lire la session.
- Le point d'accroche devra être `(dashboard)/layout.tsx` (serveur, via `getMe()` de `src/server/context.ts:12`) avec `redirect("/changer-mot-de-passe")` : il n'existe pas aujourd'hui.
- « Mon compte » (profil, mot de passe, sessions, thème) : absent. `user-menu.tsx:53-106` ne propose que couleur, apparence, déconnexion (l.95-102). Il n'y a pas de route `mon-compte`.

**Point 2 — Libre-service / onboarding.** Rien dans la tranche (aucune route `onboarding`). Le shell n'a pas de cas « admin sans application » ; `nav-model.ts:45-46` rend la liste vide si `communityId` est nul.

**Point 3 — Guide par rôle.** Non présent dans la tranche (aucun composant de guide ; `shell-nav.tsx` n'en a pas).

**Point 7 — Dashboard (le cœur de la tranche). Écarts :**
- **Sections** : 4 sections au lieu de 5 (Accueil, Abonnés, Offres, Argent, Plus/Communauté) plus Plateforme et Réseau. `nav-model.ts:112` (`SectionKey = "pilot" | "community" | "money" | "platform"`) et `:122-127` (`SECTION_META`). « Pilotage » regroupe l'accueil, le réseau et le journal (`nav-model.ts:130`). Pas de section « Offres » ni « Abonnés » séparée.
- **Réseau** : `/network` est rangé dans « Pilotage » (`nav-model.ts:130`) et pas dans un espace à part. Visibilité : `nav-model.ts:75-77`, `can(me,"network.read",communityId)`.
- **Rôle `reseau`** : absent. `src/lib/roles.ts:8` (`Role = "owner" | "community_admin" | "support" | "finance"`) et `:10-15` ne le connaissent pas ; aucune occurrence de `"reseau"` dans `apps/dashboard/src` ni `apps/api/src` (grep).
- **Onglets dans les pages** : aucun onglet n'existe ; chaque écran est une table unique (par ex. `…/subscribers/page.tsx:14-34`). Les filtres sont des `ChipFilter` ou `SearchBox`.
- **Tiroirs** : Sheet desktop / Drawer mobile demandé ; `detail-panel.tsx:1-8` implémente une colonne latérale ≥ 1280 px (`src/hooks/use-media-query.ts:9` `PANEL_QUERY`) et une feuille plein écran en dessous. Entre 1024 et 1280 px, le tiroir passe en plein écran.
- **Tiroirs : pas d'hôte unique.** Six tiroirs distincts (`components/subscribers/subscriber-drawer.tsx`, `devices/device-drawer.tsx`, `payouts/payout-drawer.tsx`, `network/endpoint-drawer.tsx`, `orders/order-drawer.tsx`, `audit/audit-drawer.tsx`), chacun câblé dans sa table (`src/server/query/table.ts:48`).
- **Ctrl K** : absent. `components/ui/command.tsx:32` existe, sans utilisateur, sans raccourci (`rg keydown` ne trouve rien dans le shell).
- **Cache client / SSE** : non présent dans la tranche. `next.config.ts:5-6` active `cacheComponents: true` et `partialPrefetching: true`, sans `staleTimes` ni abonnement. Pas de `EventSource` dans `src` (grep).
- **Présence (qui est connecté)** : absente.
- **Nom cliquable vers la fiche** : non vérifié dans la tranche (dépend des tables, hors tranche).

**Point 8 — Réseau.** Espace Réseau : `(dashboard)/network/page.tsx:11-37` (table + ajout manuel) existe ; pas de nœud généré ni de lien VLESS dans la tranche (non vérifié hors tranche).

## 5. Structure de code proposée

### 5a. Arbre cible de `src/app`

Groupes de routes : `(auth)` pour la connexion, `(console)` pour le shell (renommage de `(dashboard)`, mêmes fichiers).

```
src/app/
  layout.tsx                          (existant, racine)
  error.tsx, not-found.tsx            (not-found à créer)
  (auth)/
    login/page.tsx                    (existant)
    changer-mot-de-passe/page.tsx     NOUVEAU, plan 1, hors shell
  (console)/
    layout.tsx                        shell (existant) + garde : getMe(); si mustChangePassword -> redirect('/changer-mot-de-passe')
    loading.tsx                       NOUVEAU : squelette de shell statique (à aligner avec page.tsx)
    page.tsx                          Accueil (existant, /)
    mon-compte/page.tsx               NOUVEAU, plan 1 : profil, mot de passe, sessions, thème
    reseau/page.tsx                   espace Réseau (déplacé de /network), rôles owner | reseau
    plateforme/
      communautes/page.tsx            déplacé de /communities, owner
      administrateurs/page.tsx        déplacé de /admins, owner
    c/[communityId]/
      layout.tsx                      NOUVEAU : valide l'appartenance (notFound sinon), fournit la communauté
      abonnes/page.tsx                onglets ?onglet=abonnes|appareils (absorbe /devices)
      offres/page.tsx                 onglets ?onglet=forfaits|applications|secours (absorbe /plans, /builds, /offline)
      argent/page.tsx                 onglets ?onglet=commandes|commissions (absorbe /orders, /commissions) + versements
      plus/page.tsx                   onglets ?onglet=membres|journal (absorbe /members, /audit)
    kit/                              à retirer de src/app (le kit reste en components/common, ou dans un storybook séparé)
```

- Les routes globales `/payouts`, `/network`, `/communities`, `/admins` deviennent `argent/versements` (onglet), `reseau`, `plateforme/*`.
- Les tiroirs sont **un seul hôte** (voir 5b), pas un segment de route.

### 5b. Convention tiroir (état dans l'URL)

- Clé unique `?t=<kind>:<id>` (par ex. `?t=abonne:<id>`, `?t=versement:<id>`), ou `?abonne=<id>` si l'on préfère une clé par type. La clé `<prefix>_open` actuelle (`table.ts:48`) est déjà à l'URL : on la garde et on la renomme `t`.
- `src/lib/tiroir.ts` (NOUVEAU) :
  ```ts
  export type TiroirKind = "abonne" | "appareil" | "commande" | "versement" | "noeud" | "journal";
  export function parseTiroir(value: string | undefined): { kind: TiroirKind; id: string } | null;
  export function closeTiroirHref(pathname: string, search: URLSearchParams): string; // retire `t`
  export function openTiroirHref(pathname: string, search: URLSearchParams, kind: TiroirKind, id: string): string;
  ```
- Hôte unique : `src/components/shell/tiroir-host.tsx` (NOUVEAU), composant serveur `async function TiroirHost({ searchParams, registry })`, rendu une fois par page (les pages reçoivent `searchParams`, le layout ne le reçoit pas). `registry: Record<TiroirKind, (id: string) => Promise<ReactNode>>` ; chaque loader rend son contenu via `DetailPanel` (`components/common/detail-panel.tsx:19-26`).
- Alternative rejetée à vérifier (non vérifié) : un segment parallèle `@tiroir` ne correspond pas à la query string, il faudrait `…/abonne/[id]` en chemin.
- Ouverture côté liste : `<HomeRow replace>` pattern existant (`home-row.tsx:9-10`) pour éviter l'entrée d'historique.

### 5c. Navigation

- `nav-model.ts` : remplacer `SectionKey` (`:112`) par `"accueil" | "abonnes" | "offres" | "argent" | "plus" | "plateforme" | "reseau"`, et `SECTION_META` (`:122-127`) en conséquence.
- Fonction nouvelle `sectionOf` : `/` -> accueil ; `/c/:id/abonnes|appareils` -> abonnes ; `/c/:id/offres|...` -> offres ; `/c/:id/argent`, `/argent/versements` -> argent ; `/c/:id/plus` -> plus ; `/plateforme/*` -> plateforme ; `/reseau` -> reseau (seul, si rôle `reseau` sans owner).
- Supprimer `sidebarGroups` (`nav-model.ts:94-102`, non utilisée) ou la garder pour un seul usage.
- Mobile : la barre basse garde 5 entrées (`bottom-bar.tsx:38-52`) ; les puces de section (`shell-nav.tsx:129-154`) ne doivent plus répéter la barre basse : soit les puces sont les onglets de page, soit la barre basse ne contient que les sections.
- Type de rôle : ajouter `"reseau"` à `Role` (`lib/roles.ts:8`) et `can()` (`:50`) ; `buildNav` reçoit la liste de rôles, pas `communityId` seul.
- Ctrl K : `components/shell/command-palette.tsx` (NOUVEAU) : `CommandDialog` (`components/ui/command.tsx:32`) monté dans `(console)/layout.tsx`, raccourci `keydown` Ctrl+K / Cmd+K.

### 5d. Garde R1 (mot de passe forcé)

- `(console)/layout.tsx` : `const me = await getMe(); if (me.mustChangePassword) redirect("/changer-mot-de-passe");` (drapeau à ajouter côté `AdminMe` dans `src/server/services/admin-auth/admin-auth.schema`, hors tranche).
- `src/proxy.ts:11-18` : rien à changer (il laisse passer le cookie, le layout tranche).

## 6. Bugs et risques

1. **Skeleton à chaque navigation** : chaque page enveloppe ses lignes dans `Suspense` (`…/subscribers/page.tsx:31`, `devices:39`, `orders:35`, `payouts:42`, `network:32`, `audit:31`, `members:39`, `admins:30`, `communities:23`). Aucun `loading.tsx` dans `src/app`. Avec `cacheComponents: true` (`next.config.ts:5`), les données dynamiques ne sont pas réutilisées au retour sur une page : skeleton. Mécanisme exact du cache client Next 16.4 (non vérifié, à confirmer sur la doc Next).
2. **Accueil, file et tendance** : chaque changement de `h_period` ou `h_open` relance tous les `Suspense` de la page (`(dashboard)/page.tsx:41, 47-66, 77-89`).
3. **Totaux tronqués** : « Ventes encaissées » et « Commandes payées » ne voient que les 100 dernières commandes par communauté (`loaders/home.ts`, `HOME_ORDERS_LIMIT = 100`, non lu ici ; affiché « au moins » en `home-stats.tsx:28`). Risque : chiffre sous-estimé sur 90 j sans signal fort.
4. **Tri mixte** : `home-communities.tsx:35` compare `amountXaf` et `paidCount` dans le même tri (unités différentes quand `sales` est nul pour une partie des lignes).
5. **Kit en production** : `(dashboard)/kit/page.tsx:23` ne masque la page que par `NODE_ENV`. Le fichier et ses données fictives (l.44-47) restent dans le bundle de l'app.
6. **Garde faible** : `proxy.ts:12` accepte tout cookie présent ; la sécurité repose sur l'API (commentaire l.5-6). Acceptable, mais le forçage R1 ne peut pas s'appuyer sur le proxy.
7. **Communauté non validée** : pas de `[communityId]/layout.tsx`. Une URL `/<id-inconnu>/subscribers` n'est refusée que par l'API (non vérifié, dépend de `components/subscribers`).
8. **Repli de communauté** : `use-active-community.ts:13` affiche la première communauté accessible quand l'URL n'en porte pas (sur `/payouts`, `/network`), ce qui peut faire croire que la vue est scopée.
9. **Ordre instable de « Versements »** : `nav-model.ts:54` met « Versements » dans `primary` seulement si moins de 4 entrées ; l'ajout d'une entrée le déplace dans « Plus » sans avertissement.

## 7. Dépendances hors tranche

- `components/common/detail-panel.tsx` (seuil `PANEL_QUERY`, `src/hooks/use-media-query.ts:9`) et `components/common/app-sheet.tsx` (feuille, `:130-134`).
- `src/server/context.ts:12-13` (`getMe`, `getCommunities`) : la garde R1 et la liste de communautés en dépendent.
- `src/server/services/admin-auth/admin-auth.schema` : ajouter `mustChangePassword` à `AdminMe` (absent aujourd'hui).
- `apps/api/src` : rôle `reseau` et drapeau de mot de passe temporaire absents (grep négatif). Vérifier la route de changement de mot de passe et l'invalidation des sessions.
- `components/subscribers/*`, `components/devices/*`, `components/payouts/*`, `components/network/*`, `components/orders/*`, `components/audit/*` : les six tiroirs et tables (contenu non lu).
- `src/server/loaders/home.ts` (`HOME_ORDERS_LIMIT`, `getRequestNow`, `getHomeAccess`) : vérifier la troncature et le rôle `reseau`.
- `components/auth/login-form*.tsx` : connexion par email ou WhatsApp (plan 1) non lue.
- `next.config.ts` : `cacheComponents` et `partialPrefetching` ; le cache client (plan 7) dépend de la doc Next 16.4.

## 8. Non vérifié

- Le mécanisme exact du skeleton au retour sur une page (section 6.1) : dépend du cache client Next 16.4 non consulté.
- Le comportement d'un segment parallèle face à une query string (section 5b) : à confirmer dans la doc Next 16.
- Le rendu du graphe de tendance (`home-trend.tsx` 17-85) et la logique de `approve-payout-button.tsx` : non lus en détail.
- Les six tiroirs et les tables hors tranche : seul leur usage de `_open` est vérifié.
- L'accessibilité réelle (focus, lecteurs d'écran) des onglets et des puces : non testé dans un navigateur.
- Aucune exécution : pas de build, pas de test, lecture seule.
