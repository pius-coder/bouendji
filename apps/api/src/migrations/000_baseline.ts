import type { Queryable } from "../db.js";

/**
 * Migration 000 : la base de référence. `SCHEMA_SQL` (schema.ts) reste la source
 * du schéma de base et continue d'être rejoué à chaque démarrage, parce que les
 * bases en production le contiennent déjà et qu'il est idempotent. Cette
 * migration ne fait rien : elle enregistre dans `schema_migrations` que la base
 * de référence est adoptée, pour que la numérotation commence proprement.
 */
export const id = "000_baseline";

export async function up(_db: Queryable): Promise<void> {
  // Volontairement vide.
}
