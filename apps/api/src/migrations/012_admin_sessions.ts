import type { Queryable } from "../db.js";

/**
 * Sessions administrateur révocables. Le jeton porte l'identifiant de session
 * (claim `sid`) ; `requireAdmin` refuse une session absente ou révoquée.
 */
export const id = "012_admin_sessions";

export async function up(db: Queryable): Promise<void> {
  await db.query(
    `CREATE TABLE IF NOT EXISTS admin_sessions (
       id           text PRIMARY KEY,
       admin_id     text NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
       created_at   timestamptz NOT NULL DEFAULT now(),
       last_seen_at timestamptz NOT NULL DEFAULT now(),
       user_agent   text,
       revoked_at   timestamptz
     )`,
  );
  await db.query("CREATE INDEX IF NOT EXISTS admin_sessions_admin_idx ON admin_sessions (admin_id)");
}
