/**
 * Exécuteur de migrations versionnées (R0) : traçage, ordre, transaction par
 * migration, rejeu sans effet, idempotence de la migration 001.
 *
 * Base réelle PGlite (`memory://`), comme le reste de la suite. Les migrations
 * de test sont écrites dans un dossier temporaire et lues comme en production.
 */
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";

import { closeAll } from "./support.js";

const { createDb, listMigrations, runMigrations, MIGRATIONS_DIR } = await import("../src/db.js");

const scratch: string[] = [];
after(async () => {
  for (const dir of scratch) await rm(dir, { recursive: true, force: true });
  await closeAll();
});

async function fixtureDir(files: Record<string, string>): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "vpn-migrations-"));
  scratch.push(dir);
  for (const [name, source] of Object.entries(files)) await writeFile(join(dir, name), source, "utf8");
  return dir;
}

test("la base de référence et la migration 001 sont tracées, et la relance ne fait rien", async () => {
  const db = await createDb("memory://");
  try {
    const ids = (await db.query<{ id: string }>("SELECT id FROM schema_migrations ORDER BY id")).map((r) => r.id);
    // Les lots ajoutent leurs migrations (R1 : 010-012, etc.) : on compare à la
    // liste réellement présente dans le dossier du code, pas à une liste figée.
    const shipped = (await listMigrations(MIGRATIONS_DIR)).map((m) => m.id);
    assert.deepEqual(ids, shipped);
    assert.equal(ids[0], "000_baseline", "la base de référence porte le plus petit numéro");

    assert.deepEqual(await runMigrations(db), [], "rien à appliquer une seconde fois");

    const checks = await db.scalar<number>(
      `SELECT count(*)::int FROM pg_constraint WHERE conname = 'communities_commission_bps_range'`,
    );
    assert.equal(Number(checks), 1, "le CHECK est posé par la migration 001");
    await assert.rejects(
      db.query(`INSERT INTO communities (id, name, slug, commission_bps) VALUES ('com_chk', 'Chk', 'chk', 3500)`),
      "le plafond de commission reste imposé",
    );
  } finally {
    await db.close();
  }
});

test("la liste des migrations est triée par nom et les doublons sont refusés", async () => {
  const shipped = await listMigrations(MIGRATIONS_DIR);
  const ids = shipped.map((m) => m.id);
  assert.deepEqual(ids, [...ids].sort(), "les migrations sont triées par nom");
  assert.equal(ids.length, new Set(ids).size, "aucun doublon dans le dossier du lot");

  const dir = await fixtureDir({
    "010_b.ts": "export const id = '010_b';",
    "002_a.ts": "export const id = '002_a';",
    "002_a.js": "export const id = '002_a';",
    "notes.md": "ignoré",
  });
  await assert.rejects(listMigrations(dir), /identifiant en double 002_a/);
});

test("ordre d'application, transaction par migration : une erreur n'annule que la sienne", async () => {
  const dir = await fixtureDir({
    "900_ok.ts": `export const id = "900_ok";
export async function up(db: { query: (s: string) => Promise<unknown> }) {
  await db.query("CREATE TABLE ok_table (x int)");
}`,
    "901_fail.ts": `export const id = "901_fail";
export async function up(db: { query: (s: string) => Promise<unknown> }) {
  await db.query("CREATE TABLE half_table (x int)");
  throw new Error("boom");
}`,
    "902_never.ts": `export const id = "902_never";
export async function up(db: { query: (s: string) => Promise<unknown> }) {
  await db.query("CREATE TABLE never_table (x int)");
}`,
  });

  const db = await createDb("memory://");
  try {
    await assert.rejects(runMigrations(db, dir), /boom/);

    assert.ok(await db.scalar("SELECT to_regclass('ok_table')"), "la migration réussie reste appliquée");
    assert.equal(await db.scalar("SELECT to_regclass('half_table')"), null, "la migration en échec est annulée");
    assert.equal(await db.scalar("SELECT to_regclass('never_table')"), null, "les suivantes ne sont pas tentées");

    const traced = (await db.query<{ id: string }>("SELECT id FROM schema_migrations ORDER BY id")).map((r) => r.id);
    assert.ok(traced.includes("900_ok"));
    assert.ok(!traced.includes("901_fail"));
    assert.ok(!traced.includes("902_never"));
  } finally {
    await db.close();
  }
});

test("la migration 001 peut être rejouée sans erreur ni perte de contrainte", async () => {
  const { up } = (await import("../src/migrations/001_constraints_once.js")) as {
    up: (db: { query: (sql: string) => Promise<unknown> }) => Promise<void>;
  };
  const db = await createDb("memory://");
  try {
    await up(db);
    await up(db);
    const checks = await db.scalar<number>(
      `SELECT count(*)::int FROM pg_constraint WHERE conname IN
         ('communities_commission_bps_range', 'endpoints_tier_check', 'plans_endpoint_tier_check')`,
    );
    assert.equal(Number(checks), 3);
  } finally {
    await db.close();
  }
});
