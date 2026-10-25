---
id: dashboard-plan
title: Plan de réimplémentation du dashboard — lots, écrans, statuts
tags: [dashboard, plan, chariow, apple, suivi]
status: decided
updated: 2026-10-25
related: [chariow-ui-analysis, dashboard-architecture, dashboard-ux, api-routes, decisions]
---

> **Nœud de suivi.** Chaque écran et chaque lot a un statut ; on le met à jour
> à chaque étape (`fait` = vérifié par typecheck + tests + build + fumée
> navigateur cités dans le journal ; `partiel` = existe mais incomplet ;
> `absent` = rien). Demande de l'utilisateur du 2026-10-25 : « on ne sait pas
> ce qui avance ou pas ».

## 1. Références mesurées (2026-10-25)

### Chariow (connecté, DevTools) — voir `chariow-ui-analysis`

| Point | Valeur mesurée |
|---|---|
| Défilement | **le document ne défile jamais** (`scrollHeight = clientHeight`). Seule la **surface blanche** défile (`overflow-y: auto`), hauteur = viewport − 48 px (barre du haut) − 16 px (marge basse), marge droite 8 px. Barre latérale fixe, sans défilement. |
| Collant dans la surface | barre d'outils de page `sticky top-0 bg-white z-20 py-4` ; `thead` `sticky top-20 bg-white z-10` ; barre du haut `sticky top-0 bg-gray z-50` |
| Tableau | **pas de carte** : posé sur la surface ; lignes `border-b #e5e7e8`, survol `bg #f5f6f6`, ligne 57 px, cellules `px-4 py-1` ; `th` 14/700 `#656c75`, sans bordure |
| Bordures | conteneurs `1px #e5e7e8` ; bouton secondaire `1px #cdd0d4` ; champ `1px #cad0d7` |
| Rayons | pilules 9999 (×20), 8 (×20, boutons 32 px, items de nav), 16 (×14, surface, cartes), 12 (champs, CTA), 24/32/48 ponctuels |
| Ombres | **seulement** surface `0 0 6px rgba(0,0,0,.06)` et tiroir (3 couches) ; cartes : aucune ombre |
| Couleur primaire (jaune) | icône de l'item actif, survol des boutons pilule (`hover:bg-yellow-500`), chargeurs, bulle d'aide. **Jamais** en fond de bouton principal (**noir**), jamais en fond d'item actif (**gris `#e5e7e8`**). Règle 60/30/10 : 60 % neutres clairs, 30 % gris/noir de texte et contrôles, ≤ 10 % primaire. |

### Apple macOS 27 UI Kit (Sketch, couleurs relevées)

- Labels clair : primaire `#000` 85 %, secondaire 50 %, tertiaire 25 %, quaternaire 10 %.
- Fills clair : 10 / 8 / 5 / 3 / 2 % de noir ; sombre : 10 / 8 / 5 / 3 / 2 % de blanc.
- Gris système : `#8E8E93` (clair), `#98989D` (sombre).
- Couleurs système sombres : rouge `#FF4245`, orange `#FF9230`, jaune `#FFD600`, vert `#30D158`, bleu `#0091FF`, rose `#FF375F`…
- Taxonomie des boutons (styles de calque) : **Bordered, Bordered Tinted,
  Bordered Destructive, Prominent, Prominent Destructive**, états Idle /
  Clicked / Disabled. Contrôles : Active/Inactive × On/Off. Champs : Idle.
- Familles de composants du kit : alertes, boutons, pop-up / pull-down,
  menus, popovers, champs texte, champs de recherche, contrôles segmentés,
  barres latérales, barres d'outils, interrupteurs, cases, boutons radio,
  barres de défilement, *scroll edge effect*, indicateurs de progression.
- Non relevé (rendu WebGL de Sketch trop lent sur ce réseau) : valeurs des
  styles de texte et de calque, couleurs système claires. À compléter si
  besoin, pas bloquant.

