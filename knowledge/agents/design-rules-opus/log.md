# Journal — design-rules-opus

## 2026-10-24T03:16:55Z · Création
- fait: charte créée
- portée: Établir les règles de design du dashboard admin (Apple HIG, iOS récent, sans ombres, listes groupées, inputs Apple) à partir du HIG, d'aura_stack et des skills better-*. Propose notes/design-rules.md, n'intègre pas.
- etat: actif
- suite: lecture des nœuds liés

## 2026-10-24T03:16:55Z · Démarrage

- fait: Charte, journal et notes créés ; contexte et report lus
- etat: ok
- suite: Lire le HIG Apple

## 2026-10-24T03:19:32Z · HIG téléchargé

- fait: Index JSON HIG (developer.apple.com/tutorials/data/design/human-interface-guidelines.json) parcouru récursivement : 174 pages converties en texte dans le scratchpad, 1 échec (whats-new 404). Correction coordinateur reçue : référence UI = orya-stack, pas aura_stack.
- etat: ok
- suite: Lire les pages HIG utiles en entier, puis orya-stack

## 2026-10-24T03:20:18Z · HIG fondations lues

- fait: Lu en entier : design-principles (06/2026), designing-for-ios/ipados, layout (09/2026), color (12/2025), dark-mode, typography (tailles Dynamic Type), materials (Liquid Glass), motion, accessibility, writing. Version la plus récente documentée : iOS 27 (wallet.md change log 08/06/2026) ; aucune mention d'iOS 28. Valeurs hex des couleurs système absentes du texte (rendues en image).
- etat: ok
- suite: Lire composants HIG (listes, barres, feuilles, contrôles)

## 2026-10-24T03:21:07Z · HIG composants lus

- fait: Lu en entier : lists-and-tables, sidebars, tab-bars, toolbars, split-views, scroll-views, sheets, alerts, action-sheets, popovers, modality, buttons, text-fields, toggles, segmented-controls, pickers, pop-up/pull-down buttons, menus, context-menus, search-fields, progress-indicators, loading, feedback, entering-data, settings, managing-accounts, onboarding, labels, disclosure-controls, icons, launching, focus-and-selection, charting-data, voiceover. Les ~120 autres pages (watchOS, visionOS, tvOS, jeux, Wallet, HealthKit...) téléchargées mais non lues en détail.
- etat: ok
- suite: Analyser orya-stack (correction coordinateur)

## 2026-10-24T03:24:02Z · orya-stack analysé

- fait: Lu DESIGN.md, PRODUCT.md, AGENTS.md (§7 design), CLAUDE.md, components.json (shadcn base-nova, lucide), skills orya-frontend-platform (canon orya-platform) et orya-console-ui, admin/kit (admin-page, admin-table, admin-toolbar, detail-frame, forbidden, data-boundary, status-badge, inline-confirm), common (global-sheet, global-dialog, global-empty-state), ui (input, item, bottom-bar, switch, button-variants, card, empty), globals.css. Constat : 0 <Card> dans admin/views ; contrôles h-8 (32px) < 44pt HIG ; input brut dans admin-toolbar.tsx:49 malgré la règle ; ombres depth-1/2 et variants action/brand ombrés.
- etat: ok
- suite: Lire les skills better-*

## 2026-10-24T03:26:25Z · Skills better-* lus, contrastes mesurés

