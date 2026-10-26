# Audit — kit ui et common (dashboard)

Périmètre : `apps/dashboard/src/components/ui` (35 fichiers, ~117 Ko, 3 887 lignes),
`apps/dashboard/src/components/common` (29 fichiers, ~202 Ko, 3 421 lignes),
`apps/dashboard/src/app/globals.css` (411 lignes), `apps/dashboard/components.json`.
Lecture seule. Les importeurs ont été comptés par Grep sur `apps/dashboard/src`
(fichiers distincts, hors fichier lui-même).

## 1. Verdict

- Le socle shadcn est présent et cohérent : Radix via le paquet unifié `radix-ui`, `vaul` pour les tiroirs, `cmdk` pour la palette, `sonner` (`apps/dashboard/package.json:18,24,29,32`). Les jetons (`globals.css:13-93`, bloc `.dark` `:112`, rayons `:265-272`) reprennent les règles 2 à 4 de la section 2 de `dashboard-plan`.
- Le kit est en double : deux boutons, trois états vides, deux tableaux, deux recherches, deux filtres, deux confirmations, deux tiroirs responsives aux seuils différents. `common/` sert surtout la route `kit`.
- 13 fichiers de `ui/` (~55 Ko) n'ont aucun importeur. Le plan manque Stepper, Tour, PriceIndicator, PhonePreview et Dropzone. Ctrl K n'est pas branché alors que `ui/command.tsx` et `cmdk` existent.
- Verdict : base réutilisable, à consolider avant de construire (une version par besoin, puis ajouts). Aucun fichier modifié.

## 2. Inventaire

### 2a. `ui/` (shadcn, 35 fichiers)

| Fichier | Rôle | Taille | Importeurs | État |
|---|---|---|---|---|
| button.tsx | Bouton cva + Radix Slot, « bouton unique (D108) » (`:7-12`), export `:69` | 3 Ko | 28 | solide |
| sheet.tsx | Feuille Radix (desktop), `"use client"` `:1` | 4,5 Ko | 15 (dont `common/app-sheet.tsx`) | solide |
| drawer.tsx | Tiroir vaul (mobile), en-tête `bg-accent-wash` `:79` | 4,4 Ko | 3 | solide |
| dropdown-menu.tsx | Menu Radix | 8,7 Ko | 5 | solide |
| field.tsx | Libellé, champ, erreur | 6,4 Ko | 10 | solide |
| input.tsx, textarea.tsx | Champs | 1 Ko, 0,8 Ko | 12, 4 | solide |
| input-group.tsx | Champ avec addon | 5,2 Ko | 1 (`auth/login-form.tsx:8`) | solide |
| spinner.tsx | Spinner, dépend de `common/icon-compat` | 0,4 Ko | 12 | solide |
| select.tsx | Select Radix | 6,5 Ko | 2 | solide |
| alert-dialog.tsx, dialog.tsx | Confirmation, modale | 5,6 Ko, 4,5 Ko | 3, 1 | solide |
| tooltip, switch, checkbox, label, separator, skeleton, badge, toggle, sonner | primitives | 0,3 à 2 Ko | 1 à 3 | solide |
| **command.tsx** | Palette `cmdk` | 5 Ko | **0** | présent, non branché |
| **tabs.tsx** | Onglets Radix | 3,8 Ko | **0** | présent, non branché (plan 7) |
| **avatar.tsx** | Avatar Radix | 3 Ko | **0** | non utilisé |
| **alert.tsx** | Bandeau d'alerte | 1,7 Ko | **0** | non utilisé |
| **item.tsx** | Ligne « item » Radix | 4,7 Ko | **0** | non utilisé (doublon de `common/list-row.tsx`) |
| **empty.tsx** | Bloc vide | 2,5 Ko | **0** | mort (doublon de `page/empty.tsx`) |
| **table.tsx** | Table brute | 2,6 Ko | **0** | mort (le tableau utilisé est `page/table.tsx`) |
| **card.tsx** | Carte | 2,1 Ko | **0** | mort |
| **breadcrumb.tsx** | Fil d'Ariane | 2,5 Ko | **0** | mort |
| **collapsible.tsx** | Repli | 0,8 Ko | **0** | mort |
| **scroll-area.tsx** | Zone de défilement | 1,7 Ko | **0** | mort (défilement natif de la surface, `globals.css:365`) |
| **toggle-group.tsx** | Groupe de bascule | 2,3 Ko | **0** | mort (remplacé par `common/segmented-control.tsx`) |
| **sidebar.tsx** | Sidebar shadcn complète, raccourci Ctrl+B `:101` | 22 Ko, 726 l. | **0** | mort (navigation réelle : `shell/bottom-bar.tsx`) |

