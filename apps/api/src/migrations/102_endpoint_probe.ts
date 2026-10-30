import type { Queryable } from "../db.js";

/**
 * Sonde serveur d'un nœud (2026-10-30) : l'état n'est plus seulement une
 * déclaration des téléphones. Le serveur mesure lui-même la joignabilité
 * TCP du point d'entrée, les rapports clients restent une seconde source.
 *
 * `probe_ok = NULL` signifie « jamais sondé » ; l'ancien comportement
 * (verdict client seul) s'applique alors.
 */
export const id = "102_endpoint_probe";

export async function up(db: Queryable): Promise<void> {
  await db.query(`
    ALTER TABLE endpoints
      ADD COLUMN IF NOT EXISTS probe_ok boolean,
      ADD COLUMN IF NOT EXISTS probe_latency_ms integer,
      ADD COLUMN IF NOT EXISTS probe_error text,
      ADD COLUMN IF NOT EXISTS probed_at timestamptz
  `);
}
