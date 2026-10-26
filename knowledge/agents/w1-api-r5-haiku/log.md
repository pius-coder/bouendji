# Journal — w1-api-r5-haiku

## 2026-10-26T11:21:30Z · Création
- fait: charte créée
- portée: Etats brouillon/demande/refuse, validation owner qui seule declenche la CI, gardes de transition du callback, callback d'echec, manifeste avec WhatsApp et logo.
- etat: actif
- suite: lecture des nœuds liés

## 2026-10-26T11:32:40Z · Lecture et cadrage R5

- fait: Lu chantier-vague1 (regles), section R5 de audit-synthese, audits build-pipeline et api-community. Worktree w1/r5 propre sur 1689199, sans dossier migrations (R0 non fusionne). permitted() absent de ma copie : capacites remplacees par roleInCommunity + owner, a noter.
- etat: ok
- suite: Ecrire la migration 050, puis builds.ts, brand.ts, inject-brand.mjs, workflow, tests

## 2026-10-26T12:08:09Z · Implementation R5 (commits cbf12e6, b2b130a)

- fait: Migration 050 (statuts draft/requested/rejected, reject_reason, requested_by, approved_by). routes/builds.ts : demande community_admin sans GitHub + notify, approve owner (requested->queued, dispatch unique), reject owner (motif obligatoire), direct POST owner seul, callback avec garde de transition. lib/brand.ts : communityWhatsappUrl, contactWhatsapp, logoRef. inject-brand.mjs accepte contactWhatsapp et logoRef. Workflow : callback running, succeeded sans continue-on-error, failed en if failure(), plus de build sur push du workflow ni de repli bouendji.json. Capacites en role equivalent (permitted absent).
- etat: ok
- suite: Verifier la suite complete et clore

## 2026-10-26T12:08:10Z · Verification R5

- fait: tsc -p apps/api (noEmit) : 0 erreur. node --test test/*.test.ts (apps/api) : 187 tests, 187 pass, 0 fail. inject-brand sur manifeste de test : OK, logoRef absolu : exit 78. YAML du workflow non verifiable (aucun parseur hors ligne), relu a la main.
- etat: ok
- suite: Clore avec le rapport

## 2026-10-26T12:08:11Z · CLÔTURE
R5 livre sur w1/r5 (2 commits). 187/187 tests API verts, typecheck vert. Pipeline APK non reussie : prerequis hors code (libbox, secrets, GITHUB_REF).