### 2b. `common/` (29 fichiers, dont `icon.tsx` = 76 Ko)

| Fichier | Rôle | Taille | Importeurs | État |
|---|---|---|---|---|
| icon.tsx | Icônes Solar (sous-ensemble vendu), `IconName` `:120`, `Icon` `:122`, attribution CC BY 4.0 `:3-12` | 76 Ko, 154 l. | 40 | solide mais lourd (lignes très longues) |
| icon-compat.tsx | Alias de noms lucide vers `Icon` (`:19-36`) | 2 Ko | 15, dont 10 dans `ui/` | inversion : `ui/` dépend de `common/` |
| button.tsx | Second bouton cva (`:13`), export `Button` `:50` | 3,4 Ko | 6 | **doublon** de `ui/button.tsx` |
| data-table.tsx | `DataTable` générique, filtres, actions de masse (`:107`) | 30 Ko, 706 l. | 1 (`components/kit/kit-devices-table.tsx`) | **doublon** de `page/table.tsx` |
| app-sheet.tsx | Feuille responsive : `useMediaQuery(WIDE_QUERY)` `:62`, Sheet ou Drawer, confirmation de fermeture | 5,8 Ko | 3 | **base** du tiroir responsive du plan |
| detail-panel.tsx | Panneau de détail, `useMediaQuery(PANEL_QUERY)` `:33` (1280 px) | 4,9 Ko | 2 | **doublon** d'app-sheet, seuil différent |
| confirm-alert.tsx | `ConfirmAlert` `:28` | 4,5 Ko | 3 | **doublon** de `page/confirm-dialog.tsx:25` |
| states.tsx | `EmptyState` `:50`, `ErrorState` `:82`, `ForbiddenState` `:101` | 3,2 Ko | 4 | **doublon** de `page/empty.tsx:6` et `ui/empty.tsx` |
| search-field.tsx | `SearchField` `:13` | 2,8 Ko | 3 | **doublon** de `page/search-box.tsx:13` |
| segmented-control.tsx | `SegmentedControl` `:16`, `PeriodSwitch` `:97` | 3,9 Ko | 6 | solide, à garder |
| stat-strip.tsx | Bandeau de statistiques | 3,1 Ko | 2 | **doublon** de `page/stat.tsx` |
| page-layout.tsx | `PageBody` `:8`, `SplitView` `:27` | 1,5 Ko | 2 | solide |
| page-chrome.tsx | Titre réduit/large : `PageChromeProvider` `:17`, `useLargeTitle` `:33` | 2 Ko | 3 | solide (`app/(dashboard)/layout.tsx:25`) |
| page-header.tsx | `PageHeader` `:16` | 2,5 Ko | 1 (kit) | à comparer à `page/page.tsx` |
| list-row.tsx | `ListRow` `:39`, skeletons `:119`, `:139` | 5,8 Ko | 4 | solide, base des lignes cliquables |
| status-badge.tsx | Pastille de statut | 2,9 Ko | 22 | solide |
| updated-at.tsx | Date de mise à jour (async) | 0,7 Ko | 14 | solide |
| text-field.tsx, select-field.tsx, switch-row.tsx | Champs de haut niveau | 7,8 Ko, 4,6 Ko, 2,3 Ko | 1 à 3 (surtout kit) | redondants avec `ui/field` |
| picker-sheet.tsx | Sélecteur en feuille (`AppSheet` + recherche) | 2,9 Ko | 1 (kit) | à garder si les plages/forfaits en ont besoin |
| charts.tsx | Graphiques | 13,6 Ko | 2 | non vérifié (pas de lib de graphiques dans `package.json`) |
| insight-band, grouped-list, nav-bar-button, action-menu, auth-layout, data-boundary, toast.ts | divers | 1 à 4 Ko | 1 à 3 | utilisés ; `toast.ts:10` (`notify`) wrappe `sonner` |

