/**
 * Écrit `openapi.json` sans base de données.
 *
 * `@fastify/swagger` collecte les schémas au moment de l'enregistrement des
 * routes : aucune requête n'est servie, donc un `Queryable` vide suffit. C'est
 * ce fichier que la CI publie et que les générateurs de SDK consomment.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { buildApp } from "../app.js";
import type { Database, Queryable, Row } from "../db.js";

const empty: Queryable = {
  async query<T = Row>(): Promise<T[]> {
    return [];
  },
  async one<T = Row>(): Promise<T | null> {
    return null;
  },
  async scalar<T = unknown>(): Promise<T | null> {
    return null;
  },
};

const db: Database = {
  ...empty,
  async tx<T>(fn: (q: Queryable) => Promise<T>): Promise<T> {
    return fn(empty);
  },
  async close(): Promise<void> {
    /* rien à fermer */
  },
};

const app = await buildApp({ db });
await app.ready();

const out = resolve(process.cwd(), "openapi.json");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(app.swagger(), null, 2)}\n`, "utf8");
await app.close();

console.log(`openapi.json écrit : ${out}`);
