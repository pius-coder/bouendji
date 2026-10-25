---
id: dashboard-architecture
title: structure du dashboard, server first
tags: [dashboard, architecture, nextjs, poo, server-first]
status: decided
updated: 2026-10-23
related: [dashboard-ux, admin-access-flows, reference-middle-office-v1]
---

## Référence et ce qu'on en retient

Un dépôt Next.js existant (`middle-office-v1`, captures du 2026-10-23) sert de
**modèle de structure**, pas de dépendance. On en retient :
- une classe de base (`BaseApiService`) avec `request()`, une erreur typée
  (`ApiError`), des services par ressource qui héritent de la base ;
- des services dont les endpoints sont des constantes privées de la classe
  (`BASE_URL`), des méthodes publiques qui renvoient des données typées ;
- des **server actions** `"use server"` qui enveloppent les services pour les
  mutations ;
- des pages **fines** : la page assemble des blocs, chaque bloc est un composant
  (titre, tableau, bouton d'ajout, pagination) ;
- des colonnes de tableau définies par une **fabrique** (`columnsTable({ t })`) ;
- un composant `Sheet` latéral pour les détails, et des sections repliables
  (`CollapsibleHeaderSection`) ;
- des champs de formulaire enveloppant shadcn/react-hook-form (`TextareaField`).

On **ne reprend pas** :
- le chargement côté client (`useQuery` + server action dans `queryFn`,
  `useEffect` + `setState` dans `ActionsSection`). Contraire à D82 et au
  principe server first : la donnée arrive par props depuis un Server Component ;
- les URLs écrites à la main dans chaque méthode, les `tag` construits à la
  main, le `console.log` de la réponse entière, `redirect("/fr/logout")` codé en dur ;
- le `Render.If` / `Render.Else` maison : des ternaires JSX suffisent.

## Arborescence cible (`apps/dashboard/src/`)

```
app/                      routes uniquement, fines
  (auth)/login/page.tsx
  (dashboard)/layout.tsx  shell : navigation, session
  (dashboard)/admins/page.tsx
  (dashboard)/admins/[adminId]/page.tsx
server/
  api/                    infrastructure, aucune logique métier
    base-service.ts       classe BaseService (le seul appel réseau)
    endpoint.ts           déclaration d'endpoint (chemin relatif + options)
    api-error.ts          ApiError + parsing de l'enveloppe d'erreur
    session.ts            cookie httpOnly, lecture du JWT
    config.ts              variables serveur (API_BASE_URL, DASHBOARD_ACCESS_KEY)
  services/<dossier>/     une fiche par dossier de l'API
    <dossier>.service.ts  classe XxxService extends BaseService
    <dossier>.schema.ts   schémas zod : entrées (validées) et sorties
    index.ts              fabrique : crée les services à partir des deps
  actions/<dossier>.action.ts   "use server" : mutations uniquement
components/
  ui/                     composants shadcn, tels quels (ne pas modifier)
  common/                 blocs génériques : data-table, page-header,
                          global-sheet, collapsible-section, form fields
  <domaine>/              blocs métier : admins/, communities/, devices/…
lib/                      utilitaires purs (format, dates, XAF)
```

Nommage : fichiers en `kebab-case`. Composants en `PascalCase`. Suffixes :
`.service.ts`, `.schema.ts`, `.action.ts`, `columns.tsx`, `*-table.tsx`,
`*-section.tsx`, `*-sheet.tsx`, `*-field.tsx`.

## Règles de composition (pages)

1. **Une page n'implémente rien** : elle appelle les services et assemble des
   blocs. Pas de tableau, pas de formulaire, pas de logique d'affichage dans
   `page.tsx`.
2. **Le titre et le squelette sont synchrones** ; chaque donnée est dans sa
   propre frontière `<Suspense>` :

```tsx
// app/(dashboard)/admins/page.tsx
export default function AdminsPage() {
  return (
    <>
      <AdminsTitle />                       {/* statique, immédiat */}
      <Suspense fallback={<AdminsTableSkeleton />}>
        <AdminsTable />                     {/* async, lit le service */}
      </Suspense>
      <AddAdminButton />                    {/* client, sans donnée */}
    </>
  );
}
```

3. **Un bloc est soit serveur, soit client.** Un bloc serveur est `async`,
   appelle un service, et passe les données en props à un bloc client. Un bloc
   client (`"use client"`) n'a **aucun** `fetch`, `useQuery` ni `useEffect` de
   chargement ; il reçoit tout en props et n'agit que par server action.
4. **Le client est une feuille.** `"use client"` se place au plus bas possible
   (le tableau, la recherche, le bouton). Le titre reste serveur.

## Patron d'un service (dossier de l'API)

```ts
// server/services/admins/admins.service.ts
import "server-only";
import { BaseService } from "@/server/api/base-service";
import { endpoint } from "@/server/api/endpoint";
import { adminSchema, adminListSchema, createAdminInput } from "./admins.schema";

export type CreateAdminInput = z.input<typeof createAdminInput>;

export class AdminsService extends BaseService {
  private static readonly endpoints = {
    list: endpoint({ method: "GET", path: "/", query: listQuery, response: adminListSchema, paginate: "cursor" }),
    detail: endpoint({ method: "GET", path: "/:adminId", params: adminIdParams, response: adminSchema }),
    create: endpoint({ method: "POST", path: "/create", body: createAdminInput, response: adminSchema, refreshAfter: true }),
  } as const;

  constructor(deps: BaseServiceDeps) {
    super(deps, { basePath: "/v1/admin/admins" });
  }

  listAdmins(query: ListAdminsQuery) { return this.call(AdminsService.endpoints.list, { query }); }
  getAdmin(adminId: string) { return this.call(AdminsService.endpoints.detail, { params: { adminId } }); }
  createAdmin(input: CreateAdminInput) { return this.call(AdminsService.endpoints.create, { body: input }); }
}
```

Chemin relatif seulement ; méthodes de prototype ; entrées en objet typé ;
endpoints en `private static` ; verbes d'action.

## Patron d'une server action (mutation)

```ts
// server/actions/admins.action.ts
"use server";
import { adminsService } from "@/server/services";
import { createAdminInput } from "@/server/services/admins/admins.schema";
import { toActionResult } from "@/server/api/action-result";

export async function createAdminAction(input: unknown) {
  return toActionResult(() => adminsService.createAdmin(createAdminInput.parse(input)));
}
```

L'action ne contient ni en-tête, ni URL, ni `fetch`. `toActionResult` transforme
une `ApiError` en `{ ok: false, code, fieldErrors }` pour le formulaire.

## Formulaires et confirmations

- `react-hook-form` + `zodResolver` avec le **même** schéma que le service.
- Les erreurs `VALIDATION_FAILED` de l'API sont reversées dans les champs.
- Une action irréversible ouvre une feuille du bas (`GlobalSheet`) qui nomme
  l'objet ; jamais une boîte d'alerte.

## Cache

- Lectures admin : pas de cache public (`cache: "no-store"` de la base).
- Mutations : `refreshAfter` ou `revalidatePath` après succès.
- Avant tout `"use cache"`, `cacheLife`, `cacheTag` : lire la doc Next installée
  (`node_modules/next/dist/docs/`), la version change les règles.

## Ce qui reste à vérifier

- Forme exacte de `toActionResult` et de la fabrique `services/index.ts` : à
  écrire, aucune des deux n'existe encore.
- Découpage en dossiers : à aligner sur les tags réels d'`openapi.json`, pas
  sur les écrans.

## Liens

- [[dashboard-ux]] — système UI/UX (shadcn, Halo v2, mobile)
- [[admin-access-flows]] — deux niveaux d'authentification (D78)
- [[roles-and-commissions]] — périmètres par rôle

## Décisions complémentaires (2026-10-23, utilisateur)

- **Pas d'i18n.** Pas de next-intl, pas de fichiers de messages, pas de
  fonction `t` injectée. Les libellés sont écrits en français directement dans
  les composants, en constantes nommées en tête de fichier quand ils se
  répètent. Les colonnes restent une fabrique `columns.tsx`, sans paramètre de traduction.
- **Paramètres d'URL avec nuqs.** Un fichier de parseurs par table
  (`src/server/query/<table>.params.ts`), défini une fois, importé côté serveur
  (`nuqs/server`) et côté client (`useQueryStates`). Pas de liste globale.
  Préfixe de clé par table. Valeurs par défaut écrites une seule fois dans le
  parseur. `history: "replace"` pour la recherche et la pagination.
  Ne pas reprendre le store de tableau ni le drapeau d'écho du dépôt de référence.
  Vérifier l'API nuqs installée avant d'écrire le code.
- **Server first confirmé** : la page serveur lit `searchParams` (Promise dans
  Next 16, à vérifier dans la doc installée), charge les données, et passe les
  résultats en props. Le client ne fait que modifier l'URL.
- **Référence** : `60-research/reference-middle-office-v1` pour les bons points
  à reprendre (organisation, services, actions, composants, outillage).