Aucun fichier de `common/` n'est orphelin ; la plupart ne sont importés que par la route `kit`.

### 2c. Thème et configuration

- `apps/dashboard/src/app/globals.css` : `:root` `:13-93`, accents `[data-accent=vert]` `:96` et `rouge` `:104`, `.dark` `:112`, `@theme inline` `:207-272`, `@utility` `:303-340`, base `:354-368`.
- `apps/dashboard/components.json` : `"style": "new-york"` (l. 6), `"iconLibrary": "lucide"` (l. 16), `"baseColor": "neutral"` (l. 12). Écart : `lucide-react` est dans `package.json:20` mais **aucun import** dans `src`. Les icônes réelles sont Solar (`common/icon.tsx`).
- Version exacte de shadcn : non vérifié (lockfile non lu).

## 3. Ce qui sert le plan

- `globals.css:34` `--border: #e5e7e8`, `:61` `--primary: #242528` (bouton noir), `:265-272` rayons 6/8/10/12/16/24 : conformes aux règles 2, 3 et 4 de `dashboard-plan` section 2.
- `globals.css:85-90` : `--shadow-card` est une bordure (`0 0 0 1px`), conforme à « pas d'ombre sur les cartes ».
- `globals.css:365-366` (`html, body { overflow: hidden }`) et `app/(dashboard)/layout.tsx:26` (`h-dvh overflow-hidden`) : conformes à la règle 1 (seule la surface défile).
- `ui/button.tsx:7-12` : taxonomie Apple (Prominent noir, Bordered, Bordered Tinted, Destructive). À garder comme seul bouton.
- `common/app-sheet.tsx:62` : tiroir responsive. À garder comme base du composant unique.
- `common/list-row.tsx:39` : lignes cliquables (plan 7 « tout nom cliquable », plan 1 « sessions »).
- `common/segmented-control.tsx:16`, `:97` : contrôle segmenté (plan 7).
- `shell/bottom-bar.tsx:21` (`BottomBar`, entrée « Plus » `:13`) : barre basse. Nombre d'entrées non vérifié (plan : 5).
- `ui/tabs.tsx`, `ui/command.tsx` : à garder et à brancher (plan 7).
- `common/page-chrome.tsx:17` : titre réduit/large.

## 4. Écarts avec le plan

**1. Mot de passe forcé, Mon compte (sessions, thème).**
- Manque : aucune ligne « session ouverte ». `ui/item.tsx` et `ui/avatar.tsx` sont orphelins.
- Réutilisable : `common/list-row.tsx:39` ; `ui/field.tsx` pour les trois champs de mot de passe.

**2. Onboarding en 6 étapes, aperçu, logo.**
- **Stepper absent** : aucune définition dans `apps/dashboard/src` (Grep).
- **Dropzone absent** : aucun `type="file"`, aucune dépendance d'upload dans `package.json`.
- **PhonePreview absent**.
- Sélecteur de couleur : non vérifié hors tranche.

**3. Guide par rôle (Tour).** **Absent**. `common/page-chrome.tsx` ne gère que le titre.

**4. Forfaits, plages 20h-24h, 24h-4h, 20h-4h.** `common/picker-sheet.tsx:14` et `common/segmented-control.tsx:16` peuvent porter le choix. Saisie de prix avec devise : non vérifiée.

**5. Prix plancher, indicateur de prix.** **PriceIndicator absent**.

**6. Telegram.** Hors tranche.

**7. Dashboard : sections, onglets, tiroirs, Ctrl K.**
- Tiroirs : `common/app-sheet.tsx:62` (seuil **768 px**) et `common/detail-panel.tsx:33` (seuil **1280 px**). Deux implémentations pour un même besoin. Le plan veut un seul composant : Sheet à droite en desktop, Drawer en bas en mobile.
- Onglets : `ui/tabs.tsx` non importé.
- Ctrl K : `ui/command.tsx` non importé ; aucun écouteur `metaKey`/`ctrlKey` hors `ui/sidebar.tsx:101`, lui-même mort. **Non branché.**
- Tableaux : deux systèmes. `page/table.tsx:47` (`TableCard`, une trentaine de fichiers) et `common/data-table.tsx:107` (1 fichier).
- Cache client, SSE, présence : hors tranche.

