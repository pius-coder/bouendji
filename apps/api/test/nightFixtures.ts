/**
 * Schéma des créneaux de nuit pour les tests de ce lot.
 *
 * Dans la copie du lot R8, il n'existe pas encore d'exécuteur de migrations
 * (R0) ni les colonnes de R1 : `admin_users.telegram_chat_id` et la table
 * `admin_platform_roles`. Ce module les crée **pour les tests seulement**, puis
 * applique les migrations 080 et 081 du lot.
 */
import type { Database } from "../src/db.js";

export async function prepareNightSchema(db: Database): Promise<void> {
  await db.query("ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS telegram_chat_id text");
  await db.query(
    `CREATE TABLE IF NOT EXISTS admin_platform_roles (
       admin_id text NOT NULL REFERENCES admin_users(id),
       role     text NOT NULL CHECK (role IN ('owner', 'reseau')),
       PRIMARY KEY (admin_id, role)
     )`,
  );
  const m080 = await import("../src/migrations/080_night_slots.js");
  const m081 = await import("../src/migrations/081_endpoints_night_slot.js");
  await m080.up(db);
  await m081.up(db);
}

/** Un administrateur de test, avec ses rôles plateforme (`owner` legacy, `reseau`). */
export async function insertAdmin(
  db: Database,
  input: { id: string; platformRole?: "none" | "owner"; reseau?: boolean; telegramChatId?: string | null; active?: boolean },
): Promise<void> {
  await db.query(
    `INSERT INTO admin_users (id, email, password_hash, name, role, platform_role, active, telegram_chat_id)
     VALUES ($1, $2, 'scrypt$16384$8$1$x$y', $3, $4, $5, $6, $7)`,
    [
      input.id,
      `${input.id}@example.test`,
      `Membre ${input.id}`,
      input.platformRole === "owner" ? "platform" : "partner",
      input.platformRole ?? "none",
      input.active ?? true,
      input.telegramChatId ?? null,
    ],
  );
  if (input.reseau) {
    await db.query("INSERT INTO admin_platform_roles (admin_id, role) VALUES ($1, 'reseau')", [input.id]);
  }
}
