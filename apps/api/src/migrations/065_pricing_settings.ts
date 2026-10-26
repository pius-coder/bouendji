import type { Queryable } from "../db.js";

/**
 * R6 / D121, D125 : réglages tarifaires saisis par les owners.
 * Aucune valeur par défaut chiffrée : une colonne NULL signifie « non réglé ».
 * Une seule ligne, id = 'current', créée à la première écriture.
 */
export const id = "065_pricing_settings";

export async function up(db: Queryable): Promise<void> {
  await db.query(`
    CREATE TABLE IF NOT EXISTS pricing_settings (
      id                      text PRIMARY KEY DEFAULT 'current',
      cost_per_gb_xaf         integer NULL,
      night_window_cost_xaf   jsonb NULL,
      platform_margin_bps     integer NULL,
      max_commission_bps      integer NULL,
      updated_at              timestamptz NOT NULL DEFAULT now(),
      updated_by              text NULL
    )
  `);
}
