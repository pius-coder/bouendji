import type { Queryable } from "../db.js";

/**
 * D132 : retour du forfait illimité sur une durée.
 *
 * - `plans.family` accepte `unlimited` (data illimitée pendant `duration_days`,
 *   pool partagé `free-labs`, aucun client 3x-ui) ;
 * - `pricing_settings.unlimited_cost_per_day_xaf` : coût d'un jour d'illimité,
 *   base du plancher. NULL = non réglé, aucun plancher (D125).
 *
 * Aucune donnée existante modifiée : la contrainte de famille est élargie.
 */
export const id = "100_unlimited_family";

export async function up(db: Queryable): Promise<void> {
  await db.query("ALTER TABLE plans DROP CONSTRAINT IF EXISTS plans_family_check");
  await db.query(
    "ALTER TABLE plans ADD CONSTRAINT plans_family_check CHECK (family IN ('limited', 'limited_night', 'custom', 'unlimited'))",
  );
  await db.query("ALTER TABLE pricing_settings ADD COLUMN IF NOT EXISTS unlimited_cost_per_day_xaf integer NULL");
}