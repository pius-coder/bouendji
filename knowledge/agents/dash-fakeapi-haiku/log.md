# Journal — dash-fakeapi-haiku

## 2026-10-25T06:15:47Z · Création
- fait: charte créée
- portée: Faux API de fumée navigateur : un compte par rôle, réponses filtrées comme l'API réelle, routes de tous les écrans.
- etat: actif
- suite: lecture des nœuds liés

## 2026-10-25T06:18:12Z · Lecture du faux API et des contrats réels

- fait: Charte créée, sauvegarde fake-api.backup.mjs faite (8573 o). Lu admin.ts (permitted, authorize, seesMoney, scopedCommunity, handlers), builds.ts, offline.ts, adminAuth.ts, les 9 schémas zod et les services dashboard. Clé X-Access-Key exigée sur /v1/admin/* (app.ts:193-199), dashboard lancé avec fake-access-key (scratchpad start-dashboard.mjs).
- etat: ok
- suite: Réécrire fake-api.mjs complet avec matrice de rôles, puis tester par curl sur 8199

## 2026-10-25T06:22:04Z · Écarts relevés avant écriture

- fait: planRevision renvoie un nombre (apps/api/src/services/payments.ts:160, admin.ts planDto) ; plans.schema.ts attend revision: z.string() : le dashboard échouera sur l'API réelle (à arbitrer). Fake : renvoie String(...) pour passer le schéma. Route offline-bundles GET sans authorize (offline.ts:24-62) : un finance voit la liste des fichiers hors-ligne de sa communauté. Routes builds : requireBuildAdmin exige owner ou community_admin (builds.ts:140).
- etat: ok
- suite: Écrire le faux API et tester par curl
