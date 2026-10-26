import type { Queryable } from "../db.js";

/**
 * R6 : l'abonnement copie le quota et la plage de la commande. `exhausted_at`
 * est posé par le travailleur de consommation (R7), jamais par une lecture.
 * La famille se déduit de `night_window` (présent = limité + nuit).
 */
export const id = "063_subscriptions_quota";

export async function up(db: Queryable): Promise<void> {
  await db.query("ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS quota_bytes bigint");
  await db.query("ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS night_window text");
  await db.query("ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS exhausted_at timestamptz");
  await db.query(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'subscriptions_night_window_check') THEN
        ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_night_window_check
          CHECK (night_window IS NULL OR night_window IN ('20-24', '24-04', '20-04'));
      END IF;
    END $$
  `);
}
