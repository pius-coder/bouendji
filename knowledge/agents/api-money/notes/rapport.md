# api-money — rapport

Statut : **terminé**, tests verts.
Fichiers écrits (4) :

- `apps/api/src/services/payments.ts`
- `apps/api/src/routes/orders.ts`
- `apps/api/src/routes/payments.ts`
- `apps/api/test/payments.test.ts`

`app.ts`, `schema.ts`, `package.json` non modifiés. Aucune dépendance ajoutée.

## Câblage attendu par l'orchestrateur

Les deux modules exportent `registerXxxRoutes(app, db)` — le `db` est
indispensable et suit la signature existante de `registerInternalRoutes`
(`routes/internal.ts:123`). À ajouter dans `app.ts` :

```ts
registerOrderRoutes(app, db);
registerPaymentRoutes(app, db);
```

`registerPaymentRoutes` n'enregistre la page `/pay/mock/*` que si
`PAYMENT_PROVIDER=mock` ; en production les routes n'existent pas.
Il pose aussi un parseur `application/x-www-form-urlencoded` **seulement s'il
manque** (`app.hasContentTypeParser`), pour le formulaire de la page mock.

## Routes

| Méthode | Chemin | Accès | Rôle |
|---|---|---|---|
| POST | `/v1/orders` | bearer | Crée la commande + initialise le paiement. Corps **strict** : `planId`, `planRevision`, `campaignClaimId?`. |
| GET | `/v1/orders` | bearer | Historique keyset, `limit` 1–100 (défaut 20), `nextCursor` opaque. |
| GET | `/v1/orders/:orderId` | bearer | Statut + activation. `?refresh=1` déclenche une réconciliation fournisseur. |
| POST | `/v1/payments/webhook/:provider` | anonyme | Webhook. `:provider` doit égaler `PAYMENT_PROVIDER`, sinon 404. |
| GET | `/pay/mock/:ref` | publique | Page HTML minimale (mock uniquement). |
| POST | `/pay/mock/:ref/confirm` | publique | Formulaire `outcome=paid\|failed` (mock uniquement). |
| GET | `/pay/return/:orderId` | publique | Page de retour neutre : n'affirme rien, l'app revérifie. |

`POST /v1/orders` répond **201** avec le DTO `Order` du contrat mobile
(`orderId`, `planId`, `planRevision`, `price{amount,currency}`, `status`,
`activationStatus`, `createdAt`, `expiresAt?`, `paidAt?`, `checkout?`,
`failureCode?`, `pollAfterSeconds: 15`).

Champs refusés par construction (corps strict) : `amount`, `price`,
`commissionBps`, `communityId`, `beneficiary`, `tenantId`.
Testé : envoyer `amount: 1` → `400 VALIDATION_FAILED`.

## Machine à états

```
orders.status
  created / pending ──(fournisseur paid)──► paid ──(refund)──► refunded
                     └─(fournisseur failed)─► failed

activationStatus (dérivé, jamais stocké)
  paid + activated_at        -> active
  paid sans activated_at     -> pending      (reprise possible, jamais "repayez")
  refunded                   -> revoked
  autres                     -> not_started
```

Points de conception :

- **`paid` et `active` sont deux transactions distinctes.** `markPaid` est un
  `UPDATE ... WHERE status IN ('created','pending') RETURNING` : seul le
  premier appelant obtient une ligne, c'est le verrou d'idempotence.
- L'activation (`subscriptions` + `activated_at` + `commissions`) échoue sans
  faire reculer `paid` ; `failure_reason = 'activation_failed: …'` et
  `GET /orders/{id}?refresh=1` reprend. Une commande `paid` n'expose **jamais**
  `checkout` — c'est l'invariant « ne jamais redemander un paiement », testé.
- `commissions.order_id` est `UNIQUE` + `ON CONFLICT DO NOTHING`, et
  `activateOrder` sort si un abonnement existe déjà pour la commande : un
  webhook rejoué ne crée ni seconde activation ni seconde commission.
- Renouvellement : la période s'empile après `ends_at` de l'abonnement actif
  le plus tardif, au lieu d'écraser les jours payés.

## Vérifications

### Webhook non cru

`handleWebhookEvent` → `reconcilePayment` appelle **toujours**
`provider.fetchStatus(order.provider_ref)`. Le corps ne fournit qu'une
référence (`transId`, `externalId`…). Deux garde-fous supplémentaires :

- `FAPSHI_VERIFY_WITH_API=false` avec `:provider=fapshi` → **503** ; le handler
  refuse de tourner sans revérification.
- `FAPSHI_WEBHOOK_SECRET` non vide → en-tête `x-webhook-secret` exigé
  (comparaison à temps constant). Absent de l'environnement : pas de secret en
  dur, la revérification reste la seule preuve.

### Montants

- Prix : `plans.price_xaf` lu en base, copié dans `orders.amount_xaf`.
- Révision : `plans` n'a pas de colonne `revision` (schema hors périmètre), donc
  `planRevision()` dérive un entier stable des termes commerciaux
  (`code|price|durée|limite|active`, FNV-1a). Une révision différente → `409`
  avec `details.reason = "PLAN_CHANGED"`.
- Webhook : `amount` du corps comparé à `orders.amount_xaf`. Différent ou non
  numérique → `409` + `details.reason = "AMOUNT_MISMATCH"`, aucune transition.
  Absent → la vérification fournisseur fait foi.
- Commission : `floor(montant × bps / 10 000)`, avec `bps` =
  `orders.commission_bps` **figé à l'achat**. Testé : le taux de la communauté
  passe de 2000 à 5000 après la commande, la commission reste 400 XAF.

