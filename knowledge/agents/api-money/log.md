# Journal — api-money

## 2026-10-20T15:02:56Z · Création
- fait: charte créée
- portée: Écrire les routes de commande, l initialisation de paiement, le webhook Fapshi re-vérifié, le calcul de commission et la page mock. Tests verts. Ne pas modifier app.ts.
- etat: actif
- suite: lecture des nœuds liés

## 2026-10-20T15:13:25Z · Lecture charte, noeuds et code

- fait: Lu fapshi, roles-and-commissions, schema, Contrat-API-mobile.md (sections 3 et 7), fapshi.ts, crypto.ts, errors.ts, mockPayments.ts, config.ts, schema.ts, app.ts, db.ts, auth.ts, internal.ts, ingest.test.ts, packages/contract
- etat: ok
- suite: ecrire services/payments.ts puis routes et tests

## 2026-10-20T15:16:38Z · Service paiements ecrit

- fait: services/payments.ts : planRevision derivee, commissionFor, createOrder, markPaid/markFailed conditionnels, activateOrder idempotent (abonnement + commission available + audit), reconcilePayment re-verifie le fournisseur, handleWebhookEvent deduplice par webhook_events puis supprime la ligne si echec, refundOrder (commission reversed, montant positif, abonnement canceled)
- etat: ok
- suite: routes orders + payments

## 2026-10-20T15:16:42Z · Routes commandes et paiements

- fait: routes/orders.ts (POST /v1/orders strict, GET /v1/orders curseur opaque, GET /v1/orders/:id + refresh=1) et routes/payments.ts (webhook /v1/payments/webhook/:provider re-verifie, page /pay/mock/:ref + confirm en formulaire, /pay/return/:id). Page mock enregistree seulement si PAYMENT_PROVIDER=mock. app.ts non modifie.
- etat: ok
- suite: tests

## 2026-10-20T15:16:47Z · Tests payments verts

- fait: test/payments.test.ts : 14 tests, 14 pass, 0 fail (node --test --import tsx). tsc --noEmit sans erreur. test/ingest.test.ts : 16 pass, 0 fail (pas de regression).
- etat: ok
- suite: rediger le rapport

## 2026-10-20T15:18:12Z · CLÔTURE
Routes commandes (creation/statut/historique), initialisation paiement, webhook re-verifie chez le fournisseur, page mock conditionnelle, activation idempotente + commission figee + remboursement sans solde negatif. 15 tests verts, tsc propre, ingest sans regression. app.ts/schema.ts/package.json intacts. Rapport: knowledge/agents/api-money/notes/rapport.md. Reste non verifie: API Fapshi reelle, Idempotency-Key (pas de table), Device-Proof sur routes argent, revocation propagee au bundle.
