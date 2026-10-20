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
    await pool.query(SCHEMA_SQL);
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
  return db;
}

/** Postgres unique violation. */
export function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code?: string }).code === "23505";
}
