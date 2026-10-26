/**
 * Applique les migrations admin (010-019) à une base de test.
 *
 * Provisoire : l'exécuteur de migrations (lot R0) n'est pas dans cette copie.
 * Quand il sera fusionné, ce helper peut disparaître : les migrations sont
 * idempotentes, donc rejouer `up()` ne casse rien.
 */
import type { Queryable } from "../src/db.js";
import * as account from "../src/migrations/010_admin_users_account.js";
import * as platformRoles from "../src/migrations/011_admin_platform_roles.js";
import * as sessions from "../src/migrations/012_admin_sessions.js";

const ADMIN_MIGRATIONS = [account, platformRoles, sessions];

export async function applyAdminMigrations(db: Queryable): Promise<void> {
  for (const migration of ADMIN_MIGRATIONS) {
    await migration.up(db);
  }
}
