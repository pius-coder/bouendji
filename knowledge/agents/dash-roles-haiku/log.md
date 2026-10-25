# Journal — dash-roles-haiku

## 2026-10-25T06:16:22Z · Création
- fait: charte créée
- portée: Comparer permitted() de l'API et can() du dashboard pour chaque capacité et chaque rôle ; vérifier écrans, menu et actions ; corriger roles.ts et nav-model.ts ; test matrice.
- etat: actif
- suite: lecture des nœuds liés

## 2026-10-25T06:16:30Z · Démarrage

- fait: Charte créée ; brief dashboard-agent-brief et roles-and-commissions lus. Périmètre : roles.ts, nav-model.ts, test roles-matrix.test.ts.
- etat: ok
- suite: Lire permitted() dans apps/api/src/routes/admin.ts et roles.ts / nav-model.ts

## 2026-10-25T06:17:43Z · Lecture API

- fait: permitted() admin.ts:281-339 lu ; authorize par route relevé (admin.ts, builds.ts:141, offline.ts:24-41). Écarts API notés : scopedCommunity() bloque finance hors périmètre sur routes à chemin (orders/commissions) ; GET /v1/admin/offline-bundles sans authorize (offline.ts:24).
- etat: ok
- suite: Lire dashboard : can/buildNav usages, home loader, platformRole direct

## 2026-10-25T06:18:37Z · Lecture dashboard

- fait: Usages can()/buildNav relevés (grep). home.ts getHomeAccess lu : payouts.read/approve appelés avec communityId null. Écarts repérés : payouts.approve/read(null) = anyRole ignorant la communauté (API payout.approve/commission.read par communauté) ; orders.read anyRole(finance) sans effet API (scopedCommunity 403) ; GET /payouts sans communauté 422 pour CA multi-appartenances.
- etat: ok
- suite: Vérifier payouts-table/service, puis tests existants (ui-model, kit, plans-members, network-offline) avant d'éditer roles.ts

## 2026-10-25T06:19:57Z · Corrections roles.ts et nav-model.ts

- fait: roles.ts : ajout de community.read ; payouts.read/payouts.approve par communauté quand elle est connue (CA ou finance), sinon anyRole ; orders.read et money.read inchangés (commentaires d'écart). nav-model.ts : entrée Versements testée avec communityId null (page globale).
- etat: ok
- suite: Écrire test/roles-matrix.test.ts (matrice + nav), puis typecheck/test/lint
