import type { Queryable } from "../db.js";

/**
 * R6 / D115 : famille de forfait et quota en octets.
 * Les forfaits existants reçoivent `family = 'limited'` et `quota_bytes = NULL`
 * (offre sans quota : aucune application du plancher). Les owners relisent ces
 * offres ; aucune donnée n'est modifiée autrement.
 */
export const id = "060_plans_family";

export async function up(db: Queryable): Promise<void> {
  await db.query("ALTER TABLE plans ADD COLUMN IF NOT EXISTS family text NOT NULL DEFAULT 'limited'");
  await db.query("ALTER TABLE plans ADD COLUMN IF NOT EXISTS quota_bytes bigint");
  await db.query(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'plans_family_check') THEN
        ALTER TABLE plans ADD CONSTRAINT plans_family_check CHECK (family IN ('limited', 'limited_night'));
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'plans_quota_bytes_check') THEN
        ALTER TABLE plans ADD CONSTRAINT plans_quota_bytes_check CHECK (quota_bytes IS NULL OR quota_bytes > 0);
      END IF;
    END $$
  `);
}
