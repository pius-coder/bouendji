/**
 * Applique les migrations R6 (060 à 065) sur une base de test.
 *
 * Tant que l'exécuteur de migrations (lot R0) n'est pas fusionné dans cette
 * copie, `createDb` ne joue que `SCHEMA_SQL` : ce module rejoue les migrations
 * du lot, dans l'ordre et une seule fois par base. Chaque migration est
 * idempotente, un second appel ne fait donc rien.
 */
import type { Queryable } from "../src/db.js";
import * as m060 from "../src/migrations/060_plans_family.js";
import * as m061 from "../src/migrations/061_plan_night_options.js";
import * as m062 from "../src/migrations/062_orders_night_window.js";
import * as m063 from "../src/migrations/063_subscriptions_quota.js";
import * as m064 from "../src/migrations/064_subscriptions_order_unique.js";
import * as m065 from "../src/migrations/065_pricing_settings.js";

export const R6_MIGRATIONS = [m060, m061, m062, m063, m064, m065] as const;

export async function applyR6Migrations(db: Queryable): Promise<void> {
  for (const migration of R6_MIGRATIONS) {
    await migration.up(db);
  }
}
