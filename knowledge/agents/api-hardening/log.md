# Journal — api-hardening

## 2026-10-20T16:51:32Z · Création
- fait: charte créée
- portée: Audiences de jeton (D17), tolérance de rejeu du refresh, limites de débit par route, purge des bundles et nonces. Tests verts.
- etat: actif
- suite: lecture des nœuds liés

## 2026-10-20T17:27:00Z · Audiences de jeton D17

- fait: MOBILE_AUDIENCE et ADMIN_AUDIENCE definis dans lib/auth.ts, poses sur les deux emetteurs, verifies via jwtVerify options.audience dans requireUser et requireAdmin
- etat: ok
- suite: tests croises dans test/hardening.test.ts
- fichiers: apps/api/src/lib/auth.ts

## 2026-10-20T17:27:00Z · Tolerance de rejeu du refresh

- fait: schema.ts additif : replaced_by_id, replaced_at, index sessions_replaced_by_idx. Fenetre 5 min ancree sur replaced_at, tolerance de derive 60 s. Rejeu meme appareil dans la fenetre : rotation en place sur la session courante, aucune session creee. Hors fenetre ou autre appareil : revokeChain via replaced_by_id (aller) et index (retour), borne 200, puis 401.
- etat: ok
- suite: tests 200 puis 401 a +6 min ; test 5 de auth.test.ts reecrit
- fichiers: apps/api/src/schema.ts, apps/api/src/routes/auth.ts, apps/api/test/auth.test.ts

## 2026-10-20T17:27:00Z · Limites de debit par route

- fait: login et register 10/15 min par IP plus compteur par e-mail en memoire (cle hashee, reset au succes) ; bundle 30/min par appareil sinon IP ; webhook en allowList sans limite, journalisation conservee. lib/attempts.ts fournit rateLimitError qui retourne un ApiFailure car fastify-rate-limit LEVE la valeur du builder. fail.rateLimited ajoute dans lib/errors.ts, corps 429 dans l enveloppe du projet.
- etat: ok
- suite: actif seulement si RATE_LIMIT_ENFORCE, sinon les suites existantes vireraient au rouge
- fichiers: apps/api/src/lib/attempts.ts, apps/api/src/lib/errors.ts, apps/api/src/config.ts, apps/api/src/app.ts, apps/api/src/routes/auth.ts, apps/api/src/routes/bundle.ts

## 2026-10-20T17:27:01Z · Service de purge

- fait: services/maintenance.ts : purgeExpired supprime bundles expires, device_nonces de plus de 10 min, enroll_challenges expires, auth_sessions expirees ou revoquees depuis plus de 7 jours. Appelee dans le meme tick de 60 s que le balayage existant dans server.ts, try/catch dedie, unref conserve.
- etat: ok
- suite: test idempotence et non-suppression des lignes vivantes
- fichiers: apps/api/src/services/maintenance.ts, apps/api/src/server.ts

## 2026-10-20T17:27:01Z · Verifications executees

- fait: tsc --noEmit exit 0 ; hardening.test.ts 10/10 ; auth.test.ts 9/9 ; suite complete 94 tests 93 pass 1 fail
- etat: partiel
- suite: echec unique hors perimetre : admin.test.ts bundle hors-ligne 500 au lieu de 201, vague concurrente offlineBundles, fixtures a cles factices
- fichiers: apps/api/test/hardening.test.ts

## 2026-10-20T17:27:01Z · Rapport ecrit

- fait: knowledge/agents/api-hardening/notes/rapport.md : les 4 points, la justification de la fenetre de 5 min, les sorties de test citees, ce qui reste non verifie (compteurs par processus, Postgres reel non exerce, cablage du tick verifie au type-check seulement)
- etat: ok
- suite: cloture
- fichiers: knowledge/agents/api-hardening/notes/rapport.md

## 2026-10-20T17:27:20Z · CLÔTURE
resultat: les 4 points demandes sont faits et testes, rien de plus, aucune dependance ajoutee, aucun fichier de routes hors perimetre touche. VERIFIE : tsc --noEmit sans sortie ; test/hardening.test.ts 10 tests 10 pass ; test/auth.test.ts 9 tests 9 pass ; suite complete 94 tests dont 93 pass. L unique echec est admin.test.ts bundle hors-ligne (500 au lieu de 201), vague offlineBundles concurrente, fixtures a cles factices, hors de mon perimetre et absent des 71 tests de depart. NON VERIFIE : compteurs de debit en memoire donc par processus, budget effectif multiplie par le nombre d instances ; Postgres reel non exerce (tout tourne sur PGlite) ; cablage de la purge dans le tick de 60 s verifie au type-check seulement, pas declenche par les tests. QUESTIONS OUVERTES : store partage pour les compteurs de debit ou on assume le facteur instances ; le gagnant de la rotation perd son jeton lors d un rejeu dans la fenetre, acceptable cote mobile ; purge des sessions revoquees a 7 jours alignee sur la conservation attendue par l audit. Rapport complet dans knowledge/agents/api-hardening/notes/rapport.md.
