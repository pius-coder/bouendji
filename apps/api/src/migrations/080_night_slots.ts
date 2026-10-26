import type { Queryable } from "../db.js";

/**
 * Créneaux de nuit (D119, D124). Un créneau `20` couvre 20 h - 24 h, `00`
 * couvre 00 h - 4 h, heure `Africa/Douala`. La clé de déploiement n'est jamais
 * stockée en clair : seul son empreinte SHA-256 est gardée, et la clé n'est
 * montrée qu'une fois à la création.
 */
export const id = "080_night_slots";

export async function up(db: Queryable): Promise<void> {
  await db.query(`
    CREATE TABLE IF NOT EXISTS night_slots (
      id                    text PRIMARY KEY,
      day                   date NOT NULL,
      slot                  text NOT NULL CHECK (slot IN ('20','00')),
      starts_at             timestamptz NOT NULL,
      ends_at               timestamptz NOT NULL,
      state                 text NOT NULL DEFAULT 'planned'
                            CHECK (state IN ('planned','deployed','active','missed')),
      claimed_by            text REFERENCES admin_users(id),
      claimed_at            timestamptz,
      deployed_by           text REFERENCES admin_users(id),
      deploy_key_hash       text,
      deploy_key_expires_at timestamptz,
      bound_deployment_key  text,
      endpoint_id           text REFERENCES endpoints(id),
      reminded_at           timestamptz,
      escalated_at          timestamptz,
      created_at            timestamptz NOT NULL DEFAULT now(),
      UNIQUE (day, slot)
    )
  `);
  await db.query("CREATE INDEX IF NOT EXISTS night_slots_ends_idx ON night_slots(ends_at)");
  await db.query("CREATE INDEX IF NOT EXISTS night_slots_key_idx ON night_slots(deploy_key_hash)");
}
