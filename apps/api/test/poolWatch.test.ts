/**
 * Rappels des créneaux de nuit (D119) : 15 min avant le début, relance toutes
 * les 5 min tant qu'aucun nœud n'est actif, fuseau Africa/Douala, verrou contre
 * les doublons, réessai après un envoi échoué. Aucun réseau : `send` est injecté.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "memory://";
process.env.MASTER_KEY = Buffer.alloc(32, 9).toString("base64");
process.env.JWT_SECRET = "test-secret-test-secret-test-secret";
process.env.DEPLOY_WARN_MINUTES = "15";
process.env.DEPLOY_REMIND_EVERY_MINUTES = "5";

const { createDb } = await import("../src/db.js");
const { checkPoolExpiry, doualaDay, ensureNightSlots, slotStart, newPoolWatchState } = await import("../src/services/poolWatch.js");
const { nightReminder, scrub } = await import("../src/services/telegram.js");
const { prepareNightSchema } = await import("./nightFixtures.js");

const db = await createDb();
before(async () => {
  await prepareNightSchema(db);
});
after(async () => {
  await db.close();
});

type Sent = { texts: string[]; ok: boolean };
function recorder(ok = true): { sent: string[]; send: (text: string) => Promise<boolean>; flags: Sent } {
  const sent: string[] = [];
  const flags: Sent = { texts: sent, ok };
  return {
    sent,
    flags,
    send: async (text: string) => {
      sent.push(text);
      return flags.ok;
    },
  };
}

/* ------------------------------------------------------------ fuseau */

test("le jour et l'heure sont ceux de Douala (UTC+1, sans heure d'été)", () => {
  // 20 h à Douala = 19 h UTC ; minuit à Douala = 23 h UTC la veille.
  assert.equal(slotStart("2026-10-26", "20").toISOString(), "2026-10-26T19:00:00.000Z");
  assert.equal(slotStart("2026-10-26", "00").toISOString(), "2026-10-25T23:00:00.000Z");
  // 23 h 30 UTC le 25 = 00 h 30 le 26 à Douala : c'est déjà le 26.
  assert.equal(doualaDay(new Date("2026-10-25T23:30:00Z")), "2026-10-26");
  assert.equal(doualaDay(new Date("2026-10-25T22:30:00Z")), "2026-10-25");
});

test("ensureNightSlots crée deux créneaux par jour, trois jours, sans doublon", async () => {
  const now = new Date("2026-10-26T10:00:00Z");
  await ensureNightSlots(db, now);
  await ensureNightSlots(db, now);
  const rows = await db.query<{ n: number }>(
    "SELECT CAST(count(*) AS int) AS n FROM night_slots WHERE day BETWEEN '2026-10-26' AND '2026-10-28'",
  );
  assert.equal(Number(rows[0]?.n), 6);
  const one = await db.one<{ ends: Date }>("SELECT ends_at AS ends FROM night_slots WHERE id = 'ns_2026-10-26_20'");
  assert.equal(new Date(one!.ends).toISOString(), "2026-10-26T23:00:00.000Z", "fin à minuit de Douala, soit 23 h UTC");
});

/* ------------------------------------------------------------ rappels */

const DAY = "2026-10-27";

test("rien avant 15 min, un rappel à 15 min, puis le verrou tient 5 min", async () => {
  const slot = "ns_2026-10-27_20";
  const start = slotStart(DAY, "20");
  const r = recorder();
  const state = newPoolWatchState();

  const early = await checkPoolExpiry(db, state, { send: r.send, now: new Date(start.getTime() - 20 * 60_000) });
  assert.equal(early.sent, false);
  assert.equal(r.sent.length, 0);

  const first = await checkPoolExpiry(db, state, { send: r.send, now: new Date(start.getTime() - 15 * 60_000) });
  assert.equal(first.sent, true);
  assert.equal(r.sent.length, 1);
  assert.match(r.sent[0]!, /Créneau de nuit dans 15 min/);
  assert.match(r.sent[0]!, /20 h – 24 h/);
  assert.match(r.sent[0]!, /<b>20h00<\/b>/, "heure affichée à Douala");

  const again = await checkPoolExpiry(db, state, { send: r.send, now: new Date(start.getTime() - 11 * 60_000) });
  assert.equal(again.sent, false, "4 minutes après : pas de relance");
  assert.equal(r.sent.length, 1);

  const reminded = await db.one<{ reminded: Date | null }>("SELECT reminded_at AS reminded FROM night_slots WHERE id = $1", [slot]);
  assert.notEqual(reminded?.reminded, null);
});

