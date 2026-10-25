# Journal — audit-app-opus

## 2026-10-23T11:44:55Z · Création
- fait: charte créée
- portée: Auditer ce qui manque pour que l'application marche de bout en bout (jonctions endpoint/API/Postgres/Android/dashboard/CI/paiement/Vercel/secrets), vérifier la cohérence des noeuds sur la distribution des configurations et le cycle de vie des noeuds, parcours en diagrammes de séquence, plan minimal. Propose, n'intègre pas.
- etat: actif
- suite: lecture des nœuds liés

## 2026-10-23T11:44:55Z · Démarrage

- fait: Charte, journal et notes créés ; context et report lus
- etat: ok
- suite: Inventaire du dépôt

## 2026-10-23T11:49:56Z · Lecture API coeur et endpoint

- fait: Lu config.ts, db.ts, app.ts, server.ts, api/index.ts, endpoints.ts, internal.ts, bundle.ts, entrypoint.sh. Constat bloquant: entrypoint.sh n'envoie jamais X-Ingest-Timestamp alors que app.ts l.209-216 l'exige hors test -> 401 -> exit 78. cachedBundle (bundle.ts l.258-271) ne compare pas le jeu servi.
- etat: ok
- suite: Paiements, commandes, abonnement

## 2026-10-23T11:53:18Z · Webhook Fapshi vérifié en doc

- fait: Doc Fapshi (docs.fapshi.com/en/api-reference/endpoint/webhook): en-tête x-wh-secret, un seul envoi par événement, URL par service. Code payments.ts l.155 lit x-webhook-secret -> 401 en production (secret obligatoire D77). /pay/return/:orderId n'existe qu'en mock (payments.ts l.201-224) alors que redirectUrl la vise toujours (services/payments.ts l.357).
- etat: ok
- suite: orders, me, admin

## 2026-10-23T11:57:00Z · Vérifications exécutées

- fait: apps/api: tsc -p tsconfig.json --noEmit exit=0 sans sortie; tsc -p tsconfig.vercel.json --noEmit exit=0; node --test (NODE_ENV=test, PGlite memory://): tests 162, pass 162, fail 0, duration_ms 24284. Les tests ne couvrent pas X-Ingest-Timestamp (exempté si isTest, app.ts l.209).
- etat: ok
- suite: CI build de marque, builds.ts

## 2026-10-23T11:58:03Z · CI de marque relue

- fait: android-brand.yml: aucune étape libbox.aar (build.gradle.kts l.111-116 require -> échec), pas d'upload Blob, callback seulement en succès, sans apkUrl ni versionCode; GITHUB_REF défaut main (config.ts l.91) alors que la branche par défaut est master. Brief complété par l'orchestrateur: section Android dédiée.
- etat: ok
- suite: Audit Android détaillé

## 2026-10-23T12:01:37Z · Audit Android

- fait: Relu ApiClient, VpnTunnelService, SingBoxConfig, LibboxTunnelEngine, OfflineBundle, AppRoot. Vérifié par unzip -l: libbox.so seulement jni/arm64-v8a dans libbox.aar et lib/arm64-v8a dans app-debug.apk (89580046 o, 2026-10-22). Manques: login sans appId (ApiClient l.231-232) et register sans phone (l.513-522) vs auth.ts (D53) -> 422; expiresAt = min des nœuds (SingBoxConfig l.255) -> vault.clear + EXPIRED au 1er nœud mort (VpnTunnelService l.294-307), D67 absent; aucun appel télémétrie ni sonde 60 s (measureDelayMs sans appelant, D64/D70); bundle vide écrase le coffre (AppRoot l.138, D61); minSdk 26 mais déchiffrement exige API 31; import hors-ligne sans point d'entrée UI.
- etat: ok
- suite: Lecture des noeuds pour cohérence

## 2026-10-23T12:05:27Z · Lecture des noeuds et contradictions

- fait: Lu decisions, open-questions, journeys, objective, endpoint-lifecycle, listing-vivante, vercel, ingest-auth, telegram-bot, api-routes, admin-access-flows, offline-bundle, roles-and-commissions, revocation, traffic-stats, deploiement-etat, fapshi, pricing (grep), dashboard-ux (grep). OpenAPI recompté: 64 ops, 59 avec sécurité, 27 corps (D76 dit 53). TTL hors-ligne réel: schéma 1-72 h, mais issueOfflineBundle borne à 24*60 min (offlineBundles.ts l.136) -> max effectif 24 h.
- etat: ok
- suite: Rédaction des 4 livrables

## 2026-10-23T12:09:13Z · Livrable audit-manques

- fait: Écrit notes/audit-manques.md : 20 manques (M1-M20), section Android dédiée, tableau des secrets.
- etat: ok
- suite: coherence-noeuds.md

## 2026-10-23T12:15:33Z · Livrable coherence-noeuds

- fait: Écrit notes/coherence-noeuds.md : 34 contradictions (G1:5, G2:14, G3:15), avec fichier:ligne, valeur réelle, correction ; section décisions remplacées.
- etat: ok
- suite: parcours-sequences.md

## 2026-10-23T12:18:10Z · Livrable parcours-sequences

- fait: Écrit notes/parcours-sequences.md : 18 parcours (7 admin, 7 utilisateur, 3 endpoint, 1 CI), un sequenceDiagram chacun, étapes en échec marquées. Ajout M21 (aucune route de création d'app) dans audit-manques.
- etat: ok
- suite: plan-minimal.md

## 2026-10-23T12:19:28Z · Livrable plan-minimal

- fait: Écrit notes/plan-minimal.md : 20 étapes (P1-P20) en 3 blocs, une solution par manque, sources (doc Fapshi webhook, doc Vercel helpers et pooling), section de ce qui est écarté.
- etat: ok
- suite: Clôture

## 2026-10-23T12:19:29Z · CLÔTURE
CLÔTURE — Verdict : non, pas de bout en bout. Vérifié : tsc api et vercel exit 0 sans sortie ; 162/162 tests ; libbox arm64-v8a seul (unzip). Bloquants : M1 horodatage d'ingestion, M16 login/register Android, M10 en-tête webhook x-wh-secret. 34 contradictions. Propose seulement, rien d'intégré.
