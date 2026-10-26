import type { Queryable } from "../db.js";

export const id = "044_admin_users_onboarding";

/**
 * Colonnes portées par R1 (numéro WhatsApp, changement de mot de passe) : ajoutées
 * ici avec les mêmes noms et définitions, en `IF NOT EXISTS`, pour que R4 tourne
 * sans R1 fusionné. L'email devient facultatif quand un numéro WhatsApp est donné :
 * le `NOT NULL` d'`admin_users.email` est retiré (exception à la règle « tes
 * colonnes seulement », à coordonner avec R1).
 */
export async function up(db: Queryable): Promise<void> {
  await db.query(`ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS whatsapp_number text`);
  await db.query(`ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT true`);
  await db.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS admin_users_whatsapp_number_uq ON admin_users(whatsapp_number) WHERE whatsapp_number IS NOT NULL`,
  );
  await db.query(`ALTER TABLE admin_users ALTER COLUMN email DROP NOT NULL`);
}
