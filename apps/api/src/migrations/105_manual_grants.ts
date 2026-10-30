import type { Queryable } from "../db.js";

/**
 * Accès manuels et versements à la plateforme (2026-10-30, décisions owner) :
 *
 * L'abonné paie l'administrateur de sa communauté en direct (Orange Money,
 * MTN ou autre) ; l'administrateur accorde le forfait depuis le dashboard.
 * Chaque accès est une **dette** de l'administrateur envers la plateforme, au
 * prix plein du forfait, réglée plus tard par un versement Fapshi.
 *
 * - `settlements` : un versement de la communauté vers la plateforme, payé par
 *   un lien Fapshi. Type distinct des commandes (`orders`) et des retraits
 *   (`payouts`) : le webhook le reconnaît par sa référence et ne fait pour lui
 *   que la réconciliation. `id` est préfixé `stl_` (lisible chez Fapshi comme
 *   `externalId`).
 * - `manual_grants` : un accès accordé à la main. `amount_xaf` est figé au prix
 *   du forfait au moment de l'accord. `order_id` est la commande à prix plein
 *   (`provider = 'manual'`, déjà `paid`) qui porte l'abonnement — même raison
 *   que les coupons (104) : `subscriptions.order_id` et `commissions.order_id`
 *   sont obligatoires. La commission n'est créée qu'au règlement.
 * - `settlement_items` : les accès inclus dans un versement, figés à sa
 *   création. Un accès peut figurer dans deux versements (deux liens ouverts),
 *   mais il n'est **réglé qu'une fois** :
 *     1. contrainte : `settled` ⇔ `settlement_id` et `settled_at` renseignés ;
 *     2. la transition est un UPDATE conditionnel `WHERE status = 'owed'` ;
 *     3. déclencheur : une ligne `settled` ne peut plus être modifiée ni
 *        supprimée, même par une requête SQL écrite à la main.
 *
 * Tables neuves uniquement : aucune table existante n'est modifiée, aucune
 * ligne existante n'est réécrite.
 */
export const id = "105_manual_grants";

export async function up(db: Queryable): Promise<void> {
  await db.query(`
    CREATE TABLE IF NOT EXISTS settlements (
      id             text PRIMARY KEY,
      community_id   text NOT NULL REFERENCES communities(id),
      amount_xaf     integer NOT NULL,
      status         text NOT NULL DEFAULT 'pending',
      provider       text NOT NULL,
      provider_ref   text UNIQUE,
      payment_url    text,
      failure_reason text,
      created_by     text REFERENCES admin_users(id),
      created_at     timestamptz NOT NULL DEFAULT now(),
      paid_at        timestamptz,
      CONSTRAINT settlements_amount_check CHECK (amount_xaf > 0),
      CONSTRAINT settlements_status_check CHECK (status IN ('pending', 'paid', 'failed', 'needs_review')),
      CONSTRAINT settlements_paid_check CHECK (status NOT IN ('paid', 'needs_review') OR paid_at IS NOT NULL)
    )
  `);
  await db.query("CREATE INDEX IF NOT EXISTS settlements_community_idx ON settlements(community_id, created_at DESC)");
  await db.query("CREATE INDEX IF NOT EXISTS settlements_status_idx ON settlements(status)");

  await db.query(`
    CREATE TABLE IF NOT EXISTS manual_grants (
      id              text PRIMARY KEY,
      community_id    text NOT NULL REFERENCES communities(id),
      user_id         text NOT NULL REFERENCES users(id),
      plan_id         text NOT NULL REFERENCES plans(id),
      granted_by      text NOT NULL REFERENCES admin_users(id),
      payment_method  text NOT NULL,
      note            text,
      amount_xaf      integer NOT NULL,
      status          text NOT NULL DEFAULT 'owed',
      granted_at      timestamptz NOT NULL DEFAULT now(),
      settled_at      timestamptz,
      settlement_id   text REFERENCES settlements(id),
      subscription_id text NOT NULL REFERENCES subscriptions(id),
      order_id        text NOT NULL UNIQUE REFERENCES orders(id),
      request_key     text,
      CONSTRAINT manual_grants_method_check CHECK (payment_method IN ('orange_money', 'mtn_momo', 'other')),
      CONSTRAINT manual_grants_amount_check CHECK (amount_xaf > 0),
      CONSTRAINT manual_grants_status_check CHECK (status IN ('owed', 'settled')),
      CONSTRAINT manual_grants_settled_check CHECK (
        (status = 'owed' AND settlement_id IS NULL AND settled_at IS NULL)
        OR (status = 'settled' AND settlement_id IS NOT NULL AND settled_at IS NOT NULL)
      )
    )
  `);
  await db.query("CREATE INDEX IF NOT EXISTS manual_grants_community_status_idx ON manual_grants(community_id, status, granted_at DESC)");
  await db.query("CREATE INDEX IF NOT EXISTS manual_grants_status_idx ON manual_grants(status, granted_at DESC)");
  await db.query("CREATE INDEX IF NOT EXISTS manual_grants_user_idx ON manual_grants(user_id, granted_at DESC)");
  // Rejeu d'un même envoi du dashboard (en-tête Idempotency-Key) : une seule dette.
  await db.query(
    "CREATE UNIQUE INDEX IF NOT EXISTS manual_grants_request_uidx ON manual_grants(granted_by, request_key) WHERE request_key IS NOT NULL",
  );

  await db.query(`
    CREATE TABLE IF NOT EXISTS settlement_items (
      settlement_id text NOT NULL REFERENCES settlements(id),
      grant_id      text NOT NULL REFERENCES manual_grants(id),
      amount_xaf    integer NOT NULL,
      PRIMARY KEY (settlement_id, grant_id)
    )
  `);
  await db.query("CREATE INDEX IF NOT EXISTS settlement_items_grant_idx ON settlement_items(grant_id)");

  // Un accès réglé est définitif : ni modification, ni suppression.
  await db.query(`
    CREATE OR REPLACE FUNCTION manual_grants_settled_guard() RETURNS trigger AS $$
    BEGIN
      IF OLD.status = 'settled' THEN
        RAISE EXCEPTION 'manual_grants: accès % déjà réglé', OLD.id USING ERRCODE = 'check_violation';
      END IF;
      IF TG_OP = 'DELETE' THEN
        RETURN OLD;
      END IF;
      RETURN NEW;
    END
    $$ LANGUAGE plpgsql
  `);
  await db.query("DROP TRIGGER IF EXISTS manual_grants_settled_guard ON manual_grants");
  await db.query(`
    CREATE TRIGGER manual_grants_settled_guard
      BEFORE UPDATE OR DELETE ON manual_grants
      FOR EACH ROW EXECUTE FUNCTION manual_grants_settled_guard()
  `);
}
