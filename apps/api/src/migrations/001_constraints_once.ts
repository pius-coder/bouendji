import type { Queryable } from "../db.js";

/**
 * Migration 001 : les CHECK et la contrainte d'unicité qui étaient rejoués à
 * chaque démarrage (DROP puis ADD CONSTRAINT, verrou fort sur la table). Ils ne
 * sont plus dans `SCHEMA_SQL` ; ils passent ici, exécutés une seule fois.
 *
 * Rejouable sans effet de bord : chaque contrainte est supprimée si elle existe
 * puis recréée à l'identique. Les définitions sont celles que le code attend.
 */
export const id = "001_constraints_once";

const CHECKS: ReadonlyArray<{ table: string; name: string; expr: string }> = [
  {
    table: "communities",
    name: "communities_commission_bps_range",
    expr: "commission_bps >= 0 AND commission_bps <= 3000",
  },
  { table: "endpoints", name: "endpoints_tier_check", expr: "tier IN ('free-labs','paid-gcp')" },
  { table: "plans", name: "plans_endpoint_tier_check", expr: "endpoint_tier IN ('free-labs','paid-gcp')" },
];

export async function up(db: Queryable): Promise<void> {
  for (const { table, name, expr } of CHECKS) {
    await db.query(`ALTER TABLE ${table} DROP CONSTRAINT IF EXISTS ${name}`);
    await db.query(`ALTER TABLE ${table} ADD CONSTRAINT ${name} CHECK (${expr})`);
  }
  // Ancienne unicité de courriel, remplacée par l'index (app_id, lower(email)).
  await db.query("ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_key");
}
