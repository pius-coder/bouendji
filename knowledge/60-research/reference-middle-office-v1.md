---
id: reference-middle-office-v1
title: analyse adversariale du dépôt de référence
tags: [reference, nuqs, data-table, poo, adversarial]
status: verified
updated: 2026-10-23
related: [dashboard-architecture]
---

> Statut : lecture de code via gh, pas d'exécution.

Dépôt : `afreeserv/middle-office-v1` (privé), branche `dev`, Next 16.1.1,
React 19.2.3, nuqs ^2.4.3, TanStack Query/Table, zod 3.25. 739 chemins, 23
fichiers de test ou Cypress, 3 route handlers. Lu via `gh api` ; aucun
`pnpm install`, aucun test lancé.

## 1. Ce qu'on garde : inventaire complet des bons points

Classé par domaine. Chaque point indique la source (fichier du dépôt) et
ce qu'on en fait chez nous. Rien n'est recopié : on reprend le patron.

### 1.1 Organisation du code

| Bon point | Source | Chez nous |
|---|---|---|
| Dossiers par domaine métier (`components/<domaine>/`) | `src/components/` | Repris : `components/<domaine>/` |
| Blocs génériques séparés des blocs métier | `components/common/`, `components/ui/` | Repris : `components/common/` pour les blocs réutilisables |
| Un `index.ts` par dossier exportant le public | `components/ui/index.ts`, `schemas/*/index.ts` | Repris : chaque dossier exporte son API |
| Schémas zod par domaine, un fichier par ressource | `src/schemas/<domaine>/<domaine>.schema.ts` | Repris : `<dossier>.schema.ts` |
| Adaptateurs de réponse séparés (`utils/api-adapters/`) | `src/utils/api-adapters/*-adapter.ts` | Repris sous forme de fonctions pures dans `lib/` |
| Hooks dans un dossier unique avec index | `src/hooks/index.ts` | Repris : `hooks/` |
| Store global minimal (devise, session) | `src/store/` | À limiter : session côté serveur, pas de store global de données |

### 1.2 Services et appels réseau

| Bon point | Source | Chez nous |
|---|---|---|
| Une classe de base unique pour tous les appels | `src/services/base-service.ts` | Repris : `BaseService`, avec options déclaratives en plus |
| Erreur typée `ApiError` avec `status` et `details` | `base-service.ts` | Repris : `ApiError` |
| Un service par ressource qui hérite de la base | `services/reportings-service.ts`, `admin-service.ts` | Repris : un service par dossier API |
| Constantes d'URL en `private readonly` dans la classe | `admin-service.ts` (`BASE_URL`) | Repris, et étendu en `private static readonly endpoints` |
| Liaison des méthodes dans le constructeur (`bind`) | `admin-service.ts` | Non repris : inutile avec des méthodes de classe bien écrites |
| Clé de cache (`tag`) par requête | `base-service.ts` (`tag`) | Repris : tags déclarés dans l'endpoint |
| Clés de requête centralisées (`queryKeys`) | `src/lib/query-keys.ts` | Repris, en `queryKeys` par dossier API, mais sans React Query côté lecture |
| Normalisation des paramètres avant la clé | `query-keys.ts` (`normalizeQueryParams`) | Repris : un seul normaliseur de paramètres |
| Mapping explicite `next` → `page` au seul endroit de l'API | `reportings-service.ts` | Repris : le mapping vit dans le schéma de la requête |

### 1.3 Actions serveur

| Bon point | Source | Chez nous |
|---|---|---|
| Fichier `"use server"` par domaine, fonctions fines | `src/actions/<domaine>/*-actions.ts` | Repris : `server/actions/<dossier>.action.ts` |
| Un `index.ts` qui ré-exporte les actions | `src/actions/index.ts` | Repris |
| Actions qui ne contiennent que de la délégation | `actions/reportings/reportings-actions.ts` | Repris, avec validation zod en entrée |
| Séparation des mutations dans un fichier dédié | `src/actions/services/services-mutations.ts` | Repris : lecture et écriture séparées |

### 1.4 Interface et composants

