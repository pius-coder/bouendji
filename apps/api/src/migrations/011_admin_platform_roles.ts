import type { Queryable } from "../db.js";

/**
 * Rôles plateforme cumulables (`owner`, `reseau`). Remplie depuis la colonne
 * legacy `platform_role` : chaque `owner` existant reçoit son rôle. Idempotente.
 */
export const id = "011_admin_platform_roles";

export async function up(db: Queryable): Promise<void> {
  await db.query(
    `CREATE TABLE IF NOT EXISTS admin_platform_roles (
       admin_id text NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
       role     text NOT NULL CHECK (role IN ('owner', 'reseau')),
       PRIMARY KEY (admin_id, role)
     )`,
  );
  await db.query(
    `INSERT INTO admin_platform_roles (admin_id, role)
     SELECT id, 'owner' FROM admin_users WHERE platform_role = 'owner'
     ON CONFLICT DO NOTHING`,
  );
}
