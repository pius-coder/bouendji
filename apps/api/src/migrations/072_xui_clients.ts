import type { Queryable } from "../db.js";

/**
 * Identité VLESS d'un abonnement limité sur 3x-ui, et sa consommation lue.
 *
 * - `uuid_sealed` : UUID du client, scellé avec MASTER_KEY (c'est un identifiant
 *   de connexion, il ne se stocke pas en clair).
 * - `confirmed_at` : posé seulement après que le panneau a accepté la création.
 *   Tant qu'il est NULL, le bundle ne sert pas ce client : il n'existe pas encore
 *   côté panneau.
 * - `used_bytes` : GREATEST à chaque lecture. Un panneau redémarré peut perdre
 *   ses compteurs (knowledge/60-research/3x-ui.md), la consommation ne recule pas.
 */
export const id = "072_xui_clients";

export async function up(db: Queryable): Promise<void> {
  await db.query(`
    CREATE TABLE IF NOT EXISTS xui_clients (
      subscription_id text PRIMARY KEY REFERENCES subscriptions(id) ON DELETE CASCADE,
      uuid_sealed     text NOT NULL,
      used_bytes      bigint NOT NULL DEFAULT 0,
      confirmed_at    timestamptz,
      read_at         timestamptz,
      updated_at      timestamptz NOT NULL DEFAULT now()
    )
  `);
}