## 2. Décisions de rendu qui en découlent (D108)

1. **Charpente** : `html, body { overflow: hidden }` ; shell en `h-dvh` ; la
   surface de contenu est l'unique zone qui défile ; dans la surface, la
   barre d'outils de page et l'en-tête de tableau sont collants. Rail,
   sous-menu, bande de section : fixes.
2. **Couleur** : neutres Chariow ; bouton principal **noir** (`#242528`,
   blanc en sombre) ; item actif fond gris + **icône** primaire ; primaire
   ailleurs seulement en focus, survol, sélection de contrôle segmenté,
   lien, indicateur. Pas de fond teinté primaire en grand.
3. **Bordures** visibles (`#e5e7e8`) sur cartes et groupes ; ombres réservées
   à la surface, aux tiroirs/feuilles, menus, popovers.
4. **Rayons** (jetons shadcn) : `sm 6`, `md 8` (boutons 32 px, items), `lg 10`,
   `xl 12` (champs, CTA), `2xl 16` (surface, cartes), `3xl 24` (groupes),
   `full` (puces, avatars).
5. **Dégradés** : uniquement là où ils hiérarchisent — en-tête de tiroir
   (voile neutre), bord de défilement (*scroll edge effect* Apple), aucun
   dégradé coloré en aplat.
6. **Composants Apple** : boutons selon la taxonomie ci-dessus (Prominent =
   noir, Bordered, Bordered Tinted = primaire, Destructive) ; contrôle
   segmenté, pop-up, interrupteur, cases, feuilles, alertes, menus au rendu iOS.

## 3. Écrans — inventaire (routes API ↔ dashboard)

| Écran | Routes API | État dashboard | Statut |
|---|---|---|---|
| Connexion | `POST /auth/login` | formulaire OK, style ancien | partiel |
| Accueil | agrégats (commandes, abonnés, versements, pool) | indicateurs, tendance, file, par communauté ; style ancien, Suspense trop large | partiel |
| Communautés (liste, création) | `GET/POST /communities` | liste + création | partiel (style) |
| Communauté — détail / édition / suspension | `GET/PATCH /communities/:id` | **rien** | absent |
| Abonnés | `GET /communities/:id/users` | liste filtrée (100 derniers), migrée au nouveau kit | partiel (pas de détail) |
| Appareils | `GET …/devices`, `POST …/revoke`, `POST …/offline-bundles` | liste, révocation, fichier `.bvpn` (fumée faux API OK) | partiel (style) |
| Fichiers de secours émis | `GET /offline-bundles` | **rien** | absent |
| Commandes | `GET …/orders` | liste + filtre + pagination, migrée au nouveau kit | partiel (pas de tiroir de détail) |
| Commissions | `GET …/commissions` | **rien** | absent |
| Versements | `GET /payouts`, `POST …/payouts`, `approve`, `pay`, `confirm`, `resolve` | flux complet écrit : préparer (finance), tiroir de détail avec approuver / payer / confirmer / trancher selon l'état et le rôle ; typecheck OK, **non testé en navigateur** | partiel |
| Forfaits | `GET/POST /apps/:id/plans`, `PATCH /plans/:id` | liste, création, édition, `endpointTier` | fait (fonction), style à refaire |
| Membres (staff de communauté) | `GET/POST …/memberships`, `PATCH/DELETE /memberships/:id` | liste, ajout, rôle, retrait | fait (fonction), style à refaire |
| Administrateurs (comptes) | `GET/POST /admins` | **rien** | absent |
| Réseau | `GET /pool`, `POST …/health`, `POST /endpoints/manual` | pool (nouveau kit), forcer, ajout manuel + lien `vless://` collé (D107, analyseur testé 3/3) | partiel (fumée navigateur à refaire) |
| Journal | `GET /audit-log` | liste + limite, migrée au nouveau kit | partiel (style) |
| Builds APK | `GET/POST /apps/:id/builds` | **rien** ; stockage R2 non branché côté API (D100) | absent |
| Compte (thème, apparence, déconnexion) | — | menu compte + thème | partiel |
| `/kit` (démo) | — | page de démonstration | à supprimer |

