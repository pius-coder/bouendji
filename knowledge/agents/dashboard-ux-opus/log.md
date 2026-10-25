# Journal — dashboard-ux-opus

## 2026-10-23T11:03:10Z · Création
- fait: charte créée
- portée: Refaire le noeud 30-clients/dashboard-ux : système UI/UX complet du dashboard Next.js + shadcn/ui, tokens Halo v2, patterns, rôles. Propose, n'intègre pas.
- etat: actif
- suite: lecture des nœuds liés

## 2026-10-23T11:03:10Z · Démarrage

- fait: Charte, log et notes créés
- etat: ok
- suite: Lire les noeuds et décisions

## 2026-10-23T11:04:17Z · Lecture des noeuds et décisions

- fait: Lu dashboard-ux, admin-access-flows, roles-and-commissions, listing-vivante, offline-bundle, D31-D33, D41, D54, D55, D78-D80, O7. Contradiction relevée : l'ancien noeud demande la clé console à l'écran de connexion alors que D78/D79 gardent DASHBOARD_ACCESS_KEY côté serveur Next.js.
- etat: ok
- suite: Lire routes admin, openapi, contracts

## 2026-10-23T11:09:51Z · Vérification des routes admin

- fait: Relu admin.ts (matrice permitted l.229-310, DTO l.440-670, handlers l.677-1798), builds.ts, offline.ts, adminAuth.ts, schemas.ts, lib/auth.ts. Constats : nextCursor seulement sur orders (l.1255) ; users/devices LIMIT 100 sans paramètre ; aucun endpoint de compteurs ; JWT admin 8 h (lib/auth.ts:92) ; ttlHours 1-72 (l.148) mais commentaire et noeud disent 24 h ; OpenAPI offline 201 annonce id, code renvoie bundleId ; endpointDto expose host/port à community_admin et support.
- etat: ok
- suite: Extraire tokens Halo v2

## 2026-10-23T11:11:06Z · Extraction des tokens Halo v2

- fait: Lu Atelier-identites-VPN-v2.html l.13-34 (polices, --ease, --dur 280ms, accent #0a7cff), l.231-404 (Halo clair/sombre : ink, muted, line, glass, rayons 99/23/18/16, cible 44 px), l.787-808 (états : orange #ff9f0a reconnexion, gris #9aa6b8 hors ligne/expiré), l.272 rouge #ff375f, l.287 vert #16c784.
- etat: ok
- suite: Vérifier les noms de composants shadcn dans la doc officielle

## 2026-10-23T11:18:02Z · Vérification des composants shadcn

- fait: Téléchargé https://ui.shadcn.com/r/index.json et les items styles/new-york-v4 (Radix) : sidebar, sheet, drawer (vaul), dialog, alert-dialog, dropdown-menu, command (cmdk), tabs, breadcrumb, badge, card, skeleton, empty, spinner, item, field, form, sonner, native-select, input-group, button-group, toggle-group, scroll-area, use-mobile. Constats : toast absent de new-york-v4 (Sonner est la voie Radix) ; MOBILE_BREAKPOINT = 768 ; SIDEBAR_WIDTH 16rem / mobile 18rem / icon 3rem ; doc formulaires = Field + Controller ; Data Table = guide TanStack, pas un item du registre ; thème = variables oklch sur :root/.dark, --radius base, sm=0.6x … xl=1.4x.
- etat: ok
- suite: Rédiger ux-system.md

## 2026-10-23T11:23:27Z · Rédaction ux-system.md

- fait: Écrit notes/ux-system.md : socle, tokens Halo→shadcn, shell, données (pagination réelle par route), actions, pages, stepper hors-ligne, session, accueil, a11y, matrice rôles code vs noeud, tableau pattern→composant→écran→rôle, 13 questions. Vérifié : aucun chemin stats/summary/search sur les 55 chemins OpenAPI ; pas de refresh admin.
- etat: ok
- suite: Rédiger proposed-node.md et proposed-decision.md

## 2026-10-23T11:25:53Z · Livrables proposés

- fait: Écrit notes/proposed-node.md (remplacement complet de 30-clients/dashboard-ux, frontmatter valide, statut assumption) et notes/proposed-decision.md (D81, conventions UI seulement, aucune décision produit). Aucun noeud partagé modifié.
- etat: ok
- suite: Orchestrateur : intégrer le noeud, soumettre D81 à l'utilisateur, ventiler les 12 questions et les 4 écarts (roles-and-commissions, offline-bundle, OpenAPI bundleId, offline list sans authorize)
