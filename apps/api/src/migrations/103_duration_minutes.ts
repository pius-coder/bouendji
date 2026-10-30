import type { Queryable } from "../db.js";

/**
 * Forfaits à la minute (2026-10-30, décision owner « Oui, en minutes ») :
 * 1 h = 60, 2 h = 120.
 *
 * - `plans.duration_minutes` : durée réelle en minutes. NULL = utiliser
 *   `duration_days × 1440` (comportement historique, inchangé). Quand elle est
 *   renseignée, `duration_days` reste rempli (arrondi au jour supérieur) pour
 *   les lecteurs qui ne connaissent que les jours.
 * - `orders.duration_minutes` : durée figée à l'achat (NULL = durée du forfait),
 *   même logique que `orders.duration_days` (090).
 *
 * Aucune ligne existante n'est réécrite.
 */
export const id = "103_duration_minutes";

export async function up(db: Queryable): Promise<void> {
  await db.query("ALTER TABLE plans ADD COLUMN IF NOT EXISTS duration_minutes integer");
  await db.query(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'plans_duration_minutes_check') THEN
        ALTER TABLE plans ADD CONSTRAINT plans_duration_minutes_check
          CHECK (duration_minutes IS NULL OR duration_minutes BETWEEN 1 AND 525600);
      END IF;
    END $$
  `);
  await db.query("ALTER TABLE orders ADD COLUMN IF NOT EXISTS duration_minutes integer");
  await db.query(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_duration_minutes_check') THEN
        ALTER TABLE orders ADD CONSTRAINT orders_duration_minutes_check
          CHECK (duration_minutes IS NULL OR duration_minutes BETWEEN 1 AND 525600);
      END IF;
    END $$
  `);
}
