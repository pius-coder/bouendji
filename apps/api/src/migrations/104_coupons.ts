import type { Queryable } from "../db.js";

/**
 * Coupons de réduction (2026-10-30, décisions owner) :
 *
 * - `coupon_types` : défini par l'owner seul, par application. Un libellé et
 *   une durée en minutes (1 h = 60). Même borne que `plans.duration_minutes`
 *   (103) : 1 à 525 600.
 * - `coupons` : émis par un administrateur pour UN abonné précis, à usage
 *   unique. Le code n'est jamais stocké en clair : seulement `code_hash`
 *   (SHA-256 du code normalisé). `device_id` = `devices.id` de l'appareil qui
 *   l'a utilisé (celui de la session, issu de l'enrôlement) ; l'index unique
 *   partiel garantit, même en concurrence, qu'un appareil n'utilise qu'un
 *   coupon. `order_id` relie le coupon utilisé à la commande à 0 XAF qui porte
 *   l'abonnement (subscriptions.order_id est obligatoire).
 *
 * Tables neuves uniquement : aucune table existante n'est modifiée, aucune
 * ligne existante n'est réécrite.
 */
export const id = "104_coupons";

export async function up(db: Queryable): Promise<void> {
  await db.query(`
    CREATE TABLE IF NOT EXISTS coupon_types (
      id               text PRIMARY KEY,
      app_id           text NOT NULL REFERENCES apps(id),
      label            text NOT NULL,
      duration_minutes integer NOT NULL,
      created_by       text NOT NULL REFERENCES admin_users(id),
      created_at       timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT coupon_types_duration_minutes_check CHECK (duration_minutes BETWEEN 1 AND 525600)
    )
  `);
  await db.query("CREATE INDEX IF NOT EXISTS coupon_types_app_idx ON coupon_types(app_id, created_at DESC)");

  await db.query(`
    CREATE TABLE IF NOT EXISTS coupons (
      id          text PRIMARY KEY,
      code_hash   text NOT NULL,
      type_id     text NOT NULL REFERENCES coupon_types(id),
      user_id     text NOT NULL REFERENCES users(id),
      status      text NOT NULL DEFAULT 'issued',
      issued_by   text NOT NULL REFERENCES admin_users(id),
      issued_at   timestamptz NOT NULL DEFAULT now(),
      redeemed_at timestamptz,
      device_id   text,
      expires_at  timestamptz NOT NULL,
      order_id    text REFERENCES orders(id),
      CONSTRAINT coupons_status_check CHECK (status IN ('issued', 'redeemed', 'revoked')),
      CONSTRAINT coupons_redeemed_check CHECK (
        status <> 'redeemed' OR (redeemed_at IS NOT NULL AND device_id IS NOT NULL AND order_id IS NOT NULL)
      )
    )
  `);
  await db.query("CREATE UNIQUE INDEX IF NOT EXISTS coupons_code_hash_uidx ON coupons(code_hash)");
  await db.query("CREATE UNIQUE INDEX IF NOT EXISTS coupons_device_uidx ON coupons(device_id) WHERE device_id IS NOT NULL");
  await db.query("CREATE INDEX IF NOT EXISTS coupons_user_idx ON coupons(user_id, issued_at DESC)");
}
