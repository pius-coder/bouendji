# Journal — admin-ui

## 2026-10-20T15:02:56Z · Création
- fait: charte créée
- portée: Écrire apps/admin : SPA statique sans build, sans CDN, servie par l API. Connexion, communautés, membres, commandes, réseau, bundles hors-ligne.
- etat: actif
- suite: lecture des nœuds liés

## 2026-10-20T17:06:58Z · Alignement sur le contrat réel de routes/admin.ts

- fait: routes/admin.ts livré par api-admin (l.415-1005) : réécriture de public/app.js contre /me, /communities, /communities/:id/{memberships,orders,commissions,devices}, /memberships/:id, /admins, /devices/:id/{revoke,offline-bundles}, /pool, /audit-log ; suppression du contrat inventé (overview/network/members/orders/bundles/audit globaux) ; appels relatifs à l'origine, aucun hôte codé en dur ; login visé /v1/admin/auth/login signalé absent ; token en mémoire, logout sans appel réseau
- etat: ok
- suite: vérifications statiques et navigateur, README, rapport
- bloque: aucune route API ne délivre de jeton administrateur : POST /v1/admin/auth/login à écrire

## 2026-10-20T17:07:50Z · Vérifications statiques et navigateur

- fait: node --check public/app.js vert ; 1 seul fetch() ; 0 hôte codé en dur ; 0 stockage/cookie ; 0 innerHTML/eval ; Chrome file:// avec fetch simulé : login sans auth puis 12 appels avec Bearer, aucun sans ; 7 écrans rendus sans erreur ; endpointId/host/port/vless/UUID/WS/credential/token absents du DOM ; 403 bandeau+panneau ; 401 retour login + bandeau Session expirée ; support : membres/audit masqués, montants masqués ; écritures PATCH/POST conformes ; structure (1 h1, 0 id dupliqué, 0 contrôle sans libellé, légendes) ; 360x800 sans débordement du document ; contrastes 7,6:1 à 16,17:1 ; README et notes/rapport.md écrits
- etat: ok
- suite: clôture
- bloque: pas d'API/PostgreSQL lancés : aucun test de bout en bout ; route de connexion admin absente

## 2026-10-20T17:08:12Z · CLÔTURE
apps/admin livré et aligné sur routes/admin.ts : connexion, vue d'ensemble, communautés, membres, commandes/commissions, réseau, bundles hors-ligne, audit. 1 fetch unique avec Bearer, token en mémoire, 401/403 explicites, pool sans identité de tunnel. Vérifié : node --check, 0 hôte en dur/stockage/injection, 7 écrans en navigateur simulé, structure et mobile 360. Bloquant : aucune route API ne délivre de jeton admin (POST /v1/admin/auth/login à écrire) ; aucun test de bout en bout réel. Pas d'agrégat global abonnés/revenus : la vue d'ensemble ne calcule que des chiffres exacts et ne les invente pas. Détails dans notes/rapport.md et README.md.
