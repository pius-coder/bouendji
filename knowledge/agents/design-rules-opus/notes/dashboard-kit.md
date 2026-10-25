---
id: dashboard-kit
title: Kit du dashboard — primitives, patron de page, règles
kind: node
status: assumption
updated: 2026-10-24
tags: dashboard, kit, shell, nextjs, nuqs, design
proposed-by: design-rules-opus
target: 30-clients/dashboard-kit.md
---

# Kit du dashboard — spécification pour implémenter les pages

> Proposé par `design-rules-opus` (2026-10-24). Cible : `30-clients/dashboard-kit.md`
> (l'orchestrateur intègre). Code : `apps/dashboard/src/`. Référence vivante :
> la page interne **`/kit`** (absente en production). Patron de page complet :
> l'accueil, `app/(dashboard)/page.tsx`.
> Décisions : D86 (skills better-* autorisées), D87 (ombres + bordures fines),
> D88 (accent jaune Chariow, texte sombre). Architecture : `dashboard-architecture`.

## 1. Règle d'or

- Une page importe **seulement** `@/components/common/*`, `@/components/shell/*`,
  ses blocs de domaine `@/components/<domaine>/*`, `@/server/*`, `@/lib/*`.
  Jamais `@/components/ui/*` (shadcn = couche interne du kit), jamais
  `@/components/_legacy/*` (à supprimer page par page), jamais `lucide-react`.
- Une page n'implémente rien : en-tête synchrone + un bloc serveur par donnée,
  chacun dans `DataBoundary` (Suspense + erreur locale avec « Réessayer »).
- Un bloc serveur lit l'URL (`load`), appelle un service, calcule (fonctions pures
  dans `lib/`), passe des props sérialisables à un module client. Le client n'a
  **aucun** fetch ; il écrit l'URL (nuqs, `shallow: false`) ou appelle une server action.
