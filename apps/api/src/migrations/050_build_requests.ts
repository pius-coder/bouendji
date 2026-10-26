import type { Queryable } from "../db.js";

export const id = "050_build_requests";

/**
 * Statuts d'un build (D117). `draft`, `requested` et `rejected` sont ajoutés
 * aux statuts techniques existants : `requested` attend la validation de
 * l'owner, `rejected` porte un motif, `draft` réserve un brouillon futur.
 *
 * Colonnes : `requested_by` (admin qui a demandé), `approved_by` (owner qui a
 * tranché, validation **ou** refus), `reject_reason` (motif, 280 caractères au
 * plus).
 */
const STATUSES = [
  "draft",
  "requested",
  "rejected",
  "queued",
  "running",
  "succeeded",
  "failed",
  "cancelled",
] as const;

/**
 * Idempotente : rejouée sur une base déjà migrée, elle ne change rien. Ne
 * supprime aucune donnée ; la contrainte de statut n'accepte que des valeurs
 * déjà présentes ou nouvelles, jamais une valeur qui casserait une ligne
 * existante (toutes les lignes actuelles sont dans la liste).
 */
export async function up(db: Queryable): Promise<void> {
  await db.query("ALTER TABLE builds ADD COLUMN IF NOT EXISTS requested_by text");
  await db.query("ALTER TABLE builds ADD COLUMN IF NOT EXISTS approved_by text");
  await db.query("ALTER TABLE builds ADD COLUMN IF NOT EXISTS reject_reason text");

  await db.query("ALTER TABLE builds DROP CONSTRAINT IF EXISTS builds_reject_reason_length");
  await db.query(
    `ALTER TABLE builds ADD CONSTRAINT builds_reject_reason_length
       CHECK (reject_reason IS NULL OR char_length(reject_reason) <= 280)`,
  );

  const list = STATUSES.map((status) => `'${status}'`).join(", ");
  await db.query("ALTER TABLE builds DROP CONSTRAINT IF EXISTS builds_status_check");
  await db.query(`ALTER TABLE builds ADD CONSTRAINT builds_status_check CHECK (status IN (${list}))`);
}
