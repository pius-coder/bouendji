import type { Queryable } from "../db.js";

/**
 * R6 / B3 : une commande = au plus un abonnement.
 *
 * Aucune ligne n'est supprimée. Si des doublons existent, la migration échoue
 * avec la liste des commandes concernées : la correction est une décision
 * humaine (quel abonnement garder), pas une règle de l'application.
 */
export const id = "064_subscriptions_order_unique";

export async function up(db: Queryable): Promise<void> {
  const duplicates = await db.query<{ order_id: string; n: number }>(
    `SELECT order_id, count(*)::int AS n
       FROM subscriptions
      GROUP BY order_id
     HAVING count(*) > 1
      ORDER BY order_id
      LIMIT 20`,
  );
  if (duplicates.length > 0) {
    const list = duplicates.map((row) => `${row.order_id} (${row.n} abonnements)`).join(", ");
    throw new Error(
      `064_subscriptions_order_unique : ${duplicates.length} commande(s) ont plusieurs abonnements : ${list}. ` +
        "Aucune ligne n'a été supprimée. Corrigez ces doublons à la main, puis relancez la migration.",
    );
  }
  await db.query("CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_order_uidx ON subscriptions(order_id)");
}
