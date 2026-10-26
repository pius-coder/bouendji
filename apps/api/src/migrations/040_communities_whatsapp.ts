import type { Queryable } from "../db.js";

export const id = "040_communities_whatsapp";

/**
 * R4 : contacts WhatsApp de la communauté et auteur de sa création.
 * `created_by` est unique quand il est renseigné : un admin ne crée qu'une
 * communauté par ce chemin (POST /v1/admin/onboarding/community).
 */
export async function up(db: Queryable): Promise<void> {
  await db.query(`ALTER TABLE communities ADD COLUMN IF NOT EXISTS whatsapp_group_url text`);
  await db.query(`ALTER TABLE communities ADD COLUMN IF NOT EXISTS contact_whatsapp text`);
  await db.query(`ALTER TABLE communities ADD COLUMN IF NOT EXISTS created_by text REFERENCES admin_users(id)`);
  await db.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS communities_created_by_uq ON communities(created_by) WHERE created_by IS NOT NULL`,
  );
}
