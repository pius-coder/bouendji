/**
 * Verdict de santé (D48/D50/D63) et probation d'un nœud `down` (audit R8, §6.3).
 * La décision est pure : pas de base, pas de réseau.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

const { decideHealth, PROBATION_MINUTES } = await import("../src/services/health.js");

const NOW = new Date("2026-10-26T12:00:00Z");
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000);

const base = { doubters: 0, differential: false, now: NOW };

test("la probation dure 30 minutes, comme app.ts", () => {
  assert.equal(PROBATION_MINUTES, 30);
});

test("trois appareils en succès rendent healthy un nœud non down", () => {
  assert.deepEqual(decideHealth({ ...base, successes: 3, current: "unknown", downSince: null }), {
    health: "healthy",
    reason: "reports",
  });
  assert.deepEqual(decideHealth({ ...base, successes: 3, current: "degraded", downSince: null }), {
    health: "healthy",
    reason: "reports",
  });
});

test("un nœud down avec trois succès, dans la probation : aucun changement", () => {
  assert.equal(decideHealth({ ...base, successes: 3, current: "down", downSince: minutesAgo(5) }), null);
  assert.equal(decideHealth({ ...base, successes: 3, current: "down", downSince: minutesAgo(29) }), null);
});

test("un nœud down dont la probation est écoulée repasse unknown, pas healthy", () => {
  const verdict = decideHealth({ ...base, successes: 3, current: "down", downSince: minutesAgo(31) });
  assert.deepEqual(verdict, { health: "unknown", reason: "probation" });
});

test("sans horodatage de descente, un down ne se lève pas (fail closed)", () => {
  assert.equal(decideHealth({ ...base, successes: 3, current: "down", downSince: null }), null);
});

test("deux appareils ne suffisent pas à condamner un nœud", () => {
  assert.equal(decideHealth({ ...base, successes: 0, doubters: 2, current: "unknown", downSince: null }), null);
});

test("trois appareils en échec : down, raison reports:<n>", () => {
  assert.deepEqual(decideHealth({ ...base, successes: 0, doubters: 3, current: "healthy", downSince: null }), {
    health: "down",
    reason: "reports:3",
  });
});

test("un témoin différentiel suffit : down, raison witness", () => {
  assert.deepEqual(decideHealth({ ...base, successes: 1, differential: true, current: "unknown", downSince: null }), {
    health: "down",
    reason: "witness",
  });
});
