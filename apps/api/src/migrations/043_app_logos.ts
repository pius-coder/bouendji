import type { Queryable } from "../db.js";

export const id = "043_app_logos";

/**
 * R4 : stockage PROVISOIRE du logo en base. Le bucket R2 n'est pas accessible
 * en écriture depuis l'API dans cette copie (non vérifié). `apps.logo_key`
 * pointe ici tant que la clé R2 n'est pas câblée. 1 Mo décodé = environ 1 398 104
 * caractères base64.
 */
export async function up(db: Queryable): Promise<void> {
  await db.query(`
    CREATE TABLE IF NOT EXISTS app_logos (
      app_id     text PRIMARY KEY REFERENCES apps(id),
      mime       text NOT NULL CHECK (mime IN ('image/png', 'image/svg+xml')),
      sha256     text NOT NULL,
      data_b64   text NOT NULL CHECK (char_length(data_b64) <= 1398104),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
}
