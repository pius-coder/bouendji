/**
 * Le rappel de déploiement est la seule alerte dont l'absence coûte un service.
 * On le teste sans réseau : un `send` injecté remplace Telegram, et le pool est
 * peuplé en SQL — pas besoin du conteneur.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "memory://";
process.env.MASTER_KEY = Buffer.alloc(32, 9).toString("base64");
process.env.JWT_SECRET = "test-secret-test-secret-test-secret";
process.env.DEPLOY_WARN_MINUTES = "30";

const { createDb } = await import("../src/db.js");
const { checkPoolExpiry, newPoolWatchState } = await import("../src/services/poolWatch.js");
const { scrub } = await import("../src/services/telegram.js");

const db = await createDb();

after(async () => {
  await db.close();
});

/** A sender that records every message instead of calling Telegram. */
function recorder(): { sent: string[]; send: (text: string) => Promise<boolean> } {
  const sent: string[] = [];
  return {
    sent,
    send: async (text: string) => {
      sent.push(text);
      return true;
    },
  };
}

async function clearPool(): Promise<void> {
  await db.query("DELETE FROM endpoints");
}

async function addEndpoint(minutesLeft: number, status = "active"): Promise<void> {
  await db.query(
    `INSERT INTO endpoints (id, deployment_key, label, host, port, credential, status, expires_at)
     VALUES ($1, $2, $3, 'node.test', 443, 'x', $4, now() + ($5::int * interval '1 minute'))`,
    [randomUUID(), `k-${randomUUID()}`, "test", status, minutesLeft],
  );
}

test("pool vide : un seul message, puis silence", async () => {
  await clearPool();
  const state = newPoolWatchState();
  const r = recorder();

  const first = await checkPoolExpiry(db, state, { send: r.send, now: new Date("2026-10-20T12:00:00Z") });
  assert.equal(first.sent, true);
  assert.equal(r.sent.length, 1);
  assert.match(r.sent[0]!, /Aucun nœud actif/);

  const second = await checkPoolExpiry(db, state, { send: r.send, now: new Date("2026-10-20T12:05:00Z") });
  assert.equal(second.sent, false);
  assert.equal(r.sent.length, 1, "5 minutes plus tard, l'alerte ne doit pas se répéter");
});

test("nœud confortable : aucune alerte", async () => {
  await clearPool();
  await addEndpoint(120);
  const r = recorder();
  const out = await checkPoolExpiry(db, newPoolWatchState(), { send: r.send, now: new Date() });
  assert.equal(out.sent, false);
  assert.equal(out.minutesLeft, 120);
  assert.equal(r.sent.length, 0);
});

test("seuil atteint : une alerte, avec le nombre de minutes", async () => {
  await clearPool();
  await addEndpoint(12);
  const r = recorder();
  const out = await checkPoolExpiry(db, newPoolWatchState(), { send: r.send, now: new Date() });
  assert.equal(out.sent, true);
  assert.match(r.sent[0]!, /12 min/);
});

test("l'alerte se répète au plus toutes les 15 minutes", async () => {
  await clearPool();
  await addEndpoint(12);
  const state = newPoolWatchState();
  const r = recorder();
  const t0 = new Date();

  await checkPoolExpiry(db, state, { send: r.send, now: t0 });
  await checkPoolExpiry(db, state, { send: r.send, now: new Date(t0.getTime() + 5 * 60_000) });
  assert.equal(r.sent.length, 1);

  await checkPoolExpiry(db, state, { send: r.send, now: new Date(t0.getTime() + 16 * 60_000) });
  assert.equal(r.sent.length, 2, "après 15 minutes, elle revient tant que le nœud n'est pas remplacé");
});

test("un nœud en attente ne compte pas comme disponible", async () => {
  await clearPool();
  await addEndpoint(120, "pending");
  const r = recorder();
  const out = await checkPoolExpiry(db, newPoolWatchState(), { send: r.send, now: new Date() });
  assert.equal(out.activeCount, 0);
  assert.equal(out.sent, true);
  assert.match(r.sent[0]!, /Aucun nœud actif/);
});

test("un nœud expiré ne compte pas non plus", async () => {
  await clearPool();
  await addEndpoint(-5, "active");
  const r = recorder();
  const out = await checkPoolExpiry(db, newPoolWatchState(), { send: r.send, now: new Date() });
  assert.equal(out.activeCount, 0);
  assert.equal(out.sent, true);
});

test("scrub : rien de ce qui identifie un accès ne sort", () => {
  const raw = [
    "node prêt",
    "vless://11111111-2222-3333-4444-555555555555@host:443?path=/ws",
    "jeton Bearer abcdefghijklmnopqrstuvwxyz012345",
  ].join("\n");
  const clean = scrub(raw);
  assert.equal(clean.includes("vless://"), false);
  assert.equal(clean.includes("11111111-2222-3333-4444-555555555555"), false);
  assert.equal(clean.includes("abcdefghijklmnopqrstuvwxyz012345"), false);
  assert.match(clean, /node prêt/);
});
