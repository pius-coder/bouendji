/**
 * Schéma du lot R7 pour les tests, et colonnes des lots R6/R8 absentes de cette
 * copie (chantier-vague1 §4). **Test seulement** : rien ici n'est une migration.
 *
 * - Les migrations 070-073 sont jouées avec leur `up()`, en attendant l'exécuteur
 *   de R0 (`src/migrations/` ne contient pas encore son runner dans cette copie).
 * - Les colonnes R6 (`plans.family`, `subscriptions.quota_bytes`,
 *   `subscriptions.night_window`, `subscriptions.exhausted_at`) et R8
 *   (`night_slots`, `endpoints.night_slot_id`) sont ajoutées en `IF NOT EXISTS`,
 *   dans la forme que les lots R6/R8 donneront. Elles restent NULL pour les
 *   forfaits existants, donc les tests historiques suivent le chemin des niveaux.
 *
 * À retirer au merge de R0, R6 et R8 : les migrations de ces lots font foi.
 */
import type { Database } from "../src/db.js";

export async function applyXuiTestSchema(db: Database): Promise<void> {
  const migrations = [
    await import("../src/migrations/070_xui_servers.js"),
    await import("../src/migrations/071_subscriptions_xui.js"),
    await import("../src/migrations/072_xui_clients.js"),
    await import("../src/migrations/073_xui_jobs.js"),
  ];
  for (const migration of migrations) await migration.up(db);

  await db.query("ALTER TABLE plans ADD COLUMN IF NOT EXISTS family text");
  await db.query("ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS quota_bytes bigint");
  await db.query("ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS night_window text");
  await db.query("ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS exhausted_at timestamptz");
  await db.query("ALTER TABLE endpoints ADD COLUMN IF NOT EXISTS night_slot_id text");
  await db.query(`
    CREATE TABLE IF NOT EXISTS night_slots (
      id                    text PRIMARY KEY,
      day                   date NOT NULL,
      slot                  text NOT NULL CHECK (slot IN ('20', '00')),
      starts_at             timestamptz NOT NULL,
      ends_at               timestamptz NOT NULL,
      state                 text NOT NULL DEFAULT 'planned',
      deploy_key_hash       text,
      deploy_key_expires_at timestamptz,
      deployed_by           text,
      endpoint_id           text,
      reminded_at           timestamptz,
      escalated_at          timestamptz,
      UNIQUE (day, slot)
    )
  `);
}
