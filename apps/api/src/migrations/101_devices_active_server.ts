import type { Queryable } from "../db.js";

/**
 * Ajout de la colonne last_active_server_id sur devices
 * pour garder la trace du serveur sur lequel l'appareil est connecté.
 */
export const id = "101_devices_active_server";

export async function up(db: Queryable): Promise<void> {
  await db.query("ALTER TABLE devices ADD COLUMN IF NOT EXISTS last_active_server_id text NULL");
}
