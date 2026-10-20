# Journal — api-admin

## 2026-10-20T15:02:56Z · Création
- fait: charte créée
- portée: Écrire les routes admin : communautés, membres, rôles, audit, lecture des commandes et du pool. Seul agent autorisé à modifier schema.ts dans cette vague.
- etat: actif
- suite: lecture des nœuds liés

## 2026-10-20T15:33:30Z · Lecture du modèle et des contrats

- fait: lu charte, schema, roles-and-commissions, api-routes, Contrat-API-mobile, lib/auth.ts, errors.ts, crypto.ts, db.ts, schema.ts, app.ts, routes/orders.ts, test/ingest.test.ts, test/payments.test.ts; tests ingestion verts (16/16) avant modification
- etat: ok
- suite: écrire schema.ts (platform_role, community_memberships, offline_bundles, audit_log étendu), puis lib/auth.ts, routes/admin.ts, test/admin.test.ts

## 2026-10-20T15:45:37Z · Schéma et routes admin écrits

- fait: schema.ts : admin_users.platform_role + migration role->owner/none, community_memberships, offline_bundles, colonnes audit_log, règles append-only ; lib/auth.ts : AdminContext{adminId,platformRole,memberships}, scopedCommunity 403 hors périmètre ; routes/admin.ts écrit ; tsc --noEmit vert
- etat: ok
- suite: test/admin.test.ts

## 2026-10-20T16:46:23Z · Correction des deux échecs par la cause

- fait: échec 1 : 409 = garde assertNotLastCommunityAdmin, le test rétrogradait le dernier community_admin de la communauté C ; scénario changé en support->finance. Échec 2 : compteurs d'audit absolus alors que le test owner avait déjà écrit membership.create ; passage en delta par action (avant+1) + delta total=3. 15/15 sur test/admin.test.ts, 64/64 sur les cinq suites, tsc 0 erreur. Migration vérifiée par rejeu de SCHEMA_SQL sur PGlite (platform->owner une fois, pas de re-promotion après rétrogradation)
- etat: ok
- suite: rapport.md + clôture
- fichiers: apps/api/src/routes/admin.ts, apps/api/test/admin.test.ts, apps/api/src/schema.ts, apps/api/src/lib/auth.ts

## 2026-10-20T16:46:31Z · CLÔTURE
routes/admin.ts + test/admin.test.ts livrés ; schema.ts : platform_role (migration platform->owner, legacy role en miroir), community_memberships, offline_bundles, audit_log étendu + règles append-only ; lib/auth.ts : AdminContext{adminId,platformRole,memberships} et scopedCommunity en 403 ; 15/15 tests admin, 64/64 toutes suites, tsc 0 erreur ; rapport dans notes/rapport.md (2 points à arbitrer : finance lit toutes les communautés, support sans montants)