test("relance toutes les 5 min une fois le créneau commencé, tant qu'aucun nœud n'est actif", async () => {
  const start = slotStart("2026-10-29", "20");
  const r = recorder();
  const state = newPoolWatchState();
  await checkPoolExpiry(db, state, { send: r.send, now: new Date(start.getTime() - 15 * 60_000) });
  await checkPoolExpiry(db, state, { send: r.send, now: new Date(start.getTime() - 10 * 60_000) });
  await checkPoolExpiry(db, state, { send: r.send, now: new Date(start.getTime() + 2 * 60_000) });
  assert.equal(r.sent.length, 3, "15 min avant, 10 min avant, puis au début (après 5 min)");
  assert.match(r.sent[2]!, /en cours/);
  assert.match(r.sent[2]!, /depuis 2 min/);
});

test("un nœud actif pour le créneau fait taire les rappels", async () => {
  const slot = "ns_2026-10-27_00";
  const start = slotStart(DAY, "00");
  // Un nœud actif, lié au créneau de minuit (le créneau 20 h est déjà traité).
  await db.query(
    `INSERT INTO endpoints (id, deployment_key, label, host, port, credential, status, expires_at, night_slot_id)
     VALUES ($1, $2, 'calme-faucon-12', 'node.test', 443, 'x', 'active', $3, $4)`,
    [randomUUID(), `k-${randomUUID()}`, new Date(start.getTime() + 4 * 3_600_000), slot],
  );
  const r = recorder();
  // Une heure après le début : le créneau de 20 h précédent est fini, il ne peut pas rappeler.
  const out = await checkPoolExpiry(db, newPoolWatchState(), { send: r.send, now: new Date(start.getTime() + 60 * 60_000) });
  assert.equal(out.sent, false);
  assert.equal(r.sent.length, 0);
  const row = await db.one<{ state: string }>("SELECT state FROM night_slots WHERE id = $1", [slot]);
  assert.equal(row?.state, "active");
});

test("un envoi échoué libère le verrou : le tick suivant réessaie", async () => {
  const start = slotStart("2026-10-28", "20");
  const state = newPoolWatchState();
  const failing = recorder(false);
  const first = await checkPoolExpiry(db, state, { send: failing.send, now: new Date(start.getTime() - 15 * 60_000) });
  assert.equal(first.sent, false);
  assert.equal(failing.sent.length, 1, "la tentative a eu lieu");

  const working = recorder(true);
  const retry = await checkPoolExpiry(db, state, { send: working.send, now: new Date(start.getTime() - 15 * 60_000 + 60_000) });
  assert.equal(retry.sent, true, "le tick d'après réessaie sans attendre 5 min");
  assert.match(working.sent[0]!, /dans 14 min|dans 15 min/);
});

test("deux instances au même instant : un seul rappel part", async () => {
  const start = slotStart("2026-11-01", "20");
  const now = new Date(start.getTime() - 15 * 60_000);
  const a = recorder();
  const b = recorder();
  await Promise.all([
    checkPoolExpiry(db, newPoolWatchState(), { send: a.send, now }),
    checkPoolExpiry(db, newPoolWatchState(), { send: b.send, now }),
  ]);
  assert.equal(a.sent.length + b.sent.length, 1, "le verrou en base élimine le doublon");
});

/* ------------------------------------------------------------ contenu */

test("le message de rappel ne contient ni configuration, ni UUID, ni clé de déploiement", () => {
  const text = nightReminder({ slot: "00", startsAt: new Date("2026-10-27T23:00:00Z"), minutesLeft: 15, first: true });
  assert.match(text, /minuit – 4 h/);
  assert.equal(/vless:\/\//.test(text), false);
  assert.equal(/nk_[A-Za-z0-9_-]{20,}/.test(text), false);
});

test("scrub : rien de ce qui identifie un accès ne sort", () => {
  const raw = [
    "node prêt",
    "vless://11111111-2222-3333-4444-555555555555@host:443?path=/ws",
    "jeton Bearer abcdefghijklmnopqrstuvwxyz012345",
    "clé nk_abcdefghijklmnopqrstuvwxyz0123456789",
  ].join("\n");
  const clean = scrub(raw);
  assert.equal(clean.includes("vless://"), false);
  assert.equal(clean.includes("11111111-2222-3333-4444-555555555555"), false);
  assert.equal(clean.includes("abcdefghijklmnopqrstuvwxyz012345"), false);
  assert.equal(clean.includes("nk_abcdefghijklmnopqrstuvwxyz0123456789"), false);
  assert.match(clean, /node prêt/);
});