### Remboursement

`refundOrder(db, orderId, {reason, actorId?})` (service exporté, **pas** de
route ici — le déclenchement est une décision admin/owner) :

- `paid → refunded`, abonnement lié `canceled` ;
- commission `reversed`, **montant inchangé et positif** (aucun solde négatif) ;
- `audit_log` `order.refunded` ; rejouer est un no-op (`changed: false`).

## Tests

`node --test --import tsx test/payments.test.ts` depuis `apps/api` :

```
✔ la commande est créée avec le prix du serveur et une URL de paiement
✔ un montant envoyé par le client est refusé par le schéma strict
✔ une révision de prix périmée renvoie 409 et ne crée rien
✔ page mock : le bouton change le statut fournisseur, puis la commande suit
✔ un webhook qui annonce « paid » alors que le fournisseur dit « pending » n'active rien
✔ webhook rejoué deux fois : une seule activation, une seule commission
✔ un montant falsifié est rejeté et laisse la commande intacte
✔ la commission utilise le taux figé à l'achat, pas le taux courant
✔ le remboursement annule la commission sans solde négatif
✔ payé mais non activé : activationStatus pending, jamais de nouveau paiement
✔ historique : ordre décroissant, curseur opaque, commande d'autrui invisible
✔ webhook pour une référence inconnue : 404, aucune ligne inventée
✔ un webhook « failed » ne dégrade pas une commande déjà payée
✔ un paiement tardif sur une commande échouée est signalé, pas activé
✔ les routes de paiement ne fuient ni secret ni HTML non échappé

tests 15 · pass 15 · fail 0
```

`npx tsc -p tsconfig.json --noEmit` : aucune sortie.
`test/ingest.test.ts` relancé après coup : 16 pass, 0 fail (pas de régression).

## Non vérifié / à trancher

1. **API Fapshi réelle.** Aucun appel réseau n'a été fait. Le format du corps
   de webhook (noms exacts `transId`/`externalId`/`amount`, encodage,
   éventuelle signature) reste `(non vérifié)` : on lit plusieurs alias et la
   revérification rend une erreur de nom inoffensive (404, le fournisseur
   réessaie). Les chemins `/initiate-pay`, `/payment-status/:ref` et `/payout`
   viennent de `lib/fapshi.ts:98,119,128` et n'ont pas été confrontés à la doc
   live.
2. **Fapshi envoie-t-il du JSON ou du form-encoded ?** Les deux sont acceptés
   (parseur urlencoded posé). Non confirmé.
3. **`Idempotency-Key`.** Le contrat (§3) l'exige sur toute écriture métier ;
   aucune table ne le stocke dans `schema.ts` (hors périmètre). Non implémenté.
   Proposition : table `idempotency_keys(scope, key, body_hash, status, response, expires_at)`
   unique sur `(scope, key)`.
4. **Device-Proof sur les routes argent.** `requireUser` valide le bearer et la
   session, pas la preuve d'appareil (`verifyDeviceProof`). Le contrat l'exige ;
   l'ajouter ici aurait imposé un en-tête `x-device-*` non produit par l'app
   actuelle. À câbler d'un bloc sur toutes les routes privées.
5. **Révocation effective.** `refundOrder` annule l'abonnement, mais l'arrêt du
   tunnel dépend de la lecture du statut d'abonnement par le bundle/sync
   (`api-core`) et du serveur VPN. Non testé de bout en bout.
6. **`planRevision` dérivée** : l'historique recalcule la révision depuis
   l'offre *courante*. Si un prix change, la révision affichée sur une vieille
   commande change aussi. Sans conséquence sur l'achat (le contrôle n'a lieu
   qu'à la création), mais une colonne `orders.plan_revision` serait plus juste.
7. **Statut de commission `available` immédiat.** Aucune période de rétention
   n'est définie dans `knowledge/` ; je n'en ai pas inventé. À trancher si un
   délai anti-impayé est voulu.
8. **Remboursement partiel / double paiement** : traités comme des cas de
   rapprochement humain, pas codés. Un `paid` tardif sur une commande `failed`
   n'active rien : la commande garde `failed` avec
   `failure_reason = 'late_payment_requires_reconciliation'` (`failureCode`
   `RECONCILIATION_REQUIRED`). C'est volontairement conservateur ; personne
   n'est remboursé et personne n'est activé sans décision humaine.
9. **Page mock** : le POST de confirmation est un formulaire HTML sans jeton.
   Elle n'existe qu'en `PAYMENT_PROVIDER=mock` et ne touche aucune commande
   réelle (elle ne fait que changer l'état mémoire du faux fournisseur).

## Propositions pour les nœuds partagés (à intégrer par l'orchestrateur)

- `fapshi` : ajouter le chemin retenu pour le webhook
  (`POST /v1/payments/webhook/fapshi`), le refus 503 si
  `FAPSHI_VERIFY_WITH_API` est faux, et le fait que la page mock n'existe
  qu'en mode `mock`.
- `roles-and-commissions` : la commission naît `available` à la confirmation
  (pas de délai défini) ; un remboursement la passe `reversed` en conservant
  son montant, et le solde reste la somme des commissions non annulées.
- `schema` (à ajouter, non fait — fichier interdit) :
  - `orders.plan_revision integer not null` ;
  - `subscriptions.order_id` avec index unique (l'idempotence s'appuie
    aujourd'hui sur une lecture + le verrou `orders.status`) ;
  - table `idempotency_keys`.
