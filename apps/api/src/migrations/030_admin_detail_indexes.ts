import type { Queryable } from "../db.js";

export const id = "030_admin_detail_indexes";

/**
 * Index de lecture des fiches et des listes par curseur du lot R3. Additif :
 * `IF NOT EXISTS`, aucune donnée touchée, rejouable sans effet.
 */
export async function up(db: Queryable): Promise<void> {
  // Liste des abonnés et des appareils par communauté, tri (created_at, id).
  await db.query(`CREATE INDEX IF NOT EXISTS users_community_created_idx ON users(community_id, created_at DESC, id DESC)`);
  // Commissions d'une communauté, page suivante par curseur.
  await db.query(
    `CREATE INDEX IF NOT EXISTS commissions_community_created_idx ON commissions(community_id, created_at DESC, id DESC)`,
  );
  // File des versements : par communauté, puis globale (finance).
  await db.query(`CREATE INDEX IF NOT EXISTS payouts_community_status_idx ON payouts(community_id, status, created_at)`);
  await db.query(`CREATE INDEX IF NOT EXISTS payouts_status_created_idx ON payouts(status, created_at)`);
  // Fiche abonné : fichiers de secours récents.
  await db.query(`CREATE INDEX IF NOT EXISTS offline_bundles_user_created_idx ON offline_bundles(user_id, created_at DESC)`);
  // Résumé : ventes payées par communauté et par jour.
  await db.query(`CREATE INDEX IF NOT EXISTS orders_community_paid_idx ON orders(community_id, status, paid_at)`);
  // Résumé : consommation du jour, toutes communautés confondues par appareil.
  await db.query(`CREATE INDEX IF NOT EXISTS usage_daily_day_source_idx ON usage_daily(day, source)`);
}