## 4. Lots (ordre d'exécution)

| Lot | Contenu | Critère de fin | Statut |
|---|---|---|---|
| L0 Jetons | `globals.css` : neutres Chariow, bordures, rayons §2.4, ombres §2.3, 60/30/10, thèmes rose/vert/rouge, sombre | contrastes mesurés ; aucun usage primaire en aplat | partiel (premier jet à corriger : primaire trop présente) |
| L1 Shell | architecture conservée (D106) ; modèle de défilement §2.1 ; collants ; mobile | document non défilant vérifié par script ; captures 1280 / 390 px | partiel |
| L2 Kit | `components/page/*` + `components/ui/*` restylés selon §2.6 ; suppression de `_legacy/` et doublons `common/` | une seule famille de composants ; `rg _legacy` vide | partiel |
| L3 Pages existantes | migration de toutes les pages ; Suspense = valeurs seulement (D104) | chaque page : titre/en-têtes statiques, lignes/valeurs suspendues | partiel (commandes, abonnés, appareils, journal) |
| L4 Fonctions manquantes | tiroir commande ; commissions ; versements complets ; communauté détail/édition/suspension ; administrateurs ; fichiers de secours émis ; lien `vless://` ; builds APK | chaque action testée sur faux API (requête citée) | absent |
| L5 Vérification | typecheck, tests, lint, build ; fumée par écran ; puis API réelle (aura-vps) avec connexion faite par l'utilisateur | sorties citées dans le journal | — |

## 5. Journal d'avancement

- 2026-10-25 : analyse Chariow (2 passes) + kit Apple ; plan écrit. Premier
  jet L0/L1/L2 à reprendre selon §2 (primaire trop présente, tableau en
  carte au lieu d'être posé, défilement du document non bloqué).
- 2026-10-25 : L0 corrigé (CTA noir, bordures, rayons, document non
  défilant) ; L1 états actifs Chariow ; L2 tableau posé + en-tête collant,
  barre d'outils collante, cartes de chiffres grises ; pages migrées :
  commandes, abonnés, appareils, journal, versements, réseau. Build OK,
  capture commandes 1280 px conforme à la structure Chariow.
- 2026-10-25 : migrés par l'orchestrateur : communautés (+ tiroir édition /
  suspension), commissions (nouvel écran), administrateurs (nouvel écran +
  création), membres, forfaits, connexion, erreur, accueil (chiffres un par
  un) ; `_legacy/` supprimé ; tests 83/83, lint et build OK ; capture accueil
  1280 px : document non défilant vérifié par script (`docScroll: false`).
- 2026-10-25 : délégué à 5 sous-agents Haiku (`high`, brief
  `30-clients/dashboard-agent-brief`) : `dash-orders-haiku` (tiroirs commande
  et abonné), `dash-devices-haiku` (tiroir appareil + page fichiers de
  secours), `dash-network-audit-haiku` (tiroirs nœud et journal),
  `dash-builds-haiku` (page Applications / builds APK), `dash-home-haiku`
  (blocs de l'accueil). Intégration, build et fumée navigateur : orchestrateur.
- 2026-10-25 : **rôles non vérifiés** jusqu'ici (tout testé en `owner`) ;
  `can()` et `buildNav()` existent mais n'ont jamais été vus sous
  community_admin, support, finance. Lancés : `dash-roles-haiku` (matrice
  routes API × rôles × écrans, corrections de `roles.ts` / `nav-model.ts`,
  test exhaustif) et `dash-fakeapi-haiku` (faux API avec un compte par rôle et
  les règles réelles de `permitted()`, pour la fumée navigateur par rôle).
