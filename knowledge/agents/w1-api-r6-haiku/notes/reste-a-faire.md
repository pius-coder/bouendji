# R6 : reste à faire (w1/r6, commit de90dd8)

## Fait
- Migrations 060 à 065 (apps/api/src/migrations/) ; 064 refuse les doublons sans rien supprimer.
- Verrou FOR UPDATE OF o à l'activation ; webhook pending repris au renvoi.
- routes/pricing.ts : GET (owner, community_admin), PUT (owner).
- Plafond de commission depuis les réglages ; repli 30 % si rien n'est réglé.
- Plancher contrôlé à la création et à la modification des forfaits.
- Catalogue, commande (nightWindow, total serveur), abonnement, GET /v1/me/subscription.
- Documentation du lot R6 dans http/contracts.ts (R6_ROUTE_DOCS, docFor).

## Vérifié
- `tsc -p tsconfig.json --noEmit` dans apps/api : exit 0.
- `node --test --import tsx test/r6.test.ts` : 18 tests, 18 pass.
- Suite complète : 173/173 verts sur la version précédente (avant R6) ; relance R6 interrompue (timeout puis arrêt demandé). Résultat final non vérifié.

## Reste à faire
- Relancer la suite complète (`node --test --import tsx test/*.test.ts`, en tâche de fond : plus de 400 s).
- Brancher pricing.read / pricing.manage sur permitted() quand R1 est fusionné (contrôle de rôle équivalent en place).
- Exécuteur de migrations (R0) : les sept fichiers de test ont une ligne `applyR6Migrations(db)` à retirer après fusion.
- planDto (admin.ts, ~l.489) n'est plus utilisée : à supprimer par le lot qui possède ce bloc (R1/R3).
- Décisions à confirmer : Go décimal (10^9 octets) ; quota limité+nuit compte toute la consommation node (granularité journalière) ; état `expired` sans abonnement ; anciens forfaits reçoivent family 'limited' et quota NULL.
- Ne pas relancer le suivi de consommation (R7) : l'épuisement n'est pas coupé par cette route.

## Fichiers touchés
- apps/api/src/migrations/060 à 065 (nouveaux)
- apps/api/src/services/pricing.ts, planTerms.ts (nouveaux) ; payments.ts (modifié)
- apps/api/src/routes/pricing.ts (nouveau) ; admin.ts (bloc forfaits uniquement, plus un import) ; catalog.ts ; me.ts ; orders.ts
- apps/api/src/app.ts (un import, un enregistrement)
- apps/api/src/http/contracts.ts (bloc R6 et docFor)
- apps/api/test/r6.test.ts, r6schema.ts (nouveaux) ; une ligne dans admin, brand, decoy, ingest, payments, poolWatch tests et support.ts
