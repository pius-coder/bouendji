---
id: design-rules
title: Règles de design du dashboard — Apple HIG, sans ombre, listes groupées
kind: node
status: assumption
updated: 2026-10-24
tags: dashboard, design, hig, apple, shadcn, accessibilite, kit
proposed-by: design-rules-opus
target: 30-clients/design-rules.md
---

# Règles de design du dashboard admin

> Proposition du sous-agent `design-rules-opus` (2026-10-24). L'orchestrateur
> intègre. Statut `assumption` : rien n'est construit ni rendu dans un
> navigateur. Une règle est **[lu]** quand la section source a été lue ;
> **[déduit]** quand c'est une transposition web ou un choix non vérifié.
> Les contrastes marqués **mesuré** sortent d'un calcul WCAG 2.x exécuté le
> 2026-10-24 (script node, formule de luminance relative). Ils portent sur
> les valeurs déclarées, pas sur un rendu.

## 0. Base et version

- HIG consulté le 2026-10-24 via le JSON officiel
  (`developer.apple.com/tutorials/data/design/human-interface-guidelines.json`
  et une page `.json` par sujet). 174 pages récupérées ; la page « What's new »
  renvoie 404.
- Dernières entrées du journal de modifications : 13 octobre 2026
  (`live-activities`, `widgets`). La génération la plus récente nommée est
  **iOS 27** (`wallet`, entrée du 8 juin 2026). Le matériau courant est
  **Liquid Glass** (`materials`, `layout`, `tab-bars`).
- **« iOS 28 » n'existe pas dans le HIG à cette date.** « iOS 28 like » est
  donc lu comme « la génération Apple la plus récente documentée » : iOS 27 +
  Liquid Glass. Aucune règle ci-dessous ne prétend venir d'iOS 28.
- Le HIG ne donne pas les valeurs hex des couleurs système en texte (ce sont
  des images) ni de mesures de rayon ou de hauteur de champ iOS. Toute valeur
  de ce type ici est **[déduit]**.

## 1. Principes

