import type { Queryable } from "../db.js";

/**
 * R6 / D115 : options de nuit d'un forfait, un prix par plage.
 * Plages : 20-24 (20 h-24 h), 24-04 (24 h-4 h), 20-04 (20 h-4 h), heure Africa/Douala.
 */
export const id = "061_plan_night_options";

export async function up(db: Queryable): Promise<void> {
  await db.query(`
    CREATE TABLE IF NOT EXISTS plan_night_options (
      plan_id      text NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
      night_window text NOT NULL CHECK (night_window IN ('20-24', '24-04', '20-04')),
      price_xaf    integer NOT NULL CHECK (price_xaf > 0),
      active       boolean NOT NULL DEFAULT true,
      PRIMARY KEY (plan_id, night_window)
    )
  `);
}
