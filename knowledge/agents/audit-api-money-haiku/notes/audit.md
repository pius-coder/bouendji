# Audit API money (Fapshi, commandes, paiements, catalogue)

Périmètre : `apps/api/src/lib/fapshi.ts`, `services/payments.ts`, `services/mockPayments.ts`, `routes/orders.ts`, `routes/payments.ts`, `routes/catalog.ts`, `routes/me.ts`, tables money de `schema.ts`, config Fapshi de `config.ts`. Lecture seule. Aucun test ni compilation lancés (charte et brief).

## 1. Verdict

- La logique de paiement est saine dans ses invariants : montant et révision lus en base (`services/payments.ts:299-317`, `:353`), taux de commission figé sur la commande (`:326`, `:342`), webhook relu chez le fournisseur avant toute transition (`:505`, `routes/payments.ts:162-166`), transition `pending -> paid` atomique (`payments.ts:390-398`), commission unique par commande (`schema.ts:249`).
- Fapshi est câblé de bout en bout (initiation, statut, webhook, versement appelé depuis `routes/admin.ts:1498`). Mais les URL et noms de champs ne sont pas vérifiés contre la doc Fapshi (`lib/fapshi.ts:61-64` l'avoue) : **non prêt pour la production sans essai réel**.
- Trois défauts de fond : une déduplication webhook qui fige les réponses `pending` (`payments.ts:602-614`), un remboursement qui annule une commission déjà versée (`payments.ts:684-688`), une activation sans verrou ni contrainte d'unicité (`payments.ts:427`, `schema.ts:167`).
- Le plan (famille, quota en octets, plage de nuit, prix plancher, jauge) n'a **aucun support** : ni colonne, ni route, ni calcul. Aucun client 3x-ui n'existe dans `apps/api/src` (recherche `xui|3x-ui` vide).

## 2. Inventaire

| Fichier | Rôle | Taille | État |
|---|---|---|---|
| `apps/api/src/lib/fapshi.ts` | Adaptateurs mock et Fapshi (initiation, statut, versement) | 150 l. | partiel : endpoints et champs non vérifiés (`:61-64`) ; `payout` câblé (`:126-147`) |
| `apps/api/src/services/payments.ts` | Commande, activation, commission, webhook, remboursement | 716 l. | partiel : logique solide, bugs `B1` à `B4` |
| `apps/api/src/services/mockPayments.ts` | Statuts simulés en mémoire | 27 l. | solide (usage test/dev seulement) |
| `apps/api/src/routes/orders.ts` | `POST/GET /v1/orders`, suivi, `?refresh=1` | 185 l. | solide ; écart de convention `B8` |
| `apps/api/src/routes/payments.ts` | Webhook fournisseur, pages mock | 225 l. | partiel : secret par en-tête non vérifié (`B6`) |
| `apps/api/src/routes/catalog.ts` | Catalogue public par marque | 57 l. | partiel : révision incomplète (`B5`), pas de famille ni plage |
| `apps/api/src/routes/me.ts` | `/v1/me`, `/v1/me/subscription`, `loadEntitlement` | 343 l. | partiel : pas de quota, pas de plage, pas d'état « épuisé » |
| `apps/api/src/schema.ts` tables `plans`, `orders`, `subscriptions`, `commissions`, `payouts` | Modèle money | 123-172, 246-269, 524-530 | partiel : aucune colonne famille, quota, plage, plancher |
| `apps/api/src/schema.ts` `usage_daily` | Consommation par appareil, jour, source | 506-515 | solide mais hors offre : pas agrégé par abonnement |
| `apps/api/src/config.ts` lignes Fapshi | Config, garde-fou prod | 66-76, 197-215 | partiel : clés de versement non exigées au boot (`B9`) |

Notes de lecture :
- `plans` : `schema.ts:123-137` (aucune colonne `family`, `quota`, `slot`). `endpoint_tier` ajouté par migration à `schema.ts:480-482`.
- `orders` : `schema.ts:139-159`. `provider_ref UNIQUE` (`:149`), `commission_bps` et `commission_xaf` (`:151-152`).
- `subscriptions` : `schema.ts:163-172`. `order_id` n'est **pas** UNIQUE (`:167`).
- `commissions` : `schema.ts:246-256`, `order_id UNIQUE` (`:249`), `payout_id` (`:253`).
- `payouts` : `schema.ts:259-269` + colonnes de machine à états `schema.ts:524-530`.

## 3. Ce qui sert le plan

- Montant jamais fourni par le client : `routes/orders.ts:43-50` (`.strict()`), `services/payments.ts:353` (`amount = plan.price_xaf`). À étendre, pas à remplacer.
- Commission figée à l'achat et recalculée à l'activation depuis la commande : `payments.ts:326`, `:342`, `:458-464`.
- Activation idempotente côté commission : `payments.ts:461-463` (`ON CONFLICT (order_id) DO NOTHING`).
- Séparation paiement confirmé / accès actif, déjà modélisée : `payments.ts:14-18`, `activationStatusOf` `:207-211`, `activationPending` dans `me.ts:180-199`.
- Lecture unique de l'entitlement : `me.ts:168-234` (`loadEntitlement`). Point d'accroche pour la jauge.
- Nature de nœud par forfait déjà présente (D45) : `schema.ts:480-482`, `catalog.ts:46`, `me.ts:208`. La famille peut s'y ajouter sans casser ce champ.
- Consommation par appareil et jour, deux sources (`device`, `node`) : `schema.ts:506-515`, écrite par `routes/telemetry.ts:130-137`.
- Pipeline de versement approve, pay, confirm, resolve avec réclamation atomique : `routes/admin.ts:1386`, `:1434`, `:1579`, `:1622`. Réutilisable tel quel.
- Mode Fapshi refusé sans revérification : `routes/payments.ts:162-166`.

## 4. Écarts avec le plan

Numérotation du plan (brief). Seuls les points 2, 4, 5 et 9 touchent ma tranche.

**Point 2 (onboarding, étape forfaits)** : `routes/admin.ts:850-895` (création) et `:897` (modification) existent, mais sans famille, quota ni plage. Partiel.

**Point 4 (forfaits deux familles)** :
- 4a Famille (limité / limité+nuit) : absente. `schema.ts:123-137`. `endpoint_tier` (`catalog.ts:46`) désigne une nature de nœud, pas une famille de forfait.
- 4b Quota en octets : absent. Aucune colonne `quota_bytes` sur `plans` (`schema.ts:123-137`), `orders` ni `subscriptions`.
- 4c Plage de nuit choisie au paiement (20h-24h, 24h-4h, 20h-4h) : absente de l'entrée `CreateOrderInput` (`services/payments.ts:101-106`) et du schéma strict (`routes/orders.ts:43-50`).
- 4d Total calculé côté serveur : seul `plan.price_xaf` est utilisé (`payments.ts:353`). Il faut ajouter le prix de plage.
- 4e Client 3x-ui créé au paiement : absent (recherche `xui|3x-ui` vide dans `apps/api/src`). `reconcilePayment` et `activateOrder` ne l'appellent pas (`payments.ts:421-474`, `:527`).
- 4f Accès coupé à l'épuisement : absent. `loadEntitlement` ne lit que `ends_at > now()` (`me.ts:174`).
- 4g Quota suivi par abonnement : absent. `usage_daily` est par appareil (`schema.ts:506-515`), pas par abonnement.
- 4h Révision de l'offre : ne couvre ni la nature de nœud ni une future plage (`payments.ts:167-173`, `catalog.ts:47-53`). Voir `B5`.

**Point 5 (prix plancher)** :
- Aucun coût du Go, aucun coût de plage, aucune marge stockés. Recherche `plancher|floor|marge|per_gb` vide dans `apps/api/src`.
- `MAX_COMMISSION_BPS = 3000` (`payments.ts:190`) plafonne le taux de commission, pas le prix de vente. Ne pas confondre.
- Aucun contrôle de prix minimum à la création ou la modification : `routes/admin.ts:850-895` insère `input.priceXaf` tel quel. Le schéma de validation `planCreateSchema` n'a pas été lu (non vérifié).
- Aucun indicateur de prix exposé.

**Point 9 (app Android)** :
- Page de paiement avec choix de plage et prix : `GET /v1/apps/:appId/plans` (`catalog.ts:19-56`) sert prix et révision mais pas famille, quota, plages ni prix de plage.
- Jauge de quota à l'accueil : `GET /v1/me/subscription` (`me.ts:338-342`) ne renvoie aucun quota. Voir section 5, question 5.

## 5. Structure de code proposée

Question 1 (état Fapshi) : réponse dans la section 1. Dépendances de champs à valider avec la doc Fapshi (`lib/fapshi.ts:61-64`) avant toute bascule.

**Question 3 : famille, quota, plage, prix**

Migration dans le bloc de compatibilité, après `schema.ts:482` :

```sql
ALTER TABLE plans ADD COLUMN IF NOT EXISTS family text NOT NULL DEFAULT 'limited'
  CHECK (family IN ('limited','limited_night'));
ALTER TABLE plans ADD COLUMN IF NOT EXISTS quota_bytes bigint NOT NULL DEFAULT 0 CHECK (quota_bytes >= 0);
-- prix de chaque plage, par forfait ; `window` est un mot réservé, d'où `slot`
CREATE TABLE IF NOT EXISTS plan_night_prices (
  plan_id   text NOT NULL REFERENCES plans(id),
  slot      text NOT NULL CHECK (slot IN ('20-24','00-04','20-04')),
  price_xaf integer NOT NULL CHECK (price_xaf > 0),
  PRIMARY KEY (plan_id, slot)
);
-- figé sur la commande et l'abonnement (jamais relu depuis plans)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS family text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS quota_bytes bigint NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS slot text CHECK (slot IN ('20-24','00-04','20-04'));
ALTER TABLE orders ADD COLUMN IF NOT EXISTS base_price_xaf integer;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS slot_price_xaf integer NOT NULL DEFAULT 0;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS family text;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS quota_bytes bigint NOT NULL DEFAULT 0;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS slot text;
-- verrou d'idempotence de l'activation (voir B3)
CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_order_uidx ON subscriptions(order_id);
```

Calcul du total, côté serveur, dans `createOrder` (`services/payments.ts:288-381`) :
- `CreateOrderInput` gagne `slot?: "20-24" | "00-04" | "20-04"`. `routes/orders.ts:43-50` gagne `slot: z.enum([...]).optional()`, le schéma reste `.strict()`.
- Si `plan.family === "limited"` et `slot` présent : 400. Si `plan.family === "limited_night"` et `slot` absent : 400.
- `amount = plan.price_xaf + slotPrice`, où `slotPrice` vient de `plan_night_prices` lu dans la même transaction. Le client n'envoie jamais de montant.
- La révision doit inclure `family`, `quota_bytes` et les prix de plage, via une fonction unique partagée par `catalog.ts:47-53` et `payments.ts:311`.
- `activateOrder` copie `family`, `quota_bytes`, `slot` depuis la commande vers `subscriptions` (`payments.ts:449-453`).

Point à trancher par l'owner : le prix de la plage s'ajoute-t-il au prix du forfait, ou le forfait « limité + nuit » a-t-il son propre prix ? Le modèle ci-dessus suppose l'ajout. Non tranché dans le brief.

**Question 4 : prix plancher**

- Stockage : nouvelle table `platform_cost_settings (id text PRIMARY KEY DEFAULT 'default', cost_per_gb_xaf integer NOT NULL, cost_per_slot_xaf jsonb NOT NULL, margin_bps integer NOT NULL CHECK (margin_bps BETWEEN 0 AND 10000), updated_at timestamptz, updated_by text)`. Une ligne, modifiable par le rôle `owner` uniquement.
- Fonction pure : `floorFor({ quotaBytes, family, slot }, settings): number` dans un nouveau `services/pricingFloor.ts`. Arrondi vers le haut sur le Go.
- Contrôle d'écriture : appel de `assertAboveFloor` dans la création (`routes/admin.ts:850-895`) et la modification (`routes/admin.ts:897`) des forfaits. Refus en 409 avec le plancher dans `details`.
- Contrôle de lecture : `GET /v1/admin/apps/:appId/plans/floor?quotaBytes=&family=&slot=` pour l'indicateur de prix de l'admin.
- Les forfaits déjà vendus ne sont jamais recalculés (invariant `pricing-and-split.md` n°3). Un plancher relevé ne s'applique qu'aux nouvelles modifications.

**Question 5 : `GET /v1/me/subscription`**

Aujourd'hui (`me.ts:168-234`) : `{ entitlement: { active, planCode, planName, endpointTier, startsAt, endsAt, daysRemaining, deviceLimit, activationPending }, subscription: { id, planId, planCode, planName, startsAt, endsAt, deviceLimit } | null }`.

À ajouter, dans `loadEntitlement` :
- `family`, `slot` (code), `slotStartsAt`/`slotEndsAt` (à calculer par fuseau, voir section 8).
- `quota: { totalBytes, usedBytes, remainingBytes, exhausted: boolean }`. Calcul : somme de `usage_daily.bytes_up + bytes_down` où `source = 'node'`, pour les appareils du compte, sur les jours compris entre `starts_at::date` et `ends_at::date`. Source `node` seulement, car le brief dit « trafic lu côté serveur ». `devices.user_id` non vérifié.
- `state : "active" | "quota_exhausted" | "expired" | "activation_pending" | "none"`. `quota_exhausted` quand `usedBytes >= totalBytes` et `family = limited` ou plage épuisée.
- L'accès coupé à l'épuisement doit être décidé là où le bundle est servi (hors tranche, voir section 7). `loadEntitlement` ne doit pas le faire seul.

**Question 6 : création du client 3x-ui au paiement**

Point d'accroche recommandé : **outbox transactionnelle**, pas d'appel HTTP dans une transaction SQL.
1. Dans `activateOrder`, à l'intérieur de `db.tx` (`services/payments.ts:421-473`), après l'insertion de l'abonnement (`:449-453`), insérer une ligne `access_provisioning (order_id text PRIMARY KEY REFERENCES orders(id), status text NOT NULL DEFAULT 'pending', quota_bytes bigint, slot text, attempts int DEFAULT 0, client_ref text, last_error text, updated_at timestamptz)`.
2. Dans `reconcilePayment`, après `activated = await activateOrder(...)` (`payments.ts:527`), appeler `provisionAccess(db, order.id)` (nouveau `services/provisioning.ts`). **Appeler aussi quand `activated === false`** : le cas « paid + abonnement déjà existant » (`payments.ts:525`) doit pouvoir reprendre une création restée en `pending`.
3. `provisionAccess` : idempotent (`status = 'done'` sort tout de suite), appel 3x-ui hors transaction, puis `UPDATE ... SET status = 'done', client_ref = $2`. En cas d'échec : `attempts + 1`, `last_error`, rejouable par `GET /v1/orders/:id?refresh=1` (`routes/orders.ts:177-181`) et par un worker de rattrapage à ajouter.
4. Pas de secret 3x-ui dans le schéma. Le client VLESS généré ne doit jamais apparaître dans les logs ni dans `audit_log`.

Signature proposée :

```ts
export async function provisionAccess(db: Database, orderId: string): Promise<"done" | "pending" | "skipped">;
```

## 6. Bugs et risques

- **B1 (haut) Webhook : une réponse `pending` est enregistrée comme terminale.** `services/payments.ts:602-604` calcule `terminal = "pending"`, puis `:611-614` le stocke. La ligne `webhook_events` n'est donc jamais supprimée (`:623-627` ne sert qu'en erreur). Scénario : le webhook arrive avant que le statut Fapshi soit `SUCCESSFUL`. Retry du fournisseur avec le même `eventId`, ou le même corps sans `eventId` (`routes/payments.ts:176`), donne `inserted.length === 0` (`payments.ts:569-590`) et renvoie `duplicate` sans réconcilier. La commande reste `pending` jusqu'à un `GET /v1/orders/:id?refresh=1` (`routes/orders.ts:173-176`). Sans ce retour de l'app, elle reste bloquée.
- **B2 (haut, latent) Remboursement d'une commission déjà versée.** `services/payments.ts:684-688` passe `commissions.status = 'reversed'` sur toute commission non annulée, sans regarder `payout_id`. Or la réclamation de commissions pose `payout_id` sans changer `status` (`routes/admin.ts:1354-1355`, filtre `status = 'available'`). Scénario : commission dans un lot versé, puis remboursement. La commission est annulée, mais le montant du lot part quand même. Invariant 4 de `pricing-and-split.md` non respecté. `refundOrder` n'a **aucun appelant** dans `apps/api/src` (recherche faite), donc latent aujourd'hui.
- **B3 (moyen) Activation non verrouillée, abonnement dupliqué.** `services/payments.ts:427` lit `subscriptions` sans verrou, `orders` non verrouillé dans `activateOrder` (`:423`). `subscriptions.order_id` n'a pas d'UNIQUE (`schema.ts:167`). Scénario : webhook et `GET ?refresh=1` simultanés après `markPaid`. Les deux voient « pas d'abonnement » et insèrent (`payments.ts:449-453`). Deux lignes pour une commande, la durée n'est pas doublée (même `from`, READ COMMITTED, non vérifié sur le pool). La commission reste protégée (`schema.ts:249`).
- **B4 (moyen) Pas de dédoublonnage à la création de commande.** `routes/orders.ts:137-146` et `services/payments.ts:328-347` insèrent sans regarder les commandes `pending` identiques. Un double clic crée deux commandes et deux initiations Fapshi. La seconde reste `pending` jusqu'à expiration (`payments.ts:32`, 24 h).
- **B5 (moyen) Révision incomplète.** `payments.ts:167-173` et `catalog.ts:47-53` n'incluent ni `endpoint_tier` ni le nom. Un changement de nature de nœud ne déclenche pas le `409 PLAN_CHANGED` (`payments.ts:311-317`). Attention : ajouter les nouveaux champs change toutes les révisions existantes, à traiter au déploiement (les apps en cours recevront un 409 unique).
- **B6 (moyen, dépend d'un fait non vérifié) Secret de webhook par en-tête personnalisé.** `routes/payments.ts:155` attend `x-webhook-secret`. Si Fapshi n'envoie pas cet en-tête, chaque webhook réel reçoit `401` (`:157-158`) en production. Non vérifié.
- **B7 (moyen, dépend d'un fait non vérifié) Montant du webhook comparé strictement.** `services/payments.ts:493-497` renvoie `409` si le montant annoncé diffère. Si Fapshi envoie un montant dans une autre unité ou un autre champ (`routes/payments.ts:114-123`), chaque webhook est rejeté et le fournisseur réessaie. Non vérifié.
- **B8 (bas) Convention d'auth.** `routes/orders.ts:138`, `:149`, `:169` utilisent `requireUser`, sans preuve d'appareil. `me.ts:6-11` dit que les routes privées passent par `requireSession`. Vérifier si c'est voulu.
- **B9 (bas) Garde-fou prod incomplet.** `config.ts:198-209` exige le secret webhook et `PAYMENT_PROVIDER=fapshi`, mais pas `FAPSHI_API_USER`, `FAPSHI_API_KEY` ni `FAPSHI_PAYOUT_*`. Le boot réussit, l'échec arrive au premier paiement.
- **B10 (bas) Référence fournisseur non enregistrée.** `services/payments.ts:369-373` enregistre `provider_ref` après l'appel fournisseur. Si cette écriture échoue, la commande reste sans `provider_ref` : `reconcilePayment` renvoie `pending` (`:499-503`) et le webhook ne la retrouve que par `orderId`.
- **B11 (bas) Audit dupliqué au rejeu.** `services/payments.ts:466-470` insère `commission.created` même quand `ON CONFLICT` a ignoré la commission (`:461-463`).
- **B12 (bas) Endpoint public non limité.** `routes/payments.ts:145-193` n'exige rien si `FAPSHI_WEBHOOK_SECRET` est vide (hors production). Il renvoie `orderId` et `status` à un appelant qui connaît un `providerRef`.

## 7. Dépendances hors tranche

- `routes/admin.ts:1386-1606` : pipeline approve, pay, confirm, resolve. Le versement réel passe par `:1498`. Le `fapshi.md` (2026-10-20) dit le contraire : **à corriger** (nœud partagé, je propose).
- `routes/admin.ts:1339-1355` : réclamation des commissions (`payout_id`, `status` inchangé). Cause de `B2`.
- `routes/admin.ts:850-897` : schéma de validation des forfaits (`planCreateSchema`, à lire) pour le contrôle de plancher.
- Bundle et endpoints (`services/endpoints.ts`, `routes/bundle.ts`) : décident de l'accès réel, donc de la coupure à l'épuisement (point 4f). Non lus.
- `routes/telemetry.ts:130-137` : écriture de `usage_daily` par `GREATEST`. Une valeur `device` peut être gonflée par le client. Le quota doit ne compter que `node`.
- `lib/auth.ts` (`requireUser`, `requireSession`) : non lu en entier.
- `app.ts:59-66` : `rawBody` utilisé pour le hachage du webhook. Vérifié seulement par son usage.
- `devices` : colonne `user_id` supposée pour les jointures de quota (non vérifiée).

## 8. Non vérifié

- Endpoints Fapshi (`/initiate-pay`, `/payment-status/{id}`, `/payout`), noms de champs et valeurs de statut : `lib/fapshi.ts:61-64` et `:97-147`. Aucune doc Fapshi lue (pas de réseau en audit).
- Fapshi envoie-t-il l'en-tête `x-webhook-secret` (`routes/payments.ts:155`) ? Le montant est-il envoyé dans le même format (`:114-123`) ?
- Isolation de `db.tx` et verrous réels (`B3`) : non confirmés sur le pool.
- Fuseau des plages de nuit (20h-24h, 24h-4h, 20h-4h) : non tranché. Le serveur ne connaît pas l'heure locale dans ce code.
- Règle de quota : up + down ou down seul ? Non tranché.
- Coût Go, coût de plage, marge : fixés par l'owner, valeurs absentes du code.
- Schéma de validation `planCreateSchema` (`routes/admin.ts`) non lu.
- Aucun test exécuté. `npm test` et `tsc` non lancés (charte : pas de compilation).
- Note `knowledge/40-money/fapshi.md` (2026-10-20) : affirme qu'aucun appel `fapshi.payout()` n'existe ; contredit par `routes/admin.ts:1498`. Non modifié (nœud partagé).
