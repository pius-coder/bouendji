import type { Queryable } from "../db.js";

/** Rattache un nœud à son créneau de nuit (R8). Nullable : les nœuds existants n'en ont pas. */
export const id = "081_endpoints_night_slot";

export async function up(db: Queryable): Promise<void> {
  await db.query("ALTER TABLE endpoints ADD COLUMN IF NOT EXISTS night_slot_id text REFERENCES night_slots(id)");
  await db.query("CREATE INDEX IF NOT EXISTS endpoints_night_slot_idx ON endpoints(night_slot_id)");
}