| Bon point | Source | Chez nous |
|---|---|---|
| Colonnes de tableau en fabrique | `components/offers/offers-table/columns.tsx` | Repris : une fabrique par table, sans traduction (pas d_i18n) |
| Tableau générique piloté par une config de filtres | `components/common/data-table/` | Repris, dans l'esprit : config déclarative, pas de logique par page |
| Architecture du tableau documentée (`DATA_TABLE_V2_ARCHITECTURE.md`) | `docs/` | Repris comme modèle de document : principes, fichiers, migration |
| Principes du tableau : un store par instance, sélecteurs ciblés, lignes autonomes, options « opt-in » | `docs/DATA_TABLE_V2_ARCHITECTURE.md` §3 | Repris : options plutôt que composants séparés |
| Tableau en `<table>` natif, pas de bibliothèque de grille | `docs/DATA_TABLE_V2_ARCHITECTURE.md` (Appendix C, SKIP) | Repris : shadcn Table |
| Sections repliables avec titre coloré | `components/common/page-header/collapsible-header-section` | Repris sous le nom `CollapsibleSection` |
| Feuille latérale globale avec en-tête (retour, fermer) et footer optionnel | `components/common/global-sheet.tsx` | Repris : `GlobalSheet`, mobile en plein écran |
| Squelettes de chargement par bloc | `components/common/data-table/ui/table-skeleton.tsx` | Repris : un squelette par bloc, dans son `Suspense` |
| États vides et d'erreur dédiés au tableau | `ui/table-empty.tsx`, `ui/table-error.tsx` | Repris |
| Formulaires : champ enveloppé dans `FormField` avec libellé, description et message | `TextareaField` (chemin exact à confirmer dans le dépôt) | Repris : `*-field.tsx` sur shadcn Field |
| Recherche debouncée (300 ms) par défaut | `global-search-input.tsx`, `hooks/use-debounce.ts` | Repris : `useDebounce` |
| Détection mobile par hook | `hooks/use-mobile.ts` | Repris, aligné sur le point de rupture 768 px de shadcn |
| Jeu de composants partagés (avatar, carte de service, pagination) | `components/common/services/*` | Repris ce qui est générique seulement |

### 1.5 Outillage et discipline

| Bon point | Source | Chez nous |
|---|---|---|
| Hook pre-commit qui lance lint-staged | `.husky/pre-commit` | Repris |
| Hook pre-push qui vérifie le nom de branche | `.husky/pre-push`, `validate-branch-name.sh` | Repris : `feature/`, `fix/`, `refactor/`… |
| Convention de nommage des branches documentée | `docs/branch-naming-conventions.md` | Repris |
| Prettier avec `.prettierignore` | `.prettierrc`, `.prettierignore` | Repris |
| Scripts `type-check`, `lint`, `test`, `build` explicites | `package.json` | Repris, plus un script `typecheck` pour l'API |
| Moteur Node et gestionnaire épinglés (`engines`, `volta`, `packageManager`) | `package.json` | Repris : `packageManager` épinglé à une version qui existe |
| Tests unitaires (jest) et e2e (cypress) présents | `jest.config.ts`, `cypress/` | Repris : jest pour `BaseService`, pas de cypress au départ |

### 1.6 Ce qu'on n'a pas vérifié dans ce dépôt

- Le contenu réel de `messages/code.json` (vide dans la lecture) : à relire
  avant de s'en inspirer pour les codes d'erreur.
- Les tests jest et cypress : présents, non exécutés, non lus en détail.
- La doc `DATA_TABLE_V2_MIGRATION_GUIDE.md` : non lue.

## 2. Ce qu'on ne reprend pas (failles vérifiées dans le code)

