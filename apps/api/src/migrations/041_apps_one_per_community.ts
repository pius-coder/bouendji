import type { Queryable } from "../db.js";

export const id = "041_apps_one_per_community";

/**
 * R4 : une seule application par communauté. La contrainte refuse la migration
 * si une donnée existante la viole, avec la liste des communautés en cause,
 * plutôt que de laisser PostgreSQL échouer sur un index sans explication.
 */
export async function up(db: Queryable): Promise<void> {
  const duplicates = await db.query<{ community_id: string; n: number }>(
    `SELECT community_id, count(*)::int AS n FROM apps GROUP BY community_id HAVING count(*) > 1`,
  );
  if (duplicates.length > 0) {
    const list = duplicates.map((row) => `${row.community_id} (${row.n} apps)`).join(", ");
    throw new Error(`041_apps_one_per_community : communautés avec plusieurs applications : ${list}`);
  }
  await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS apps_community_id_uq ON apps(community_id)`);
  await db.query(`ALTER TABLE apps ADD COLUMN IF NOT EXISTS logo_key text`);
}
