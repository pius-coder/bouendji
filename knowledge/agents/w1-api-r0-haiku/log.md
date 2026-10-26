# Journal — w1-api-r0-haiku

## 2026-10-26T11:21:29Z · Création
- fait: charte créée
- portée: Executeur de migrations versionnees, baseline gelee, correction du rejeu de versement, GITHUB_REF. Voir chantier-vague1 section 2.
- etat: actif
- suite: lecture des nœuds liés

## 2026-10-26T11:57:44Z · Executeur de migrations et migration 001

- fait: db.ts : schema_migrations, decouverte NNN_slug.ts|js triee, une transaction par migration, SET LOCAL lock_timeout, execute sous pg_advisory_lock (PG) et sur PGlite. migrations/000_baseline.ts (marqueur) et 001_constraints_once.ts (DROP/ADD CONSTRAINT communities_commission_bps_range, endpoints_tier_check, plans_endpoint_tier_check, DROP users_email_key). schema.ts : retrait de ces statements. Verifie : tsc vert ; tests migrations.test.ts (4) verts ; build dist + relance : traces 000,001, relance = 0.
- etat: ok
- suite: Verifier la suite complete (en cours).

## 2026-10-26T11:58:22Z · Versement rejouable corrige

- fait: routes/admin.ts /payouts/:id/pay : apres reponse positive du fournisseur, echec d'ecriture de provider_ref (UNIQUE ou autre) => needs_review (plus approved), reference dans failed_reason, audit payout.review ; helper flagPayoutForReview. Test payoutReview.test.ts : 1 test vert (502, needs_review, rejeu 409, resolve paid).
- etat: ok
- suite: Config GITHUB_REF master ; typecheck et suite complete.

## 2026-10-26T12:11:16Z · Verification finale R0

- fait: Commits sur w1/r0 : 139d25c (migrations), c937f65 (versement + GITHUB_REF). node typescript tsc --noEmit : exit 0. node --test --import tsx test/*.test.ts : 178 pass, 0 fail (base 173 + 5). Non verifie : chemin Postgres reel (pg_advisory_lock, pool) ; dossier migrations lu a l'execution sous bundle Vercel.
- etat: ok
- suite: Hors lot : UNIQUE(subscriptions.order_id) et webhook pending (synthese R0) non faits, non demandes dans la mission.

## 2026-10-26T12:11:21Z · CLÔTURE
R0 livre sur w1/r0 (139d25c, c937f65) : executeur de migrations + 000_baseline + 001_constraints_once, versement jamais repasse en approved, GITHUB_REF master. tsc vert, 178/178 tests API. Non verifie : Postgres reel, bundle Vercel.
