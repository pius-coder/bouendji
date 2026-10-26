import type { Queryable } from "../db.js";

/**
 * R6 : la commande fige la plage choisie et le quota du forfait au moment de
 * l'achat. Le total (`orders.amount_xaf`) reste la seule valeur monétaire ; il
 * vaut prix du forfait + prix de la plage, calculé côté serveur.
 */
export const id = "062_orders_night_window";

export async function up(db: Queryable): Promise<void> {
  await db.query("ALTER TABLE orders ADD COLUMN IF NOT EXISTS night_window text");
  await db.query("ALTER TABLE orders ADD COLUMN IF NOT EXISTS quota_bytes bigint");
  await db.query(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_night_window_check') THEN
        ALTER TABLE orders ADD CONSTRAINT orders_night_window_check
          CHECK (night_window IS NULL OR night_window IN ('20-24', '24-04', '20-04'));
      END IF;
    END $$
  `);
}