**8. Réseau (noms génériques, VLESS collé, champs en lecture).** Rien de dédié. Lecture seule : `ui/field.tsx` (non vérifié qu'il gère `readOnly`).

**9. App Android.** Hors tranche.

## 5. Structure de code proposée

**Créer** (`components/common/`, sauf mention) :
- `stepper.tsx` : `export function Stepper({ steps: { id: string; label: string }[]; current: number; onStepChange?(i: number): void; children })`, et `StepperStep`.
- `tour.tsx` : `export function TourProvider({ role: Role; progress: TourProgress; children })`, `export function useTour(): { step; next(); skip(); done }`. L'avancement est lu et écrit côté serveur (route à créer hors tranche).
- `price-indicator.tsx` : `export function PriceIndicator({ price: number; floor: number; currency?: string })` qui retourne `{ level: "ok" | "warn" | "below"; minPrice: number }`. Logique pure dans `lib/pricing.ts` (hors tranche).
- `phone-preview.tsx` : `export function PhonePreview({ brandColor: string; logoUrl?: string; appName: string; children })`, cadre en CSS.
- `dropzone.tsx` : `export function Dropzone({ accept: string; maxBytes: number; value?: File | string; onFile(f: File): void })` sur `<input type="file">` natif, sans dépendance.
- `command-palette.tsx` : `export function CommandPalette({ items: { id; label; href; group }[] })` sur `ui/command.tsx`, et `export function useCtrlK(onOpen: () => void)` (écoute `metaKey || ctrlKey` + `k`).

**Modifier** :
- `common/app-sheet.tsx` devient le tiroir unique : exposer `ResponsiveSheet({ open, onOpenChange, title, children, breakpoint = WIDE_QUERY })`.
- `common/detail-panel.tsx` : réécrire sur `ResponsiveSheet`, ou supprimer. Aligner `PANEL_QUERY` (`hooks/use-media-query.ts:9`, 1280 px) sur `WIDE_QUERY` (`:7`, 768 px), ou garder un seuil unique documenté.
- `ui/button.tsx` devient l'unique bouton. Migrer les 6 usages de `common/button.tsx`.
- `ui/tabs.tsx` : utiliser dans les pages à onglets.
- `ui/command.tsx` : brancher via `command-palette.tsx`.
- `common/icon-compat.tsx` : faire pointer `ui/*` directement sur `Icon`, pour retirer la dépendance `ui/` vers `common/`.
- `components.json:16` : valeur d'`iconLibrary` réelle, ou documenter Solar.
- `common/icon.tsx` : scinder par graphie (`linear`, `bold`) si le bundle est jugé trop lourd (non mesuré).

**Fusionner** (une version gardée, l'autre supprimée après migration) :
- Vide : garder `page/empty.tsx` (`EmptyBlock` `:6`, 18 importeurs). Supprimer `common/states.tsx` `EmptyState` `:50` et `ui/empty.tsx`.
- Tableau : garder `page/table.tsx` (`TableCard` `:47`, `TableRows` `:92`). Reprendre dans `page/table.tsx` les fonctions utiles de `common/data-table.tsx` (filtres `:48`, actions de masse `:55`). Puis supprimer `common/data-table.tsx` (706 lignes) après migration de `kit/kit-devices-table.tsx`.
- Recherche : garder `page/search-box.tsx:13` (4 importeurs) ou `common/search-field.tsx:13` (3). Un seul nom.
- Filtre : `page/chip-filter.tsx:25` (12 importeurs) et `common/segmented-control.tsx:16` (6). Garder les deux seulement s'ils ne font pas la même chose, sinon fusionner.
- Confirmation : garder `page/confirm-dialog.tsx:25` (4) ou `common/confirm-alert.tsx:28` (3).
- Statistiques : garder `common/stat-strip.tsx` (2) ou `page/stat.tsx` (1).

**Supprimer** (0 importeur, vérifié par Grep) :
- `ui/table.tsx` (2 592 o), `ui/breadcrumb.tsx` (2 476 o), `ui/collapsible.tsx` (828 o), `ui/card.tsx` (2 068 o), `ui/scroll-area.tsx` (1 695 o), `ui/toggle-group.tsx` (2 335 o), `ui/sidebar.tsx` (22 307 o).
- Décision à prendre avec le plan : `ui/item.tsx` (4 679 o), `ui/alert.tsx` (1 678 o), `ui/avatar.tsx` (3 023 o). Gardés seulement si le plan 1 (sessions), le plan 7 (présence) ou un bandeau d'alerte les utilisent.
- Après les fusions : `ui/empty.tsx`, `common/states.tsx` (si `EmptyState` migré), `common/data-table.tsx`, `common/button.tsx`.

**Garder et brancher** : `ui/tabs.tsx`, `ui/command.tsx`.

## 6. Bugs et risques

- **Deux seuils de tiroir** : `common/app-sheet.tsx:62` (768 px) contre `common/detail-panel.tsx:33` (1280 px). Entre 768 et 1280 px, un même détail s'ouvre en feuille dans un contexte et en panneau dans l'autre.
- **Doublon de bouton** : `ui/button.tsx:7` annonce « Bouton unique », mais `common/button.tsx:13` duplique la logique. Hauteurs différentes : `common/button.tsx:32-34` donne `md:h-9` (36 px) et `h-11` en mobile ; `ui/button.tsx:7-12` annonce 32 px en compact. Un bouton de même rôle n'a pas la même taille selon le composant.
- **Effet de bord non appliqué** : `globals.css:333` (`scroll-edge`) et `:326` (`bg-accent-gradient`) définis, 0 usage. Pas de risque immédiat, mais la règle 5 du plan le demande.
- **Inversion de dépendance** : 10 fichiers de `ui/` importent `common/icon-compat` (`ui/sidebar.tsx`, `ui/dialog.tsx`, etc.). Tout composant `ui/` tire `common/icon.tsx` (76 Ko) au build (non vérifié : chaîne d'import réelle de `icon-compat`).
- **Icônes** : `components.json:16` annonce `lucide`, alors que `lucide-react` (`package.json:20`) n'est importé nulle part. Un `shadcn add` futur produirait des imports lucide absents du cadre réel (non vérifié : comportement du CLI).
- **Kit en production** : `app/(dashboard)/kit/page.tsx` importe presque tout `common/` et `components/kit/`. Si la route est livrée, le bundle s'alourdit (non vérifié : garde de build).
- **Accent par défaut rose** : `globals.css:54-58` (`--accent-from: #db2777`) pilote `--ring` (`:66`) et `--chart-1` (`:68`). Le focus et les graphiques seraient roses par défaut. La règle 2 réserve la primaire au focus, ce qui reste compatible si la teinte est voulue (non vérifié visuellement).
- **Mode sombre** : bloc `.dark` présent (`:112`). L'imbrication à `:194` n'a pas été relue en entier (non vérifié).

## 7. Dépendances hors tranche

- `apps/dashboard/src/hooks/use-media-query.ts` : `DESKTOP_QUERY` `:6`, `WIDE_QUERY` `:7`, `PANEL_QUERY` `:9`. `MOBILE_BREAKPOINT` dans `hooks/use-mobile.ts` non lu (non vérifié).
- `apps/dashboard/src/app/(dashboard)/kit/page.tsx` : décide si la route kit est livrée.
- `apps/dashboard/src/components/page/*` : migrations à planifier avec les pages (18 importeurs pour `EmptyBlock`).
- `apps/dashboard/src/components/shell/bottom-bar.tsx`, `top-bar.tsx`, `community-switcher.tsx` : nombre d'entrées de la barre basse et `NavModel` non lus.
- `knowledge/30-clients/dashboard-ux.md` cite Stepper, Tour, PriceIndicator, PhonePreview et Dropzone : non relu.
- `apps/dashboard/package.json` : versions exactes de `radix-ui`, `vaul`, `cmdk`, `sonner` (lues l. 18-32 seulement).

## 8. Non vérifié

- Version exacte de shadcn, et si `ui/` est une copie fidèle ou modifiée (en-têtes lus sur `button.tsx` et `sidebar.tsx` seulement).
- Poids réel du bundle (`icon.tsx`, `charts.tsx`) : non mesuré.
- Contrastes annoncés dans `globals.css:31-32`, `:43`, `:46` : non recalculés.
- Nombre d'entrées de `BottomBar` (plan : 5).
- Aucun build ni test lancé (lecture seule).
- Équivalence `common/data-table.tsx` et `page/table.tsx` : fonctions de filtrage et d'actions de masse non comparées ligne à ligne.