| # | Constat | Preuve (fichier) | Gravité |
|---|---|---|---|
| F1 | **Deux définitions des mêmes paramètres, valeurs par défaut différentes.** Client : `limit` défaut **100**, `currency` depuis le store. Serveur : `limit` défaut **10**, `currency` défaut `"EUR"`. | `src/hooks/use-global-query-params.ts` vs `src/lib/utils.ts` l.10–36 | Haute |
| F2 | **Conséquence probable de F1** : la synchro URL → store lit `limit` (toujours défini, défaut 100) et écrase `pageSize`. Le `defaultPageSize={10}` de la table et le `limit: 10` de `loadOffers` sont donc ignorés. À confirmer à l'exécution. | `use-url-sync.ts` l.25–33 ; `offers-table` (`defaultPageSize={10}`) | Haute |
| F3 | **Un seul hook pour toutes les tables.** Une liste fixe de clés (`status`, `category`, `role`, `period`…) est partagée par toutes les pages. Deux tables qui filtrent sur `status` partagent le même état d'URL. | `use-global-query-params.ts` l.8–27 | Moyenne |
| F4 | **Liste de filtres codée en dur** dans la synchro (`DYNAMIC_KEYS`). Ajouter un filtre oblige à modifier la synchro, et à oublier la liste casse silencieusement. | `use-url-sync.ts` l.46–58 | Moyenne |
| F5 | **Synchro bidirectionnelle avec drapeau d'écho** (`isSyncingFromStoreRef`). Si l'écriture de l'URL ne change rien, le drapeau reste levé et le prochain changement d'URL réel est ignoré. | `use-url-sync.ts` l.17–22, l.112–118 | Moyenne |
| F6 | **Historique pollué** : `history: "push"` sur chaque changement de filtre, de page et de tri. Le bouton retour parcourt les filtres. | `use-global-query-params.ts` l.30–34 | Basse |
| F7 | **Lecture côté client pour tout.** `useQuery` + `queryFn` appelant une server action dans chaque table. La donnée n'est pas rendue par le serveur. Contraire au principe server first. | `use-table-data.ts` l.94–104 | Haute (pour nous) |
| F8 | **Services qui reçoivent tout le paramètre.** `ReportingsService.list` déverse `...apiParams` vers l'API : `display`, `currency` et tout nouveau paramètre partent sans contrôle. | `src/services/reportings-service.ts` l.13–22 | Moyenne |
| F9 | **Export silencieux en échec.** `handleExport` attrape l'erreur et fait `console.error` : l'utilisateur ne voit rien. Et `exportReportingsAction` lève une exception pour tout format sauf PDF. | `offers-table` `handleExport` ; `reportings-actions` | Moyenne |
| F10 | **Casts partout** : `as Partial<GlobalQueryParamsType>`, `as import(...)`, `@ts-expect-error` sur l'accès dynamique. Le typage ne protège pas les frontières. | `use-table-data.ts`, `use-url-sync.ts`, `offers-table` | Moyenne |
| F11 | **Devise injectée côté client** dans chaque requête (store). La devise est une règle serveur, pas un paramètre d'URL. | `use-global-query-params.ts` l.12–13, `use-table-data.ts` l.66 | Basse |
| F12 | **Route handlers** (`src/app/api/services/route.ts`, `export/route.ts`) : contraire à notre règle « server actions uniquement ». | tree.txt | Info |

## 3. Le bon usage de nuqs (ce qu'il faut faire chez nous)

nuqs fournit les deux côtés avec **un seul jeu de parseurs** : `nuqs/server`
(`createLoader` ou `createSearchParamsCache`) pour la page serveur, et
`useQueryStates` côté client. Le point F1 vient justement de deux listes
écrites à la main. Pour nous :

1. **Un fichier de parseurs par table**, défini une fois, importé des deux côtés
   (`src/server/query/<table>.params.ts`). Pas de liste globale.
2. **Préfixe de clé par table** (`urlKeys` de nuqs) pour éviter F3.
3. **Valeurs par défaut uniques**, écrites dans le parseur : `limit` ne
   se définit qu'à un seul endroit.
4. **La page serveur lit les paramètres** (`searchParams` est une `Promise`
   dans Next 16 : vérifier dans la doc installée) et charge les données dans
   un Server Component. Le client ne fait que modifier l'URL.
5. **`history: "replace"`** pour recherche et pagination, `push` seulement pour
   un changement de section.
6. **Pas de drapeau d'écho** : l'URL est la seule source de vérité du tableau.
   Le store n'existe pas ; l'état vit dans l'URL.
7. Les services ne reçoivent que les champs déclarés par le schéma de la table.

Numéros de ligne indicatifs (lecture par extraits). Ce point est à valider contre la doc nuqs installée (`node_modules/nuqs`) avant
implémentation : nous n'avons pas vérifié les API `createLoader` /
`createSearchParamsCache` dans la version exacte.

## 4. Limites de cette analyse

- Lecture seule via `gh api`. Aucune exécution : F1 et F2 sont des
  **déductions du code**, à confirmer dans le navigateur.
- Une partie des fichiers n'a pas été lue (services autres que reportings,
  composants de table). Les conclusions portent sur les fichiers cités.
- Le dépôt est privé : ne pas le recopier dans `knowledge/` ni dans le dashboard.

## Liens

- [[dashboard-architecture]] — patron cible (server first, services, actions)
- [[dashboard-ux]] — système UI/UX