- Heure courante : jamais au rendu nu. `getRequestNow()` (`server/loaders/home.ts` :
  `connection()` puis `Date.now()`, dédoublonné par requête) ou `UpdatedAt` (async,
  lit l'heure après `connection()`). Raison : Cache Components, erreur
  « blocking-prerender-current-time ».
- Une fonction exportée d'un module `"use client"` ne s'appelle pas côté serveur :
  les formats partagés vivent dans `lib/` (ex. `lib/chart-format.ts`).

## 2. Patron de page (blueprint)

```tsx
// app/(dashboard)/[communityId]/devices/page.tsx
export default function DevicesPage({ params, searchParams }: PageProps<"/[communityId]/devices">) {
  return (
    <PageBody wide>
      <PageHeader title="Appareils" action={<NewThingButton />} />
      <SplitView panel={<Suspense fallback={null}><DeviceDetail params={params} searchParams={searchParams} /></Suspense>}>
        <GroupedList>
          <GroupedSection title="Appareils" titleId="appareils" inset={false} footer="100 derniers renvoyés par l’API.">
            <DataBoundary fallback={<ListSkeleton count={8} />}>
              <DevicesSection params={params} searchParams={searchParams} />
            </DataBoundary>
          </GroupedSection>
        </GroupedList>
      </SplitView>
    </PageBody>
  );
}
```

Fichiers d'une table (copier `components/kit/kit-devices-*` et `server/query/kit.params.ts`) :

| Fichier | Rôle |
|---|---|
| `server/query/<table>.params.ts` | `defineTable({ prefix, sortKeys, defaultSort, filterKeys })`, une fois |
| `components/<domaine>/<table>-section.tsx` (serveur) | `await table.load(searchParams)` → service → `applyTableQuery(rows, table, state, { search, sort, filters })` → `<XxxTable rows total exportRows />` |
| `components/<domaine>/<table>-table.tsx` (`"use client"`) | colonnes, filtres, actions de ligne, actions groupées → `<DataTable … />` |
| `components/<domaine>/<item>-detail.tsx` (serveur) | lit `<prefix>_open`, rend `<DetailPanel closeHref=… />` ou `null` |

`applyTableQuery` trie et pagine **dans le serveur Next** : l'API ne trie pas et
plafonne ses listes (100 éléments ou une page à curseur). Dire la portée réelle
dans `scopeNote` ou le pied de section, jamais la cacher.

## 3. Primitives (`components/common/`)

| Primitive | Fichier | API (props principales) | Remplace |
|---|---|---|---|
| `PageBody` | page-layout | `wide?` | conteneurs ad hoc |
| `SplitView` | page-layout | `panel` (Suspense → `DetailPanel` ou rien) ; 2ᵉ colonne seulement si un `<aside>` est rendu (≥ 1280 px) | grilles maison |
| `PageHeader` | page-header | `title` (< 15 car.), `subtitle?`, `action?` (un `Button prominent`), `menu?: MenuAction[]` (liens seulement depuis le serveur), `back?`, `children` (contrôles sous le titre) ; titre replié dans la barre au défilement | `_legacy/page-title` |
| `GroupedList` / `GroupedSection` / `SectionHeader` / `SectionFooter` | grouped-list | `title?`, `titleId?`, `action?`, `footer?`, `inset?` | `Card` décorative |
| `ListRow` / `ListRowSkeleton` / `ListSkeleton` | list-row | `title`, `subtitle?`, `value?`, `leading?`, `trailing?`, `accessory?`, `href?` + `replace?` `scroll?`, `onClick?` (client), `destructive?`, `selected?` | lignes faites main |
| `StatStrip` / `StatStripSkeleton` / `Delta` / `deltaPercent` | stat-strip | `items: {label, value, hint?, tone?}[]` ; `Delta value={n or null}` | KPI en cartes |
| `InsightBand` / `InsightBandSkeleton` | insight-band | `series`, `data: {x, values}[]`, `totals`, `format: number or xaf`, `breakdown?`, `note?`, `period?` ; utilisable depuis le serveur ; mise en page par requête de conteneur | orya `AdminInsightBand` |
| `AreaChart`, `ChartLegend`, `Sparkline`, `BarList`, `MeterRow` | charts (client) | `AreaChart` : `data`, `series`, `label` (obligatoire), `axes?`, `height?`, `format?` ; tableau `sr-only` intégré | recharts (non installable ici) |
| `PeriodSwitch` / `SegmentedControl` | segmented-control | `options`, `value`, `onValueChange`, `label`, `size?`, `pending?` | `_legacy/chip-filter` |
| `DataTable` | data-table (client) | voir § 4 | `_legacy/data-table` |
| `DetailPanel` / `DetailFacts` / `DetailPanelSkeleton` | detail-panel | `title`, `subtitle?`, `closeHref`, `actions?`, `children` ; ≥ 1280 px colonne collante, sinon feuille plein écran | feuilles de détail maison |
| `TextField` / `SecureField` / `TextFieldRow` / `RequiredMark` | text-field | `label` (visible), `hint?`, `error?`, `leading?` (icône), `trailing?`, `clearable?`, `required?` (astérisque rouge + « obligatoire » lu) ; compatible `register()` | `Input` brut |
| `SearchField` | search-field | `value`, `onSearch`, `label`, `placeholder?`, `debounceMs?` (300) | `_legacy/search-box` |
| `SelectField` / `SelectRow` / `SelectChip` | select-field | `label` ou `title`, `value`, `options`, `onValueChange` | `Select` brut |
| `PickerSheet` | picker-sheet | `open`, `title`, `options`, `value`, `onValueChange` | longues listes en menu |
| `SwitchRow` | switch-row | `title` (état activé), `description?`, `checked`, `onCheckedChange` | `Switch` isolé |
| `Button` / `Spinner` / `buttonVariants` | button | `variant: prominent, tinted, plain, neutral, destructive, destructive-plain` ; `size: sm, md, lg, icon` ; `loading?`, `loadingLabel?`, `asChild?` | `ui/button` |
| `NavBarButton` | nav-bar-button | `label` (obligatoire), icône en enfant | boutons icône sans nom |
| `ActionMenu` | action-menu | `actions: {label, icon?, href?, onSelect?, destructive?, hidden?}[]`, `title?`, `label?` | menus ad hoc |
| `AppSheet` | app-sheet | `open`, `onOpenChange`, `title`, `description?`, `action?: {label, form?, onClick?, loading?}`, `dirty?` (confirme l'abandon), `footer?` | `*-sheet.tsx` maison |
| `ConfirmAlert` | confirm-alert | `title`, `message?`, `confirmLabel`, `destructive?`, `pending`, `error?`, `reason?`, `onConfirm → Promise<boolean>` | `_legacy/confirm-dialog` |
| `EmptyState` / `ErrorState` / `ForbiddenState` | states | `title`, `description?`, `action?`, `query?` ou `filtered?`, `inset?` | `_legacy/empty-block`, `_legacy/error-state` |
| `DataBoundary` | data-boundary | `fallback`, `errorTitle?` ; `catchError` Next + Suspense, « Réessayer » relit le bloc | Suspense nus |
| `StatusBadge` / `statusLabel` | status-badge | `status` (vocabulaire unique `STATUS`) | badges colorés |
| `UpdatedAt` | updated-at | serveur async, `scope?` | — |
| `notify` | toast | `success`, `error` (reste affiché), `action` | Sonner direct |
| `Icon` | icon | `name` (Solar), `filled?` (actif), `label?` (sinon décoratif) | `lucide-react` |
| `icon-compat` | icon-compat | noms lucide → Solar, pour `ui/` et `_legacy/` seulement | — |
| `SplitAuthLayout` / `SocialButton` / `OrDivider` | auth-layout | écran de connexion façon Chariow ; `SocialButton logo={…}` (Solar n'a pas de logos de marque) | login actuel |
| `PageChromeProvider` / `useLargeTitle` / `useCollapsedTitle` | page-chrome | interne au shell et à `PageHeader` | — |

## 4. `DataTable`

Props : `table` (le `defineTable`), `rows` (page), `total`, `columns`
(`{id, header, cell, sortKey?, align?, width?, hideable?, defaultHidden?, mobile?, exportValue?}`),
`getRowId`, `rowLabel`, `label`, `filters?`, `rowActions?(row)`,
`bulkActions?: {label, destructive?, confirm?, run(ids)}[]`, `exportRows?`, `empty`,
`storageKey`, `scopeNote?`, `openable?`.

Fourni : recherche (300 ms), filtres en puces (`<prefix>_<clé>`), tri par en-tête
(`aria-sort`), colonnes affichables et densité (localStorage), sélection multiple
et barre d'actions groupées (confirmation pour l'irréversible), clic sur ligne =
`<prefix>_open`, actions par ligne (« … »), pagination et taille de page, export CSV
(UTF-8 avec BOM, séparateur `;`), état vide premier usage ou filtré, mobile en
liste groupée avec mode « Sélectionner ».

## 5. Shell (`components/shell/`, `app/(dashboard)/layout.tsx`)

Structure orya-stack (`app/[locale]/admin/admin-shell.tsx`) : ≥ 1024 px, rail de
sections (Pilotage, Communauté, Argent, Plateforme ; libellé visible sous chaque
icône), sous-menu de la section avec le sélecteur de communauté en tête (barre de
contexte), bande de section (titre display, point jaune, description), contenu en
feuille arrondie posée sur le cadre avec filet 1 px. < 1024 px : barre du haut en
verre (communauté, titre replié, compte), puces des écrans de la section, barre
d'onglets basse (5 entrées au plus, « Plus »). Modèle testé : `nav-model.ts`
(`buildNav`, `buildSections`, `resolveSection`). Ajouter un écran = une entrée dans
`buildNav`.

## 6. Palette et contrastes mesurés (jetons de `app/globals.css`)

Sources : couleurs système Apple **publiées** (texte alternatif des tableaux du HIG
« Color », `color.json`, génération iOS 27) pour bleus, verts, rouges, oranges,
gris ; labels, fonds groupés, séparateurs, remplissages relevés sur iOS 13
(noahgilmore.com), **non vérifiés pour iOS 27** ; accent Chariow relevé dans la CSS
publique de chariow.com (`yellow-500 #ffcc00`, `yellow-400 #ffdb0d`, texte `#141b34`).
Apple Design Resources propose le kit iOS 27 en Figma/Sketch seulement, non
téléchargé ici : dimensions non vérifiées hors HIG (44 pt, 11 pt).

Écarts volontaires à Apple pour tenir 4,5:1 : `secondaryLabel` .60 → .76 (Apple .60
= 3,44:1), `placeholderText` .30 → .78, états clairs = variantes « contraste
renforcé » publiées par Apple. Le jaune n'est jamais du texte sur fond clair
(1,51:1) : lien clair `#8a5700`, anneau de focus clair navy.

| Paire | Couleurs | Ratio | Seuil |
|---|---|---|---|
| Clair · texte / cellule | #141b34 / #ffffff | 16.99 | ≥ 4.5 ✓ |
| Clair · texte / fond groupé | #141b34 / #f2f2f7 | 15.22 | ≥ 4.5 ✓ |
| Clair · texte / champ | #141b34 / #efeff0 | 14.78 | ≥ 4.5 ✓ |
| Clair · secondaire (60,60,67 @.76) / cellule | #6b6b70 / #ffffff | 5.30 | ≥ 4.5 ✓ |
| Clair · secondaire / fond groupé | #68686e / #f2f2f7 | 4.96 | ≥ 4.5 ✓ |
| Clair · secondaire / champ | #67676d / #efeff0 | 4.89 | ≥ 4.5 ✓ |
| Clair · placeholder (@.78) / champ | #636369 / #efeff0 | 5.19 | ≥ 4.5 ✓ |
| Clair · bouton principal : navy / jaune | #141b34 / #ffcc00 | 11.24 | ≥ 4.5 ✓ |
| Clair · survol : navy / #ffdb0d | #141b34 / #ffdb0d | 12.45 | ≥ 4.5 ✓ |
| Clair · lien #8a5700 / cellule | #8a5700 / #ffffff | 6.10 | ≥ 4.5 ✓ |
| Clair · lien / fond groupé | #8a5700 / #f2f2f7 | 5.46 | ≥ 4.5 ✓ |
| Clair · texte / sélection #fffec1 | #141b34 / #fffec1 | 16.34 | ≥ 4.5 ✓ |
| Clair · texte / survol #fffcf2 | #141b34 / #fffcf2 | 16.55 | ≥ 4.5 ✓ |
| Clair · anneau de focus navy / cellule | #141b34 / #ffffff | 16.99 | ≥ 3 ✓ |
| Clair · jaune / cellule (non-texte, décor seulement) | #ffcc00 / #ffffff | 1.51 | non-texte |
| Clair · succès #008932 / cellule | #008932 / #ffffff | 4.54 | ≥ 4.5 ✓ |
| Clair · alerte #c55300 / cellule | #c55300 / #ffffff | 4.55 | ≥ 4.5 ✓ |
| Clair · erreur #e9152d / cellule | #e9152d / #ffffff | 4.56 | ≥ 4.5 ✓ |
| Clair · blanc / bouton destructif #e9152d | #ffffff / #e9152d | 4.56 | ≥ 4.5 ✓ |
| Clair · séparateur (60,60,67 @.29) / cellule | #c6c6c8 / #ffffff | 1.71 | non-texte |
| Clair · série 1 navy / cellule | #141b34 / #ffffff | 16.99 | ≥ 3 ✓ |
| Clair · série 2 #8e8e93 / cellule | #8e8e93 / #ffffff | 3.26 | ≥ 3 ✓ |
| Clair · série 3 #008932 / cellule | #008932 / #ffffff | 4.54 | ≥ 3 ✓ |
| Sombre · texte / cellule | #ffffff / #1c1c1e | 17.01 | ≥ 4.5 ✓ |
| Sombre · texte / fond | #ffffff / #000000 | 21.00 | ≥ 4.5 ✓ |
| Sombre · secondaire (235,235,245 @.6) / cellule | #98989f / #1c1c1e | 5.94 | ≥ 4.5 ✓ |
| Sombre · secondaire / fond | #8d8d93 / #000000 | 6.36 | ≥ 4.5 ✓ |
| Sombre · secondaire / élevée | #9f9fa5 / #2c2c2e | 5.29 | ≥ 4.5 ✓ |
| Sombre · placeholder (@.6) / champ | #a1a1a9 / #323236 | 4.98 | ≥ 4.5 ✓ |
| Sombre · bouton principal : navy / jaune | #141b34 / #ffcc00 | 11.24 | ≥ 4.5 ✓ |
| Sombre · lien jaune / cellule | #ffcc00 / #1c1c1e | 11.25 | ≥ 4.5 ✓ |
| Sombre · anneau jaune / cellule | #ffcc00 / #1c1c1e | 11.25 | ≥ 3 ✓ |
| Sombre · succès #30d158 / cellule | #30d158 / #1c1c1e | 8.42 | ≥ 4.5 ✓ |
| Sombre · alerte #ff9230 / cellule | #ff9230 / #1c1c1e | 7.62 | ≥ 4.5 ✓ |
| Sombre · erreur #ff4245 / cellule | #ff4245 / #1c1c1e | 4.96 | ≥ 4.5 ✓ |
| Sombre · série 1 jaune / cellule | #ffcc00 / #1c1c1e | 11.25 | ≥ 3 ✓ |
| Sombre · série 2 #8e8e93 / cellule | #8e8e93 / #1c1c1e | 5.22 | ≥ 3 ✓ |
| Sombre · séparateur (84,84,88 @.6) / cellule | #3e3e41 / #1c1c1e | 1.60 | non-texte |

Formule WCAG 2.x, calculée par script sur les valeurs déclarées, alpha composé sur
le fond réel. Les états clairs (environ 4,55) sont mesurés sur cellule blanche ; sur
fond groupé ils tombent vers 4,07 : **ne pas poser un texte d'état directement sur
le fond groupé**.

Rayons : 12 px (champs, boutons, sections) ; coins continus via
`corner-shape: squircle` quand le navigateur le gère. Ombres (D87) : `shadow-float`
(bordure 1 px + ombre douce) sur menus, feuilles, dialogues, infobulles ; jamais sur
les cellules. Typographie : pile système SF ; titres display
`"Sang Bleu Republic", "New York", ui-serif` (Sang Bleu = police Chariow, non
fournie : New York ou serif en repli).

## 7. Interdits

1. Importer `components/ui/*`, `_legacy/*` ou `lucide-react` depuis une page.
2. Recréer une ligne, un champ, une feuille, un état, une table : utiliser le kit.
3. `Card` décorative, carte dans une carte, cadre pointillé.
4. Ombre sur une cellule ou une section (ombres réservées au flottant, D87).
5. Texte blanc sur jaune ; jaune comme texte ou anneau sur fond clair.
6. Contrôle de moins de 44 px de haut sur mobile ; texte de moins de 11 px.
7. Icône seule sans nom accessible ; icône seule dans la navigation.
8. `Date.now()` ou `new Date()` au rendu d'un composant serveur sans `connection()`.
9. Appeler côté serveur une fonction d'un module `"use client"`.
10. Chargement côté client (`useEffect` + fetch, React Query) ; route handlers.
11. Plus d'une action `prominent` par vue ; alerte pour une action annulable.

## 8. Vérifié (2026-10-24)

- `bun run typecheck`, `bun run lint` : aucune erreur. `bun run test` : 71/71 (dont
  `test/kit.test.ts`, 17 tests : table, calculs de l'accueil, URL, sections).
  `bun run build` : compilé, 15 routes générées.
- Navigateur (serveur de dev du port 3000, compte de prévisualisation local) :
  accueil desktop en clair et en sombre, mobile 375 px ; période 90 j (URL
  `h_period=90j`, chiffres recalculés : 537 000 FCFA, 25 commandes, 40 abonnés) ;
  versement ouvert dans le panneau latéral ; alerte d'approbation ouverte puis
  annulée (aucune approbation envoyée) ; `/kit` : ligne ouverte (`k_open`), tri par
  en-tête (`k_sort=name.asc`), filtre par URL (« 1–10 sur 13 », puce « Statut :
  Révoqué »), page suivante (« 11–13 sur 13 »). Pages legacy `/payouts`,
  `/[id]/orders`, `/network` affichées dans le nouveau shell.
- Non vérifié : clic sur une option de filtre (menu refermé pendant le test ; l'URL
  a été vérifiée à la place), export CSV, densité, colonnes, actions groupées,
  `AppSheet`, `PickerSheet`, mode sombre mobile.

## 9. Ce que Sonnet fait ensuite, dans l'ordre

1. Réécrire chaque page avec le patron du § 2, une par commit : Appareils, Abonnés,
   Commandes, Versements, Réseau, Communautés, Forfaits, Membres, Journal. Supprimer
   à chaque fois les fichiers `_legacy/*` devenus inutiles.
2. Réécrire `/login` avec `SplitAuthLayout`, `TextField required leading`,
   `SecureField` (sans bouton social tant qu'aucun fournisseur n'est décidé).
3. Quand plus rien n'importe `icon-compat` hors `ui/` : retirer `lucide-react` du
   `package.json` (réseau nécessaire pour régénérer `bun.lock`) et installer
   `@solar-icons/react` (2.3.3 sur npm) pour remplacer `common/icon.tsx`.
4. Ajouter une règle ESLint `no-restricted-imports` (pages : ni `ui/`, ni `_legacy/`, ni `lucide-react`).
