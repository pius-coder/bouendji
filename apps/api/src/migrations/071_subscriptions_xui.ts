import type { Queryable } from "../db.js";

/**
 * Rattachement d'un abonnement limité à un serveur 3x-ui et à son client
 * (chantier-vague1 §4). Additif : aucune colonne existante n'est touchée.
 */
export const id = "071_subscriptions_xui";

export async function up(db: Queryable): Promise<void> {
  await db.query("ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS xui_server_id text REFERENCES xui_servers(id)");
  await db.query("ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS xui_client_email text");
  await db.query(
    "CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_xui_email_idx ON subscriptions(xui_client_email) WHERE xui_client_email IS NOT NULL",
  );
}
