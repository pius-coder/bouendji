import type { Queryable } from "../db.js";

/**
 * D127 : forfait sur mesure (l'abonné choisit les Go et la durée).
 *
 * - `plans.family` accepte `custom` : une ligne de `plans` par application porte
 *   l'offre sur mesure (clé étrangère des commandes et abonnements inchangée) ;
 * - `plan_custom_terms` : prix par Go à 1 jour et à 30 jours, bornes des curseurs ;
 * - `orders.duration_days` : durée choisie, figée à l'achat (NULL = durée du forfait).
 *
 * Aucune valeur tarifaire par défaut (D125). Aucune donnée existante modifiée :
 * la contrainte de famille est seulement élargie.
 */
export const id = "090_custom_offer";

export async function up(db: Queryable): Promise<void> {
  await db.query("ALTER TABLE plans DROP CONSTRAINT IF EXISTS plans_family_check");
  await db.query(
    "ALTER TABLE plans ADD CONSTRAINT plans_family_check CHECK (family IN ('limited', 'limited_night', 'custom'))",
  );
  await db.query(`
    CREATE TABLE IF NOT EXISTS plan_custom_terms (
      plan_id              text PRIMARY KEY REFERENCES plans(id) ON DELETE CASCADE,
      price_per_gb_1d_xaf  integer NOT NULL CHECK (price_per_gb_1d_xaf > 0),
      price_per_gb_30d_xaf integer NOT NULL CHECK (price_per_gb_30d_xaf > 0),
      min_gb               integer NOT NULL CHECK (min_gb >= 1),
      max_gb               integer NOT NULL,
      step_gb              integer NOT NULL CHECK (step_gb >= 1),
      min_days             integer NOT NULL CHECK (min_days BETWEEN 1 AND 30),
      max_days             integer NOT NULL CHECK (max_days BETWEEN 1 AND 30),
      updated_at           timestamptz NOT NULL DEFAULT now(),
      CHECK (max_gb >= min_gb),
      CHECK (max_days >= min_days)
    )
  `);
  await db.query("ALTER TABLE orders ADD COLUMN IF NOT EXISTS duration_days integer");
  await db.query(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_duration_days_check') THEN
        ALTER TABLE orders ADD CONSTRAINT orders_duration_days_check
          CHECK (duration_days IS NULL OR duration_days BETWEEN 1 AND 3650);
      END IF;
    END $$
  `);
}
