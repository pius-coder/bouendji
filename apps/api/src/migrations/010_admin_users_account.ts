import type { Queryable } from "../db.js";

/**
 * Compte admin : numéro WhatsApp (connexion et contact), drapeau de changement
 * de mot de passe, identifiant Telegram. Le drapeau vaut `true` par défaut :
 * les comptes déjà en production doivent changer leur mot de passe au premier
 * passage, et aucune mise à jour ponctuelle n'est nécessaire.
 */
export const id = "010_admin_users_account";

export async function up(db: Queryable): Promise<void> {
  await db.query("ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS whatsapp_number text");
  await db.query(
    "CREATE UNIQUE INDEX IF NOT EXISTS admin_users_whatsapp_number_key ON admin_users (whatsapp_number)",
  );
  await db.query(
    "ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT true",
  );
  await db.query("ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS telegram_chat_id text");
}