- fait: Lu better-ui (+surfaces.md), better-layout (+grouping, spacing), better-typography, better-colors, better-interface (orya-stack/.agents/skills), better-accessibility et better-writing (~/.claude/skills, absents d'orya). Conflit : better-ui préconise ombre-comme-bordure, refusé par l'utilisateur. Contrastes WCAG calculés (script node, scratchpad) : blanc sur #0a7cff = 3.93 (échec 4.5) ; #0066d6 = 5.42 ; #ff375f texte = 3.52 ; #5b6779 sur fond groupé = 5.14 ; fond de champ vs cellule = 1.15. Dashboard actuel : shadow dans 18 primitives ui/, tokens Halo v2.
- etat: ok
- suite: Rédiger notes/design-rules.md

## 2026-10-24T03:30:41Z · Nœud proposé rédigé

- fait: notes/design-rules.md écrit : principes, tokens clair/sombre avec contrastes mesurés, rayons, espacements, échelle typo iOS Large, navigation, listes inset grouped, contrôles + tableau besoin/Apple/shadcn, tableaux, feuilles/alertes, états, accessibilité, mouvement, interdits, kit components/common (27 primitives, ce qu'elles remplacent), sources, 7 questions ouvertes, non-lu. Vérifié dans le code : welcome-card.tsx utilise Card, login-form.tsx a le champ mot de passe.
- etat: ok
- suite: CLÔTURE

## 2026-10-24T03:30:42Z · CLÔTURE

- fait: Livrable : knowledge/agents/design-rules-opus/notes/design-rules.md (cible proposée 30-clients/design-rules.md, statut assumption). Vérifié : sections HIG lues dans le JSON officiel (174 pages récupérées, ~55 lues en entier), fichiers orya cités avec lignes, contrastes calculés. Non vérifié : aucun rendu navigateur ; gris clairs, rayons, hauteurs iOS = déduits ; iOS 28 inexistant (dernier documenté iOS 27). aura_stack non analysé (correction utilisateur).
- etat: ok
- suite: Orchestrateur : trancher couleur du bouton proéminent (#0a7cff 3.93:1), fond de champ 1.15:1, validation formulaire, masquage par rôle ; intégrer le nœud

## 2026-10-24T03:35:58Z · Nouvelle mission : base + accueil

- fait: Brief reçu : nettoyer apps/dashboard, kit components/common, shell, tableau complet, page d'accueil, spec dashboard-kit pour Sonnet ; D83 appliquée.
- etat: ok
- suite: Lire D83, dashboard-architecture, état du code

## 2026-10-24T03:43:35Z · Base nettoyée

- fait: globals.css réécrit (fond groupé, cellule, remplissage, labels, #0066d6 D83, échelle iOS text-*, rounded-field, utilitaire shadow-hairline, contraste renforcé, transparence réduite). Ombres portées retirées de 18 primitives ui/ (md/lg -> shadow-hairline sur surfaces flottantes ; xs/sm supprimées). lib/utils.ts : cn configuré (cn/config) car le cn par défaut prenait text-body pour une couleur (testé) ; ui/ importe désormais @/lib/utils.
- etat: ok
- suite: Écrire le kit components/common

## 2026-10-24T07:23:39Z · Kit et shell écrits (reprise)

- fait: Reprise après limite : état relu, tsc sans erreur. Écrits : 24 fichiers components/common (button, nav-bar-button, grouped-list, list-row, stat-strip, states, data-boundary(catchError), status-badge, updated-at, text-field(TextField/SecureField/TextFieldRow), search-field, segmented-control, switch-row, select-field(SelectField/SelectRow/SelectChip), picker-sheet, app-sheet, confirm-alert, action-menu, page-chrome, page-header, page-layout(PageBody/SplitView), detail-panel(DetailPanel/DetailFacts), data-table, toast) ; hooks use-media-query, use-local-preference ; server/query/table.ts (defineTable, applyTableQuery) ; shell (sidebar 2 niveaux, barre basse verre, top-bar à titre replié, sélecteur de communauté mobile, menu compte avec apparence) ; layout. Anciennes primitives déplacées dans components/_legacy pour que les pages non réécrites compilent. Note : le worktree de session n'a pas apps/dashboard (non suivi par git) : travail fait dans le checkout principal par chemins absolus.
- etat: ok
- suite: Accueil : params, calculs, blocs, page ; puis page démo du kit

## 2026-10-24T08:02:17Z · Correction : mixer HIG + shell/diagrammes orya

- fait: Relu orya : app/[locale]/admin/admin-shell.tsx (rail d'icônes par section l.169-220, sous-menu l.222-272, bande d'en-tête titre de section + AdminInsightBand l.117-128, main en feuille arrondie l.145-151, puces de sous-menu mobile l.131-141), components/admin/shell/admin-insight-band.tsx (PeriodSwitch l.83-104, Legend l.106-114, AreaChart vagues l.116-168, Breakdown barres l.170-218), admin/views/overview-view.tsx (AdminStats + Delta l.47-62, file à traiter l.136-178, barres par rail l.179-194, RevenueChart l.231-265). bun add recharts@3.8.0 : délai dépassé (réseau) -> graphiques en SVG maison, sans dépendance.
- etat: ok
- suite: Primitives graphiques + shell rail/sous-menu/bande + accueil avec graphique

## 2026-10-24T08:22:43Z · Palette N&B, shell orya, graphiques, accueil, kit

- fait: Palette noir et blanc (rampe grise pure better-colors, statuts dérivés, marque #0066d6 seulement sur action principale) ; contrastes mesurés par script (scratchpad gray.mjs/g2.mjs). Couleur de marque retirée des puces, cases, jauges, statut info, lien d'évitement. Ombres : aucune ombre portée restante dans ui/, common/, shell/ (filets 1 px). Shell orya : rail de sections (libellés visibles), sous-menu avec barre de contexte communauté, bande de section, contenu en feuille arrondie à filet, puces de section < 1024, barre d'onglets < 1024. Graphiques SVG (AreaChart vagues/axes + table sr-only, ChartLegend, Sparkline, BarList, MeterRow), InsightBand, PeriodSwitch, Delta. Accueil : période, chiffres + variation, tendance, file à traiter -> panneau de détail (approbation de versement), par communauté. Page /kit (404 en prod). Tests : test/kit.test.ts (17 tests). typecheck, lint : sans sortie ; test : 71/71.
- etat: ok
- suite: build, rendu navigateur, spec dashboard-kit.md

## 2026-10-24T08:32:15Z · Palette Apple système (corrige la palette N&B)

- fait: Valeurs Apple VÉRIFIÉES dans le texte alternatif des tableaux du HIG Color (color.json) : systemBlue (0,136,255)/(0,145,255), bleu contraste renforcé (30,110,244)/(92,184,255), vert/rouge/orange par défaut et renforcés, systemGray..Gray6 clair/sombre. Labels, fonds groupés, séparateurs, remplissages : relevé iOS 13 (noahgilmore.com) marqué non vérifié iOS 27. Mesures : blanc/systemBlue 3,52 (refusé) -> bouton #1e6ef4 (bleu contraste renforcé Apple) 4,57 ; secondaryLabel Apple .60 = 3,44 -> .76 ; placeholder .30 -> .78 ; états clairs = variantes contraste renforcé Apple (~4,55 sur blanc). iOS 27 publié le 14/09/2026 (RC 09/09). Coins continus via corner-shape: squircle (progressif).
- etat: ok
- suite: Connexion de prévisualisation, captures clair/sombre, spec

## 2026-10-24T09:05:03Z · Chariow (D88), ombres (D87), Solar, vérification navigateur, spec

- fait: Accent jaune Chariow #ffcc00 (CSS publique chariow.com), texte navy #141b34 (11,24:1), lien clair #8a5700, focus navy ; shadow-float sur menus/feuilles/dialogues ; rayons 12 px ; titres display New York en repli de Sang Bleu. Icônes Solar : sous-ensemble vendu (102 tracés, CC BY 4.0) car bun add échoue (réseau) ; icon-compat pour ui/ et legacy, plus aucun import lucide-react. insight-band : formatChartValue déplacé dans lib/chart-format.ts. UpdatedAt rendu async (connection() puis new Date()). home-stats utilise getRequestNow(). Composants auth Chariow (SplitAuthLayout, SocialButton, OrDivider, astérisque requis). Navigateur : accueil clair/sombre/375 px, panneau de détail, alerte annulée, /kit tri/filtre URL/pagination/ligne ouverte. typecheck/lint OK, test 71/71, build OK. Compte local kit-preview@example.test créé par le seed (mot de passe généré, hors dépôt).
- etat: ok
- suite: Rapport ; Sonnet : pages une par une (notes/dashboard-kit.md § 9)

## 2026-10-24T09:05:09Z · CLÔTURE (base + accueil)

- fait: Livré : base apps/dashboard (jetons, ui sans ombres portées hors flottant), kit components/common (30 fichiers), shell orya + HIG, accueil complet, page /kit, tests, spec notes/dashboard-kit.md (cible 30-clients/dashboard-kit.md).
- etat: ok
- suite: Orchestrateur : intégrer dashboard-kit.md et design-rules.md ; Sonnet : § 9 de dashboard-kit.md
