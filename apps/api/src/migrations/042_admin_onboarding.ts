import type { Queryable } from "../db.js";

export const id = "042_admin_onboarding";

/**
 * R4 : avancement de l'assistant (step 0 à 5, le récapitulatif) et du guide par
 * rôle, stocké côté serveur pour survivre à un changement d'appareil.
 */
export async function up(db: Queryable): Promise<void> {
  await db.query(`
    CREATE TABLE IF NOT EXISTS admin_onboarding (
      admin_id      text PRIMARY KEY REFERENCES admin_users(id) ON DELETE CASCADE,
      step          integer NOT NULL DEFAULT 0 CHECK (step BETWEEN 0 AND 5),
      completed_at  timestamptz,
      guide_step    integer NOT NULL DEFAULT 0 CHECK (guide_step BETWEEN 0 AND 20),
      guide_done_at timestamptz,
      updated_at    timestamptz NOT NULL DEFAULT now()
    )
  `);
}
