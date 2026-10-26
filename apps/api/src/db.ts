import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import pg from "pg";
import { SCHEMA_SQL } from "./schema.js";
import { env } from "./config.js";

export type Row = Record<string, unknown>;

export interface Queryable {
  query<T = Row>(sql: string, params?: unknown[]): Promise<T[]>;
  one<T = Row>(sql: string, params?: unknown[]): Promise<T | null>;
  scalar<T = unknown>(sql: string, params?: unknown[]): Promise<T | null>;
}

export interface Database extends Queryable {
  tx<T>(fn: (q: Queryable) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

function makeHelpers(run: (sql: string, params?: unknown[]) => Promise<Row[]>): Queryable {
  return {
    query: (sql, params) => run(sql, params) as never,
    async one<T = Row>(sql: string, params?: unknown[]): Promise<T | null> {
      const rows = await run(sql, params);
      return (rows[0] ?? null) as T | null;
    },
    async scalar(sql, params) {
      const row = (await run(sql, params))[0];
      if (!row) return null;
      const values = Object.values(row);
      return (values[0] ?? null) as never;
    },
  };
}

/* ------------------------------------------------------------------------
 * Migrations versionnées (R0).
 *
 * `SCHEMA_SQL` reste rejoué à chaque démarrage (bases existantes). Tout ce qui
 * ne doit pas se rejouer (DROP/ADD CONSTRAINT, backfill) vit dans
 * `apps/api/src/migrations/NNN_slug.ts` : exécuté une seule fois, tracé dans
 * `schema_migrations`. Chaque migration a sa transaction ; une erreur l'annule
 * et arrête le démarrage, jamais de schéma à moitié appliqué.
 * ------------------------------------------------------------------------ */

export interface Migration {
  /** Égal au nom du fichier sans extension, ex. `001_constraints_once`. */
  readonly id: string;
  up(db: Queryable): Promise<void>;
}

export const MIGRATIONS_DIR = fileURLToPath(new URL("./migrations/", import.meta.url));

/** `NNN_slug.ts` (tsx) ou `NNN_slug.js` (dist compilé). Les `.d.ts` sont exclus. */
const MIGRATION_FILE = /^(\d{3}_[a-z0-9_]+)\.(ts|js)$/;

/** Lit le dossier : identifiant et fichier de chaque migration, triés par nom. */
export async function listMigrations(dir = MIGRATIONS_DIR): Promise<Array<{ id: string; file: string }>> {
  const found = (await readdir(dir))
    .map((file) => ({ file, match: MIGRATION_FILE.exec(file) }))
    .filter((entry): entry is { file: string; match: RegExpExecArray } => entry.match !== null)
    .map(({ file, match }) => ({ id: match[1] as string, file }))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (let i = 1; i < found.length; i += 1) {
    if (found[i - 1]?.id === found[i]?.id) throw new Error(`migrations : identifiant en double ${found[i]?.id}`);
  }
  return found;
}

/**
 * Applique les migrations non tracées, dans l'ordre des noms. Renvoie les
 * identifiants appliqués pendant cet appel. Le verrou consultatif de session est
 * tenu par l'appelant (`createDb`) : deux instances ne migrent pas en même temps.
 */
export async function runMigrations(db: Database, dir = MIGRATIONS_DIR): Promise<string[]> {
  await db.query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       id         text PRIMARY KEY,
       applied_at timestamptz NOT NULL DEFAULT now()
     )`,
  );
  const done = new Set((await db.query<{ id: string }>("SELECT id FROM schema_migrations")).map((row) => row.id));
  const applied: string[] = [];
  for (const { id, file } of await listMigrations(dir)) {
    if (done.has(id)) continue;
    const mod = (await import(pathToFileURL(join(dir, file)).href)) as Partial<Migration>;
    if (mod.id !== id || typeof mod.up !== "function") {
      throw new Error(`migration ${id} : l'export \`id\` ou \`up\` ne correspond pas au fichier`);
    }
    await db.tx(async (q) => {
      await q.query("SET LOCAL lock_timeout = '10s'");
      await (mod as Migration).up(q);
      await q.query("INSERT INTO schema_migrations (id, applied_at) VALUES ($1, now())", [id]);
    });
    applied.push(id);
  }
  return applied;
}

export async function createDb(url = env.databaseUrl): Promise<Database> {
  if (url.startsWith("postgres://") || url.startsWith("postgresql://")) {
    const pool = new pg.Pool({ connectionString: url, max: 10 });
    const helpers = makeHelpers(async (sql, params) => {
      const res = await pool.query(sql, params as never[]);
      return res.rows as Row[];
    });
    const db: Database = {
      ...helpers,
      async tx(fn) {
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          const inner = makeHelpers(async (sql, params) => {
            const res = await client.query(sql, params as never[]);
            return res.rows as Row[];
          });
          const result = await fn(inner);
          await client.query("COMMIT");
          return result;
        } catch (err) {
          await client.query("ROLLBACK");
          throw err;
        } finally {
          client.release();
        }
      },
      async close() {
        await pool.end();
      },
    };
    /*
     * Le schéma est rejoué à chaque démarrage à froid. Deux instances qui
     * démarrent ensemble se disputeraient le catalogue (ALTER, DROP CONSTRAINT).
     * Le verrou consultatif est pris **sur la même connexion** : la variante
     * `pg_advisory_xact_lock` ne conviendrait pas, et le pooler en mode
     * transaction ne conserve pas les verrous de session — d'où l'URL directe.
     */
    const client = await pool.connect();
    try {
      await client.query("SET lock_timeout = '10s'");
      await client.query("SELECT pg_advisory_lock($1)", [727_001]);
      await client.query(SCHEMA_SQL);
      // Migrations versionnées : sous le même verrou que le schéma de base.
      await runMigrations(db);
    } finally {
      await client.query("SELECT pg_advisory_unlock($1)", [727_001]).catch(() => undefined);
      client.release();
    }
    return db;
  }

  const pglite = new PGlite(url);
  await pglite.waitReady;
  const helpers = makeHelpers(async (sql, params) => {
    const res = await pglite.query(sql, params as never[]);
    return res.rows as Row[];
  });
  const db: Database = {
    ...helpers,
    async tx<T>(fn: (q: Queryable) => Promise<T>): Promise<T> {
      // PGlite transactions are serialized; the callback receives a scoped runner.
      return pglite.transaction(async (tx) => {
        const inner = makeHelpers(async (sql, params) => {
          const res = await tx.query(sql, params as never[]);
          return res.rows as Row[];
        });
        return fn(inner);
      }) as Promise<T>;
    },
    async close() {
      await pglite.close();
    },
  };
  await pglite.exec(SCHEMA_SQL);
  await runMigrations(db);
  return db;
}

/** Postgres unique violation. */
export function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code?: string }).code === "23505";
}