| # | Règle | Source |
|---|---|---|
| P1 | Chaque élément mérite sa place. Moins de contrôles à l'écran ; le secondaire est accessible en un geste (menu, feuille, détail). | HIG `design-principles` › Simplicity ; `designing-for-ios` › Best practices **[lu]** |
| P2 | La hiérarchie passe par la **typographie** (taille, graisse, couleur de label), l'**alignement** et l'**indentation**, puis par les **fonds groupés**, puis par des **séparateurs** fins. Jamais par une ombre. | HIG `layout` › Visual hierarchy ; better-layout « Group with space, not lines » **[lu]** ; interdiction des ombres : demande utilisateur |
| P3 | Grouper par l'espace d'abord : l'écart entre groupes vaut au moins 2× l'écart interne (8 px dedans → 16 px+ entre). | better-layout › grouping-and-alignment **[lu]** |
| P4 | Les **cartes sont l'exception**. Le conteneur par défaut est la **section groupée** (fond secondaire sur fond groupé). Une carte n'existe que pour un objet autonome manipulable (aperçu, élément glissable). Jamais de carte dans une carte. | HIG `lists-and-tables` › Style (grouped) **[lu]** ; orya `admin-page.tsx:58` « never a card inside a card » **[lu]** ; better-layout (fond = 2e outil) **[lu]** |
| P5 | Contrôles distincts du contenu : la navigation et les barres flottent au-dessus du contenu ; le contenu ne porte pas de matériau de verre. | HIG `materials` › Liquid Glass (« Don't use Liquid Glass in the content layer ») **[lu]** |
| P6 | Une seule action proéminente (deux au plus) par vue ; la couleur va sur le fond du bouton, pas sur son texte. | HIG `buttons` › Style ; `color` › Liquid Glass color ; better-colors « Fill exactly one action per view » **[lu]** |
| P7 | Divulgation progressive : liste de titres → détail. Pas de mur de données au premier niveau. | HIG `layout`, `lists-and-tables` › Content **[lu]** |
| P8 | Familiarité : réutiliser les motifs système (bouton Retour, Annuler/OK de feuille, balayage de ligne) plutôt qu'en inventer. | HIG `design-principles` › Familiarity ; `toolbars` › Navigation **[lu]** |

## 2. Tokens

### 2.1 Couleurs — structure

Rôles repris d'iOS : deux familles de fonds (système et **groupé**), chacune en
primaire / secondaire / tertiaire ; labels primaire → quaternaire ;
placeholder ; séparateur. En sombre, fonds **base** (plus sombres, l'arrière)
et **élevés** (plus clairs, ce qui est au premier plan : feuille, popover).
Sources : HIG `color` › iOS, iPadOS ; `dark-mode` › iOS, iPadOS **[lu]**.

Règles :

- Composants → tokens sémantiques uniquement ; jamais de littéral dans un
  composant. better-colors « Name primitives by hue, semantics by role » ; HIG
  `color` › System colors (« Avoid hard-coding ») **[lu]**.
- Un token ne sert qu'à son rôle (pas de séparateur comme couleur de texte).
  HIG `color` › System colors ; better-colors **[lu]**.
- Une couleur = un sens. L'accent signifie « interactif » ; il ne colore pas
  du texte statique. HIG `color` › Best practices **[lu]**.
- Fournir clair **et** sombre, et une variante contraste renforcé
  (`@media (prefers-contrast: more)`). HIG `color` › Best practices **[lu]** ;
  transposition CSS **[déduit]**.
- Un seul mécanisme de bascule de thème (aujourd'hui la classe `.dark` de
  `next-themes`). better-colors **[lu]**. Pas de réglage d'apparence propre à
  l'app en plus du système. HIG `dark-mode` › Best practices **[lu]** (un
  sélecteur système/clair/sombre reste possible : à trancher, §14).

### 2.2 Couleurs — valeurs proposées

Base : les valeurs Halo v2 déjà retenues dans `30-clients/dashboard-ux`
(sources `Atelier-identites-VPN-v2.html`, lignes citées dans ce nœud) +
les fonds groupés à ajouter. Les nouveaux gris sont **[déduit]**.

| Token (proposé) | Rôle iOS équivalent | Clair | Sombre | Origine |
|---|---|---|---|---|
| `--bg-grouped` | systemGroupedBackground | `#f2f2f7` | `#080b12` | clair [déduit] ; sombre = `--background` Halo |
| `--bg-cell` | secondarySystemGroupedBackground | `#ffffff` | `#151a24` | clair = `--card` Halo ; sombre [déduit] |
| `--bg-cell-elevated` | fond élevé (feuille, popover) | `#ffffff` | `#1f2633` | [déduit] |
| `--fill-field` | fond de champ (tertiaire) | `#efeff0` | `#2c303a` | gris `#767680` à 12 % / 24 % composé [déduit] |
| `--label` | label | `#0b1322` | `#eef4ff` | Halo `--foreground` |
| `--label-secondary` | secondaryLabel | `#5b6779` | `#98a5bb` | Halo `--muted-foreground` |
| `--label-placeholder` | placeholderText | `#646b78` | `#9aa3b2` | [déduit], choisi pour passer 4.5:1 |
| `--separator` | separator | `#3c3c43` à 18 % (≈ `#dcdcdd` sur blanc) | `#ffffff` à 10 % | sombre = Halo `--border` ; clair [déduit] |
| `--accent` | tint (liens, sélection, focus) | `#0a63cc` (texte) | `#8fc0ff` (texte) | Halo `--accent-foreground` |
| `--accent-solid` | fond du bouton proéminent | **à trancher** : `#0a7cff` (Halo) ou `#0066d6` | idem | voir mesures |
| `--destructive` | rouge système | `#d70a3c` (texte et fond) | `#ff6b85` (texte), `#ff375f` (pastille) | Halo `#ff375f` pour pastilles ; teintes texte [déduit] |
| `--success-text` / `--warning-text` | vert / orange | `#0a7a4f` / `#9a5b00` | `#16c784` / `#ff9f0a` | sombre = Halo ; clair [déduit] |

Contrastes **mesurés** (WCAG, seuil texte 4.5:1, gros/gras 3:1) :

| Paire | Ratio | Verdict |
|---|---|---|
| `--label` sur `--bg-cell` / `--bg-grouped` (clair) | 18.58 / 16.65 | ok |
| `--label-secondary` sur `--bg-grouped` (clair) | 5.14 | ok |
| `--label-secondary` sur `--fill-field` (clair) | 4.97 | ok |
| `--label-placeholder` `#646b78` sur `--fill-field` | 4.67 | ok |
| `--accent` `#0a63cc` sur `--bg-grouped` | 5.13 | ok |
| blanc sur `#0a7cff` (bouton Halo actuel) | **3.93** | échoue 4.5 ; passe 3:1 seulement si texte ≥ 18,66 px gras |
| blanc sur `#0066d6` | 5.42 | ok |
| `#ff375f` en texte sur blanc | **3.52** | échoue → `#d70a3c` (5.25) |
| `#16c784` en texte sur blanc | **2.20** | échoue → `#0a7a4f` (5.37) |
| `--label` sur `--bg-cell` (sombre) | 15.78 | ok |
| `--label-secondary` sur `--bg-cell` (sombre) | 7.00 | ok |
| `--label-placeholder` `#9aa3b2` sur `--fill-field` (sombre) | 5.19 | ok |
| `#ff375f` sur `--bg-cell` (sombre) | 4.95 | ok |
| `--fill-field` contre `--bg-cell` (non-texte, clair) | **1.15** | sous 3:1 (voir §5.1 et §14) |
| `--bg-cell` contre `--bg-grouped` (sombre) | 1.13 | séparation tonale faible, voulue (iOS) |

Règle : chiffre minimal 4.5:1, viser 7:1 pour le petit texte en couleurs
personnalisées. HIG `dark-mode` › Dark Mode colors ; `accessibility` › Vision
(tableau 4.5 / 3 / 3) **[lu]**.

### 2.3 Rayons

| Token | Valeur | Usage | Source |
|---|---|---|---|
| `--radius-section` | 16 px | section groupée, feuille (coins hauts) | Halo `--radius: 1rem` (nœud dashboard-ux) ; rayon iOS non publié **[déduit]** |
| `--radius-field` | 12 px | champ, sélecteur, segmented (piste) | **[déduit]** |
| `--radius-segment` | 9 px | segment actif dans une piste de 3 px de marge (12 − 3) | better-ui concentric radius **[lu]** |
| `--radius-button` | `9999px` (capsule) ; 12 px pour un bouton pleine largeur dans un formulaire | boutons | capsule : HIG `buttons` › visionOS (« prefer circular or capsule-shape ») **[lu]**, appliqué à iOS **[déduit]** |

Règle : rayon extérieur = rayon intérieur + marge, dès que deux surfaces
arrondies sont emboîtées à moins de 24 px. better-ui › surfaces **[lu]** ;
HIG `toolbars` › Best practices (rayons concentriques) **[lu]**.

### 2.4 Espacements

Base 4 px : 4 / 8 / 12 / 16 / 20 / 24 / 32 / 48.

| Mesure | Valeur | Source |
|---|---|---|
| Marge latérale de page, mobile | 16 px (+ `env(safe-area-inset-*)`) | better-layout « Inset buttons » **[lu]** ; HIG `layout` › Guides and safe areas **[lu]** |
| Marge latérale, desktop | 24–32 px | **[déduit]** |
| Espace entre sections groupées | 32 px ; en-tête de section collé à sa section (8 px) | ratio 2× better-layout **[lu]** ; valeurs **[déduit]** |
| Hauteur minimale de ligne | 44 px | HIG `accessibility` › Mobility (44×44 pt) **[lu]** |
| Retrait de séparateur | aligné sur le début du texte (après l'icône), pas sur le bord | HIG `layout` (alignement, indentation) **[lu]** ; mesure **[déduit]** |
| Autour d'un contrôle avec fond | ~12 px ; sans fond ~24 px | HIG `accessibility` › Mobility **[lu]** ; better-layout **[lu]** |

### 2.5 Typographie

Police : pile système, aucune police web —
`-apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, "Segoe UI", Roboto, sans-serif` ;
chiffres : `font-variant-numeric: tabular-nums` sur tout montant, compteur,
date. SF Pro est la police système iOS (HIG `typography` › iOS, iPadOS **[lu]**),
elle ne doit pas être embarquée (note développeur, `typography` **[lu]**) :
la pile la sert sur Apple, le repli ailleurs **[déduit]**. Une seule famille
(HIG « Minimize the number of typefaces » **[lu]**).

Échelle = styles iOS, taille « Large (default) », 1 pt = 1 px CSS **[déduit]** :

| Token | Taille / interligne | Graisse | Usage | Source |
|---|---|---|---|---|
| `large-title` | 34 / 41 | 700 | titre de page mobile (se replie au défilement) | HIG `typography` › Large (default) **[lu]** ; graisse = emphasized |
| `title-2` | 22 / 28 | 700 | titre de page desktop, titre de feuille plein écran | idem |
| `title-3` | 20 / 25 | 600 | chiffre clé d'une bande de stats | idem |
| `headline` | 17 / 22 | 600 | titre de ligne important, titre de barre | idem |
| `body` | 17 / 22 | 400 | texte de ligne, champ de saisie | idem |
| `callout` | 16 / 21 | 400 | texte secondaire long | idem |
| `subhead` | 15 / 20 | 400 | cellules de tableau desktop, sous-titre de ligne | idem ; usage tableau **[déduit]** |
| `footnote` | 13 / 18 | 400 | en-tête et pied de section, aide de champ | idem |
| `caption-1` | 12 / 16 | 400 | horodatage, métadonnée | idem |
| `caption-2` | 11 / 13 | 400 (500 pour libellé d'onglet) | libellé de barre d'onglets | idem |

Règles :

- **Plancher absolu 11 px.** HIG `typography` › Ensuring legibility (iOS
  minimum 11 pt) **[lu]**. Le libellé 10 px de la barre basse d'orya
  (`ui/bottom-bar.tsx:306-313`) n'est pas repris.
- Graisses Regular, Medium, Semibold, Bold ; jamais Ultralight/Thin/Light.
  HIG `typography` **[lu]** ; better-typography (≥ 400 sous 18 px) **[lu]**.
- Champs de saisie à 17 px (≥ 16 px : pas de zoom iOS Safari).
  better-typography « Inputs at 16px on mobile » **[lu]** ; la règle actuelle
  `globals.css:112-124` (16 px puis 14 px dès 768 px) reste compatible.
- Suivi (letter-spacing) : SF ajuste seul ; ne pas ajouter de tracking négatif
  manuel au-dessus de 20 px sauf police de repli. HIG `typography` › Tracking
  values (les valeurs existent, l'ajustement est automatique dans l'app) **[lu]**.
- Pas de majuscules espacées pour les en-têtes de section (motif orya « label
  uppercase 0.16em », `DESIGN.md` l.64-69) : en-tête en casse de phrase,
  `footnote`, `--label-secondary`. **[déduit]** — le HIG ne le spécifie pas.
- Interligne ≥ 1.4 dès 3 lignes. better-typography **[lu]** ; HIG
  `typography` (« avoid tight leading » à 3 lignes et plus) **[lu]**.
- `text-wrap: balance` sur les titres, `pretty` sur les descriptions.
  better-typography **[lu]**.
- Supporter l'agrandissement à 200 % sans troncature critique : les lignes
  s'étirent en hauteur, les éléments côte à côte passent en pile.
  HIG `typography` › Supporting Dynamic Type ; `accessibility` › Vision **[lu]**.

## 3. Navigation

| Règle | Source |
|---|---|
| **Mobile : barre d'onglets basse**, 5 onglets au plus, un mot par libellé, icône pleine pour l'actif. Onglets = navigation, jamais des actions. | HIG `tab-bars` › Best practices ; iPadOS (« five or fewer ») **[lu]** |
| La barre reste visible dans toutes les sections ; seule une feuille modale la recouvre. | HIG `tab-bars` **[lu]** |
| Ne pas désactiver un onglet dont le contenu est vide : il s'ouvre sur un état vide qui explique. | HIG `tab-bars` **[lu]** |
| Pastille (badge) rouge réservée à l'information critique (ex. retrait à approuver). | HIG `tab-bars` › badge **[lu]** |
| Pas d'onglet « Plus » qui cache des sections : au-delà de 5, la 5e entrée ouvre une liste groupée « Plus » assumée, ou la sidebar prend le relais. | HIG `tab-bars` « Avoid overflow tabs » **[lu]** ; solution **[déduit]** |
| **Desktop : sidebar** (même structure que les onglets, pas une autre carte du site), 2 niveaux au plus, icônes de même famille, couleur d'accent pour l'actif. Escamotable, jamais cachée par défaut. | HIG `sidebars` › Best practices ; `layout` › Size classes (« switch from a Tab bar to a Sidebar ») **[lu]** |
| La fonction ne change pas avec la largeur ; seule la quantité visible change. | HIG `layout` › Size classes **[lu]** |
| **Titre de page façon iOS** : grand titre (`large-title`) en tête de contenu sur mobile, qui se replie en titre de barre (`headline`) au défilement. Moins de 15 caractères, jamais le nom de l'app. | HIG `toolbars` › Titles ; iOS (« Use a large title ») **[lu]** |
| Barre du haut : à gauche Retour (chevron seul, sans le mot « Retour »), au centre le titre, à droite **une** action principale (style proéminent) et au besoin un menu « Plus » (`…`). Trois groupes au plus. | HIG `toolbars` › Navigation, Actions, Item groupings **[lu]** |
| Pas de fond plein derrière les barres : flou + **effet de bord de défilement** (dégradé/flou sous la barre seulement quand du contenu passe dessous). Le contenu s'étend sous la barre. | HIG `layout` › Differentiate controls ; `scroll-views` › Scroll edge effects **[lu]** ; transposition CSS (`backdrop-filter` + masque) **[déduit]** |
| Verre réservé au chrome (barre basse, barre du haut, sidebar) ; sous `prefers-reduced-transparency: reduce` → fond opaque `--bg-cell`. | HIG `materials` **[lu]** ; `dark-mode` (Reduce Transparency) **[lu]** ; requête CSS **[déduit]** |
| Recherche : champ en ligne au-dessus de la liste qu'il filtre, épinglé sous la barre au défilement ; recherche dès la frappe. | HIG `search-fields` › iOS, inline field ; Best practices **[lu]** |
| Changer de communauté = sélecteur dans la barre (menu), pas une page. | **[déduit]** (le périmètre reste celui de `dashboard-ux`) |

## 4. Listes groupées « inset grouped » (à la place des cartes)

Anatomie :

```
fond --bg-grouped
  En-tête de section        ← footnote, --label-secondary, marge 16 px, 8 px au-dessus de la section
  ┌───────────────────────┐ ← section : --bg-cell, --radius-section, marge latérale 16 px, aucune bordure, aucune ombre
  │ ◯ Titre        Valeur ›│ ← ligne ≥ 44 px : icône (option) · titre body · valeur --label-secondary · accessoire
  │───────────────────────│ ← séparateur 1 px --separator, retrait au début du texte, absent sous la dernière ligne
  │ ◯ Titre         [⏻]   │
  └───────────────────────┘
  Pied de section           ← footnote, --label-secondary : explication, conséquence d'un réglage
```

| Règle | Source |
|---|---|
| Le style groupé sépare par en-têtes, pieds et espace, pas par des bordures. | HIG `lists-and-tables` › Style **[lu]** |
| Fond de page groupé (primaire), section en secondaire, élément imbriqué en tertiaire. | HIG `color` › iOS, iPadOS **[lu]** |
| Chevron (›) seulement pour une ligne qui ouvre un détail ; bouton info (ⓘ) seulement pour révéler une information, jamais pour naviguer. | HIG `lists-and-tables` › iOS **[lu]** |
| Texte de ligne bref ; identifiants longs tronqués **au milieu** (début et fin visibles), valeur complète copiable dans le détail. | HIG `lists-and-tables` › Content ; `labels` (texte utile sélectionnable) **[lu]** ; better-typography (troncature récupérable) **[lu]** |
| Contenu de ligne : identité au début, métadonnée et action à la fin. | better-layout « Order by importance » **[lu]** |
| Sélection d'une option : coche à la fin de la ligne ; navigation : surbrillance persistante de la ligne choisie (desktop, vue scindée). | HIG `lists-and-tables` › Best practices ; `split-views` **[lu]** |
| Actions de ligne par balayage sur mobile **et** toujours un équivalent visible (menu `…` ou bouton dans le détail). | HIG `designing-for-ios` (swipe dans une ligne) ; `accessibility` › Mobility (« Offer alternatives to gestures ») ; `context-menus` (« Always make context menu items available in the main interface ») **[lu]** |
| Ligne destructive (« Révoquer l'appareil ») : texte `--destructive`, centrée ou au début, dans sa propre section en bas. | HIG `context-menus` (destructif en fin) ; `action-sheets` **[lu]** ; placement **[déduit]** |
| Faits clé/valeur d'un détail = lignes « Titre … Valeur » d'une section, pas une grille de cartes. | orya `AdminFacts` `admin-page.tsx:86-101` (grille `dl`, sans carte) **[lu]** ; forme iOS **[déduit]** |
| Indicateurs (KPI) : une bande de 2 à 4 chiffres (`title-3` + `footnote`), séparés par l'espace ou un filet vertical, **sans boîte**. | orya `AdminStats` `admin-page.tsx:103-133` (« no cards ») **[lu]** — sans la bordure arrondie qu'il garde l.111 |

## 5. Contrôles de saisie

### 5.1 Champ de texte « à la Apple »

- Deux présentations, et pas d'autre :
  1. **Dans une liste groupée** (formulaires de feuille, réglages) : la ligne
     est le champ. Libellé à gauche (`body`, `--label`), valeur saisie
     alignée à droite ou à la suite ; ou libellé au-dessus en `footnote` pour
     les valeurs longues. Pas de fond propre : la cellule est le fond.
  2. **Champ autonome** (connexion, recherche) : fond `--fill-field`,
     `--radius-field`, hauteur 44 px (50 px pour la connexion), aucun trait,
     libellé visible au-dessus en `footnote`.
  Forme visuelle **[déduit]** (le HIG ne dessine pas le champ iOS en texte).
- Placeholder = exemple ou format (« nom@exemple.com »), jamais le seul
  libellé. HIG `text-fields` › Best practices ; `writing` › Show hints **[lu]** ;
  better-writing ; better-accessibility (label obligatoire) **[lu]**.
- Bouton d'effacement (×) à la fin du champ dès qu'il contient du texte ;
  icône de rôle au début si utile. HIG `text-fields` › iOS **[lu]**.
- Mot de passe = champ sécurisé, jamais pré-rempli. HIG `text-fields`,
  `entering-data` **[lu]**.
- Bon clavier : `type`/`inputmode`/`autocomplete` adaptés (e-mail, numéro,
  code). HIG `text-fields` (keyboard type) **[lu]** ; better-accessibility
  › Label and type **[lu]**. Ne jamais bloquer le collage.
- Validation : e-mail au changement de champ ; identifiant et mot de passe
  avant de quitter le champ ; formulaire au moment de l'envoi, focus sur la
  première erreur. HIG `text-fields` › Validate ; better-accessibility ›
  Errors **[lu]**. (Le HIG `entering-data` recommande aussi de n'activer
  « Continuer » qu'une fois les champs requis remplis ; better-accessibility
  dit l'inverse. **Retenu : bouton actif, validation à l'envoi** —
  arbitrage [déduit], noté §14.)
- Erreur sous le champ, en `footnote` `--destructive`, qui dit comment
  corriger ; `aria-invalid` + `aria-describedby`. HIG `writing` › Write clear
  error messages **[lu]** ; better-accessibility **[lu]**.
- **Focus** : pas d'anneau de bureau épais. Au clavier (`:focus-visible`),
  anneau de 2 px `--accent` décalé de 2 px, rayon concentrique ; à la souris
  ou au toucher, le curseur suffit. HIG `focus-and-selection` (anneau pour
  champ texte, surbrillance pour ligne de liste) **[lu]** ; better-accessibility
  (≥ 2 px, `:focus-visible`) **[lu]**.
- Le fond de champ (`--fill-field`) ne contraste qu'à **1.15:1** avec la
  cellule (mesuré). Il n'est donc jamais le seul indice : libellé visible
  toujours présent, et en contraste renforcé (`prefers-contrast: more`) un
  trait 1 px `--label-secondary`. WCAG 1.4.11 **[déduit]** ; voir §14.

### 5.2 Tableau « besoin → contrôle Apple → composant shadcn »

| Besoin | Contrôle Apple | shadcn / base | Source HIG |
|---|---|---|---|
| Texte court | Text field | `Input` restylé (fond, sans bordure) dans `Field` | `text-fields` **[lu]** |
| Texte long | Text view | `Textarea` restylé | `text-fields` (« use a text view ») **[lu]** |
| Recherche / filtre de liste | Search field en ligne | `InputGroup` + `Input type="search"` | `search-fields` **[lu]** |
| Oui/non dans une ligne | Switch (seulement dans une ligne de liste) | `Switch` redimensionné (≈ 51×31) | `toggles` › iOS **[lu]** ; taille **[déduit]** |
| Oui/non hors liste (filtre actif) | Bouton bascule | `Toggle` | `toggles` › iOS **[lu]** |
| 2 à 5 vues proches, même écran | Segmented control | `ToggleGroup type="single"` habillé en piste | `segmented-controls` **[lu]** |
| 3 à ~10 options exclusives | Pop-up button (menu) | `Select` (Radix) ou `DropdownMenu` + coche | `pop-up-buttons` ; `pickers` (« short list → pull-down ») **[lu]** |
| Longue liste (pays, membres) | Liste avec recherche dans une feuille | `Sheet`/`Drawer` + `Command` | `pickers` (« very large set → list ») **[lu]** |
| Date | Date picker compact | `Popover` + `Calendar` (desktop), `Drawer` (mobile) | `pickers` › iOS **[lu]** ; mapping **[déduit]** |
| Actions liées à un bouton | Pull-down button | `DropdownMenu` | `pull-down-buttons` (≥ 3 éléments) **[lu]** |
| Actions sur un élément | Context menu + équivalent visible | `DropdownMenu` (bouton `…`) ; `ContextMenu` en plus sur desktop | `context-menus` **[lu]** |
| Choix lié à une action volontaire | Action sheet | `Drawer` (mobile) / `DropdownMenu` (desktop) | `action-sheets` **[lu]** |
| Confirmer un irréversible | Alert | `AlertDialog` | `alerts` **[lu]** |
| Tâche ciblée (créer, modifier) | Sheet | `Sheet side="right"` desktop / `Drawer` mobile | `sheets` **[lu]** |
| Notification non bloquante | (statut intégré) | Sonner, `role="status"` | `feedback` (statut intégré) **[lu]** ; better-accessibility **[lu]** |

### 5.3 Segmented control

- 5 segments au plus sur mobile, largeurs égales, texte **ou** icônes jamais
  mélangés, noms (« Actifs », « Expirés »), pas de texte d'introduction.
  HIG `segmented-controls` **[lu]**.
- Pour basculer entre sous-vues proches ; pour des sections différentes →
  onglets. HIG `segmented-controls` › iOS **[lu]**.
- Visuel : piste `--fill-field`, segment actif `--bg-cell` (sombre :
  `--bg-cell-elevated`), **sans ombre** — la séparation se fait par le
  contraste de fond et la graisse 600 du libellé actif. **[déduit]** (iOS
  utilise une ombre légère sous le segment : écartée par la règle utilisateur).

### 5.4 Switch

- Seulement dans une ligne de liste ; le libellé de ligne décrit l'état
  **activé** (« Envoyer les alertes », pas « Ne pas envoyer »). HIG
  `toggles` › iOS ; `writing` › settings labels ; better-writing **[lu]**.
- Couleur activée : vert par défaut acceptable, ou l'accent ; l'état ne passe
  pas que par la couleur (position du bouton + libellé). HIG `toggles` **[lu]**.
- Zone cliquable = toute la ligne (44 px). better-accessibility (label et
  contrôle = une cible) **[lu]**. Le switch actuel d'orya fait 18,4 × 32 px
  (`ui/switch.tsx:18`) : trop petit, non repris.

### 5.5 Boutons

| Variante | Rôle | Visuel | Source |
|---|---|---|---|
| `prominent` | action principale, 1 (2 au plus) par vue, à la fin de la barre | fond `--accent-solid`, texte blanc 600, capsule | HIG `buttons` › Style ; `toolbars` (`.prominent`, côté fin) **[lu]** |
| `tinted` | action secondaire visible | fond `--fill-field`, texte `--accent` | **[déduit]** |
| `plain` | action tertiaire, barre d'outils | texte `--accent`, sans fond | HIG `toolbars` (« symbols without borders ») **[lu]** |
| `destructive` | supprimer, révoquer | texte `--destructive` (plain) ou fond `--destructive` dans une alerte | HIG `buttons` › Role **[lu]** |

- Hauteur 44 px (50 px pour l'action pleine largeur d'un formulaire),
  cible ≥ 44×44 même pour un bouton icône (zone étendue par pseudo-élément si
  le visuel est plus petit). HIG `buttons` ; `accessibility` › Mobility **[lu]** ;
  better-accessibility › Minimum hit area **[lu]**.
- Distinguer le choix préféré par le **style**, pas par la taille. HIG
  `buttons` › Style **[lu]**.
- Jamais le rôle principal sur une action destructive. HIG `buttons` › Role **[lu]**.
- Action asynchrone : indicateur d'activité **dans** le bouton, libellé au
  présent continu (« Enregistrement… »), bouton désactivé pendant la requête.
  HIG `buttons` › iOS, iPadOS **[lu]** ; better-accessibility (désactiver à
  l'envoi) **[lu]**.
- État pressé obligatoire : `scale(0.96)` + baisse d'opacité, 150 ms max.
  HIG `buttons` (« Always include a press state ») **[lu]** ; better-ui (0.96) **[lu]**.
- Libellé = verbe, casse de phrase, sans ponctuation finale : « Créer le
  forfait », « Révoquer ». HIG `writing` › Be action oriented **[lu]** ;
  better-writing › Verb-first, capitalization **[lu]**. (Le HIG anglais
  préconise la casse de titre pour certains éléments ; en français la casse
  de phrase est la norme — **[déduit]**.)

## 6. Tableaux

- **Mobile** : pas de tableau. Chaque enregistrement = une ligne de liste
  groupée (titre + 1 valeur + statut + chevron) ; le reste dans le détail
  (feuille). HIG `lists-and-tables` › Content (« list item titles only… detail
  view ») ; `split-views` › iOS (pas de panneaux multiples en compact) **[lu]**.
- **Desktop** : tableau sobre — pas de bordure extérieure ni de cadre
  arrondi, pas de lignes verticales, filet horizontal `--separator` entre
  lignes, en-têtes `footnote` 600 `--label-secondary` en casse de phrase,
  cellules `subhead`, ligne ≥ 44 px, survol `--fill-field` (sous
  `@media (hover: hover)`), nombres alignés à la fin en chiffres tabulaires,
  texte au début. HIG `lists-and-tables` › Content (en-têtes = noms courts) ;
  macOS (tri au clic sur l'en-tête) **[lu]** ; better-layout (nombres à la
  fin) **[lu]** ; better-typography (tabular-nums) **[lu]** ; rendu **[déduit]**.
  Le `AdminTable` d'orya garde `rounded-xl border` (`admin-table.tsx:80`) :
  non repris.
- Tri : clic sur l'en-tête, second clic inverse. HIG `lists-and-tables` › macOS **[lu]**.
- Sélection d'une ligne → détail en **panneau latéral** (desktop large) ou
  feuille (mobile) ; la ligne choisie reste surlignée. HIG `split-views` ›
  Best practices **[lu]** ; orya `DetailFrame` `admin-detail-frame.tsx:9-13`
  (panneau fixe à droite, sans superposition) **[lu]**.
- Pagination : chargement continu par sentinelle + mention de fin (« 128
  appareils ») plutôt que des boutons de page. orya `admin-table.tsx:16-22,
  91-127` **[lu]** ; adoption **[déduit]**.
- Une seule zone de défilement par vue ; pas de défilement imbriqué dans le
  même sens. HIG `scroll-views` › Best practices **[lu]** ; orya-frontend-platform
  (« Nested scroller per card » rejeté) **[lu]**.
- Un graphique seulement s'il dit quelque chose ; sinon une liste. Une phrase
  de synthèse au-dessus. HIG `charting-data` **[lu]**.

## 7. Feuilles et alertes

| Règle | Source |
|---|---|
| **Page** si l'opérateur y revient ; **feuille** pour inspecter ou modifier une ligne ; **alerte** pour l'irréversible. Rien de visible uniquement dans une feuille. | orya-console-ui SKILL.md **[lu]** ; HIG `modality` **[lu]** |
| Une seule feuille à la fois ; pas de feuille qui ouvre une feuille. | HIG `sheets` › Best practices ; `modality` **[lu]** |
| En-tête de feuille : « Annuler » au début, action de validation (« Enregistrer », style proéminent) à la fin, titre qui nomme la tâche au centre. Jamais Annuler + Terminé + Retour ensemble. | HIG `sheets` › iOS (mis à jour 24 mars 2026) ; Best practices **[lu]** |
| Mobile : feuille par le bas (`Drawer`), poignée visible, cran moyen pour le contenu court, plein pour les formulaires ; balayage vers le bas pour fermer, et confirmation (action sheet « Abandonner les modifications ») s'il y a des modifications. | HIG `sheets` › iOS (detents, grabber, swipe) **[lu]** |
| Desktop : feuille latérale droite ou panneau ; pas de popover en largeur compacte. | HIG `popovers` › iOS ; `sheets` › iPadOS **[lu]** |
| Tâche longue ou à plusieurs étapes → page dédiée, pas une feuille. | HIG `sheets` (« For complex or prolonged user flows… ») ; orya PRODUCT.md (réglages financiers sur pages dédiées) **[lu]** |
| Alerte : rare ; seulement pour une action destructive **peu courante et non annulable** (révoquer un accès, supprimer une communauté). Pas d'alerte pour une action annulable ni au démarrage. | HIG `alerts` › Best practices ; `feedback` **[lu]** |
| Titre d'alerte qui décrit la situation (≤ 2 lignes), message seulement s'il ajoute ; boutons de 1–2 mots, verbe qui reprend la conséquence (« Révoquer »), toujours « Annuler », bouton destructif en rouge ; Annuler n'est pas le bouton par défaut. | HIG `alerts` › Content, Buttons **[lu]** ; better-writing **[lu]** |
| L'alerte reste ouverte pendant l'action asynchrone (bouton en attente, Annuler désactivé). | orya-frontend-platform (`ConfirmAction` reste ouvert) **[lu]** |
| Motif de l'action exigé (audit) → champ texte dans l'alerte. | HIG `alerts` (« include a text field only if… ») **[lu]** ; orya `inline-confirm.tsx:67-73` (motif ≥ 5 caractères) **[lu]** |

## 8. États

| État | Règle | Source |
|---|---|---|
| Chargement | Montrer la structure tout de suite : squelettes à la géométrie exacte de la zone (lignes de liste grises, pas une carte). Le chrome (barres, titre, filtres) ne disparaît jamais. Indicateur déterminé si la durée est connue. Pas de texte vague « Chargement… ». | HIG `loading` ; `progress-indicators` **[lu]** ; orya `AdminDataBoundary` `admin-data-boundary.tsx:48-59` (chrome hors Suspense) **[lu]** ; orya-frontend-platform › Loading selector **[lu]** |
| Rafraîchissement | Mise à jour automatique périodique ; tirer-pour-actualiser sur mobile en plus ; « Mis à jour il y a 2 min » discret. | HIG `progress-indicators` › Refresh content controls **[lu]** |
| Vide | Dit ce qu'est l'endroit, comment le remplir, **un** bouton d'action. Vide filtré ≠ premier usage : « Aucun résultat pour “xyz” » + « Effacer les filtres ». | HIG `writing` › blank screens **[lu]** ; better-writing › Empty states **[lu]** ; orya-frontend-platform (`collectionEmptyCopy`) **[lu]** |
| Erreur | Au plus près du problème, sans reproche, sans « oups », avec le remède (« Impossible de charger les appareils. Vérifiez la connexion et réessayez. » + « Réessayer »). Pas de « nous ». Données en cache conservées si possible. | HIG `writing` › error messages ; `alerts` (pas d'alerte au démarrage, étiquette discrète) **[lu]** ; better-writing **[lu]** |
| Accès refusé | Écran d'état sobre, titre + une phrase, sans bouton trompeur ; la section n'apparaît pas dans la navigation si le rôle ne l'a jamais. | orya `AdminForbidden` `admin-forbidden.tsx:5-17` **[lu]** ; masquage par rôle : périmètre D78/D80 inchangé, interprétation de HIG `tab-bars` « don't hide » **[déduit]** |
| Succès | Pas de confirmation pour l'attendu ; confirmation pour l'important (paiement validé). Toast non bloquant ; un toast qui porte une action ou une erreur reste jusqu'à fermeture. | HIG `feedback` **[lu]** ; better-accessibility › Honor prefers-reduced-motion (toasts) **[lu]** |

## 9. Accessibilité

| Règle | Source |
|---|---|
| Cible 44×44 px (minimum absolu 28×28) ; zones étendues sans chevauchement. | HIG `accessibility` › Mobility **[lu]** ; better-accessibility (24 px WCAG, 44 px tactile) **[lu]** |
| Contraste 4.5:1 jusqu'à 17 px, 3:1 à partir de 18 px ou en gras ; vérifié en clair **et** sombre. | HIG `accessibility` › Vision **[lu]** |
| Jamais la couleur seule : statut = pastille + libellé ; erreur = icône + texte. | HIG `accessibility`, `color` › Inclusive color **[lu]** ; orya `StatusBadge` (point + libellé i18n) `status-badge.tsx:30-44` **[lu]** |
| Focus visible au clavier sur tout élément interactif (`:focus-visible`, 2 px), surbrillance de ligne dans les listes. | HIG `focus-and-selection` **[lu]** ; better-accessibility **[lu]** |
| `prefers-reduced-motion` : glissements et zooms remplacés par des fondus, ressorts sans rebond ; interrupteur global conservé (`globals.css:127-134`). | HIG `accessibility` › Cognitive (liste des réductions) **[lu]** ; orya `globals.css:272-284` **[lu]** |
| Toute icône seule a un nom accessible ; mais **pas d'icône seule dans la navigation** (onglets et sidebar ont un libellé visible). | HIG `tab-bars` (« Include tab labels ») ; `icons` (texte alternatif) **[lu]** ; better-accessibility **[lu]** |
| Un `h1` par page (le grand titre), titres de section en niveaux suivants, un `main`, lien « Aller au contenu ». | HIG `voiceover` › Navigation **[lu]** ; better-accessibility › Structure **[lu]** |
| Gestes toujours doublés d'un contrôle visible (balayage → menu `…`). | HIG `accessibility` › Mobility **[lu]** |
| Pas d'élément qui se ferme seul sur minuterie s'il porte une décision. | HIG `accessibility` › Cognitive (« Minimize use of time-boxed ») **[lu]** |
| Zoom 200 % et largeur 320 px sans défilement horizontal. | better-accessibility › Survive zoom **[lu]** |
| Graphiques : description textuelle + libellés accessibles. | HIG `charting-data`, `voiceover` **[lu]** |

## 10. Mouvement

| Règle | Source |
|---|---|
| Mouvement utile seulement ; aucun sur les interactions fréquentes au-delà du retour immédiat (≤ 150 ms, opacité/couleur). | HIG `motion` › Best practices, Providing feedback **[lu]** ; better-ui › Motion restraint **[lu]** |
| Interruptible : transitions CSS pour les états, jamais d'attente forcée. | HIG `motion` (« Let people cancel motion ») **[lu]** ; better-ui › Interruptible **[lu]** |
| Le mouvement suit le geste : une feuille venue du bas repart vers le bas. | HIG `motion` › Providing feedback **[lu]** |
| Valeurs exactes : appui `scale(0.96)` ; ressort d'icône `duration 0.3, bounce 0` ; sortie `ease-out` avec petit `translateY` ; transitions de propriétés nommées (jamais `all`). Courbe d'entrée de feuille Halo `280ms cubic-bezier(.22,.9,.24,1)` conservée. | better-ui **[lu]** ; orya AGENTS.md §7 **[lu]** ; Halo : nœud `dashboard-ux` |
| Le changement d'état laisse toujours un indice statique (couleur, icône, libellé). | better-ui ; HIG `motion` (« Make motion optional ») **[lu]** |

## 11. Interdits explicites

1. **Ombres** : aucune `box-shadow`, `drop-shadow`, `shadow-*`, élévation, halo
   lumineux, y compris dans les primitives shadcn (aujourd'hui `shadow` apparaît
   dans 18 fichiers de `apps/dashboard/src/components/ui/`, compté le
   2026-10-24). Demande utilisateur. La règle better-ui « shadow-as-border »
   (`surfaces.md` › Shadows instead of borders) est **écartée** ; on garde sa
   moitié « borders for structure » (séparateurs). Les variantes `action`/`brand`
   d'orya (`button-variants.ts:43-48`) et ses `--depth-1/2`
   (`globals.css:167-169`) ne sont pas reprises.
2. **Cartes décoratives** : pas de `Card` autour d'un bloc de texte, d'une
   liste, d'un formulaire ou d'un KPI. Pas de carte dans une carte. Pas de
   bordure en pointillés autour d'un état vide (motif orya
   `admin-table.tsx:61`, `admin-data-boundary.tsx:11`).
3. **Champs à bordure lourde** : pas de trait 1 px gris autour des champs, pas
   d'anneau de focus de 3 px semi-transparent (motif shadcn par défaut et orya
   `ui/input.tsx:11`, `admin-toolbar.tsx:54`).
4. **Contrôles < 44 px** de haut sur mobile (orya : `h-8` = 32 px dans
   `ui/input.tsx:11`, `button-variants.ts:65`).
5. **Icônes sans libellé** dans la navigation, et icônes de familles mêlées.
   HIG `tab-bars`, `icons` › consistency **[lu]**.
6. **Texte < 11 px**, graisses fines, majuscules espacées pour les titres.
7. **Verre dans le contenu** (cartes, lignes, formulaires en flou).
   HIG `materials` **[lu]**.
8. Plusieurs boutons proéminents dans une vue ; couleur d'accent sur du texte
   non cliquable ; vert/orange en texte sur fond clair (contraste mesuré 2.20
   pour `#16c784`).
9. Alerte pour une action annulable ; popover en largeur compacte ; feuille
   empilée sur une feuille.
10. HTML brut pour un contrôle qui existe dans le kit (orya l'interdit aussi,
    orya-console-ui ; et le viole lui-même dans `admin-toolbar.tsx:49`).
11. Texte d'interface en anglais, « nous », « oups », points d'exclamation.

## 12. Kit de composants (`apps/dashboard/src/components/common/`)

Règle d'or : **les pages n'importent que `components/common/` (et
`components/shell/`)**. `components/ui/` (shadcn) est une couche interne que
seul le kit touche. Aucune page ne recrée une liste, un champ, une feuille,
un état. Une primitive entre dans le kit seulement avec deux usages réels.
Source du motif : orya-frontend-platform › Toolkit public API, Creating a new
primitive, Enforcement (`no-restricted-imports`) **[lu]** ; application au
projet **[déduit]**. Proposition d'outillage : règle ESLint
`no-restricted-imports` interdisant `@/components/ui/*` hors de
`components/common` et `components/shell`.

| Primitive (nom proposé) | Rôle | Remplace (existant) | Base shadcn |
|---|---|---|---|
| `PageHeader` | grand titre iOS + barre repliée au défilement, action principale à la fin, menu `…` | `common/page-title.tsx` | — |
| `SectionHeader` / `SectionFooter` | en-tête et pied de section groupée (footnote, casse de phrase) | titres `h2` ad hoc | — |
| `GroupedList` + `GroupedSection` | fond groupé, sections arrondies sans bordure ni ombre | tout usage de `Card`, `home/welcome-card.tsx` | `ItemGroup` |
| `ListRow` (variantes `navigation`, `value`, `switch`, `action`, `destructive`, `checkmark`) | ligne ≥ 44 px, séparateur en retrait, accessoire de fin | lignes faites main dans `*-columns.tsx`, `home/attention-*.tsx` | `Item` |
| `DataList` | une source, deux rendus : liste groupée en compact, tableau sobre en large ; tri, sélection, chargement continu | `common/data-table.tsx` | `Table` + TanStack |
| `StatStrip` | 2–4 chiffres clés sans boîte | KPI en cartes | — |
| `TextFieldRow` / `TextField` | champ Apple dans une liste / autonome, libellé, aide, erreur, bouton d'effacement | champs `Input` bruts des formulaires | `Field`, `Input` |
| `SecureField` | mot de passe, sans pré-remplissage | `auth/login-form.tsx` (champ mot de passe) | `Input type=password` |
| `SearchField` | recherche en ligne, épinglable, recherche dès la frappe (300 ms) | `common/search-box.tsx` | `InputGroup` |
| `SelectRow` | pop-up de choix exclusif dans une ligne (valeur à la fin + menu) | `Select` bruts, `*-filters.tsx` | `Select` / `DropdownMenu` |
| `PickerSheet` | longue liste filtrable dans une feuille | — | `Drawer`/`Sheet` + `Command` |
| `SegmentedControl` | 2–5 segments égaux, sans ombre | `common/chip-filter.tsx` | `ToggleGroup` |
| `SwitchRow` | switch dans une ligne, toute la ligne cliquable | `Switch` isolés | `Switch` |
| `Button` (variantes `prominent`, `tinted`, `plain`, `destructive` ; tailles 44/50 ; `loading`) | toutes les actions | `ui/button.tsx` utilisé directement | `Button` |
| `NavBarButton` | bouton de barre (Retour chevron, `…`, icône ≥ 44 px avec nom accessible) | boutons icône ad hoc | `Button` |
| `AppSheet` | feuille : Annuler / titre / action ; bas en mobile, droite en desktop ; garde des modifications | `communities/create-community-sheet.tsx`, `members/add-member-sheet.tsx`, `plans/plan-sheet.tsx` (structure) | `Sheet`, `Drawer` |
| `ConfirmAlert` | irréversible : titre, message court, Annuler + verbe destructif, motif optionnel, reste ouvert pendant l'action | `common/confirm-dialog.tsx`, `devices/revoke-device-button.tsx`, `payouts/approve-payout-button.tsx` (confirmation) | `AlertDialog` |
| `ActionMenu` | actions d'un élément (bouton `…`) et action sheet en mobile | `members/member-actions.tsx` | `DropdownMenu`, `Drawer` |
| `EmptyState` | vide premier usage / vide filtré, un bouton | `common/empty-block.tsx` | `Empty` |
| `ErrorState` | erreur + remède + Réessayer | `common/error-state.tsx` | `Empty` |
| `ForbiddenState` | accès refusé | — | `Empty` |
| `ListSkeleton` / `RowSkeleton` | squelettes à la géométrie des lignes | `common/skeletons.tsx` | `Skeleton` |
| `StatusBadge` | point + libellé, couleur par sens, pas de couleur seule | `common/status-badge.tsx` (garder, aligner) | `Badge` |
| `UpdatedAt` | « Mis à jour il y a… » discret | `common/updated-at.tsx` (garder) | — |
| `Toast` (Sonner configuré) | retour non bloquant, `role="status"` | appels Sonner dispersés | `sonner` |
| Chrome (`components/shell/`) : `TabBar`, `Sidebar`, `CommunitySwitcher`, `UserMenu` | navigation ; verre seulement ici | `shell/bottom-bar.tsx`, `shell/app-sidebar.tsx` (à aligner) | `Sidebar` |

Conformité visuelle du kit (une fois, dans le kit) : retirer toute classe
`shadow*` des primitives `ui/` utilisées ; remplacer bordures d'`Input`,
`Select`, `Textarea` par `--fill-field` ; tailles 44 px ; anneau
`:focus-visible` 2 px. Les pages ne surchargent pas ces classes.

## 13. Ce qui vient d'où

- **HIG** : principes, couleurs par rôle (fonds groupés, base/élevé, labels),
  échelle typographique et planchers, cibles 44 pt, contrastes, barres et
  titres, listes groupées, feuilles, alertes, contrôles, états, mouvement.
- **orya-stack** (`C:\Users\HP\stack\saas\orya-stack`) — repris :
  - sections sans carte : `src/components/admin/kit/admin-page.tsx:58`,
    `AdminFacts` (l.86-101), `AdminStats` sans cartes (l.103-133) ;
  - chrome qui ne suspend jamais, squelettes locaux :
    `admin-data-boundary.tsx:48-59` ;
  - accès refusé dédié : `admin-forbidden.tsx` ;
  - vocabulaire de statut unique, point + libellé : `status-badge.tsx:30-44` ;
  - panneau de détail fixe au lieu d'une superposition :
    `admin-detail-frame.tsx:9-13` ;
  - tableau unique à chargement continu : `admin-table.tsx:16-22` ;
  - interrupteur global de mouvement réduit : `app/[locale]/globals.css:272-284` ;
  - barre basse : zone sûre, icône active pleine, libellés, mouvement réduit :
    `ui/bottom-bar.tsx:162-173` ;
  - doctrine page / feuille / dialogue / alerte : skill `orya-console-ui` ;
  - kit public réutilisé et interdit d'imports : skill
    `orya-frontend-platform` (copie canonique
    `C:\Users\HP\stack\orya-platform\.ai\skills\orya-frontend-platform\SKILL.md`) ;
  - « tonal first, shadow second », « grouped rows… never as individual
    bordered cards » : `DESIGN.md` l.208, l.212.
  - **Non repris** : contrôles 32 px (`ui/input.tsx:11`,
    `button-variants.ts:65`), switch 18×32 (`ui/switch.tsx:18`), libellés
    10 px (`ui/bottom-bar.tsx:312`), ombres et halos
    (`button-variants.ts:43-48`, `globals.css:167-169`, « CTA glow »
    `DESIGN.md` l.216), cadres arrondis autour des tableaux et des états vides
    (`admin-table.tsx:61,80`), majuscules espacées (`DESIGN.md` l.64-69),
    réfraction SVG de la barre basse (`ui/bottom-bar.tsx:10-94`, coûteuse et
    limitée à Chromium : hors sujet pour un back-office).
- **Skills better-*** : better-layout (groupage 2×, marges 16 px, ordre par
  importance, cibles 12/24 px), better-typography (planchers, 16 px en
  champ, interlignes, tabular-nums, `balance`/`pretty`), better-colors
  (tokens par rôle, une couleur = un sens, mesurer la paire rendue),
  better-ui (rayons concentriques, 0.96, ressort sans rebond, transitions
  nommées), better-accessibility (focus 2 px, labels, erreurs annoncées,
  zoom 200 %), better-writing (verbes, casse de phrase, erreurs qui
  réparent, vides qui orientent), better-interface (ordre de revue
  accessibilité → layout → écriture → typo → couleurs → UI ; déclencheurs
  HIGH). better-accessibility et better-writing sont absents du dossier
  d'orya-stack ; lus dans `C:\Users\HP\.claude\skills\`.

## 14. Questions ouvertes (à trancher par l'orchestrateur)

1. **Couleur du bouton proéminent** : `#0a7cff` (Halo, texte blanc 3.93:1,
   mesuré) échoue WCAG AA pour un libellé de 17 px semibold. Options :
   `#0066d6` (5.42:1), ou garder `#0a7cff` avec libellé ≥ 18,66 px gras.
   C'est une couleur de marque : décision hors périmètre de ce sous-agent.
2. **Fond de champ à 1.15:1** contre la cellule : fidèle à iOS, faible pour
   WCAG 1.4.11. Proposé : libellé visible obligatoire + trait en contraste
   renforcé. À valider sur rendu réel.
3. **Gris clairs** (`#f2f2f7`, `#efeff0`, séparateur 18 %) : valeurs
   [déduit], non lues chez Apple (le HIG les donne en image). À mesurer dans
   Apple Design Resources ou laisser comme choix projet.
4. **« iOS 28 »** : inexistant au 2026-10-24 ; règles alignées sur iOS 27 /
   Liquid Glass. Si l'utilisateur pense à une maquette précise, la demander.
5. **Validation des formulaires** : HIG `entering-data` (bouton actif une fois
   les champs requis remplis) contre better-accessibility (bouton toujours
   actif). Retenu ici : toujours actif. À confirmer.
6. **Masquage par rôle dans la navigation** contre HIG « ne pas cacher un
   onglet » : interprété comme « ne pas cacher temporairement » ; une section
   qu'un rôle n'a jamais n'apparaît pas.
7. **Sélecteur d'apparence** : HIG déconseille un réglage propre à l'app ; le
   dashboard actuel a-t-il un sélecteur ? Si oui, le limiter à
   « Système / Clair / Sombre » ou le retirer.

## 15. Non lu

- HIG : ~120 pages téléchargées non lues en détail (watchOS, tvOS, visionOS,
  CarPlay, jeux, Wallet, Apple Pay, HealthKit, widgets, Live Activities,
  App Clips, AR, machine learning, SF Symbols, app icons, keyboards,
  pointing devices, sliders, steppers, privacy, inclusion, right-to-left,
  designing-for-iphone-duo, etc.). La page « What's new » : 404.
- Valeurs visuelles iOS (hex des couleurs, rayons, hauteurs de contrôles) :
  absentes du texte HIG.
- `aura_stack` : **non analysé** (correction de l'utilisateur : la référence
  est orya-stack).
- Rien n'a été rendu dans un navigateur ; aucun contraste n'a été mesuré sur
  pixels réels.
