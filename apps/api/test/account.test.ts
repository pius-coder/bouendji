/**
 * `GET /v1/me/stats` et `GET /v1/me/referral`, plus le `referralCode` de
 * l'inscription.
 *
 * - le code parrain est tiré une fois puis stable ;
 * - une inscription avec ce code est comptée chez le parrain ;
 * - un code inconnu est refusé en 400, pas ignoré ;
 * - les statistiques somment `usage_daily` (source `device`) du compte.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";

const { app, db, call, closeAll, deviceClient, enrollDevice, seedApp, signProof } = await import("./support.js");
const { registerAccountRoutes } = await import("../src/routes/account.js");
const { registerTelemetryRoutes } = await import("../src/routes/telemetry.js");

if (!app.hasRoute({ method: "GET", url: "/v1/me/stats" })) registerAccountRoutes(app, db);
if (!app.hasRoute({ method: "POST", url: "/v1/me/telemetry" })) registerTelemetryRoutes(app, db);

const seed = await seedApp({ deviceLimit: 4 });
after(closeAll);

let counter = 0;

async function register(extra: Record<string, unknown> = {}) {
  const device = await enrollDevice({ deviceName: "Pixel compte" });
  counter += 1;
  const payload = {
    appId: seed.appId,
    email: `compte-${randomUUID().slice(0, 8)}@example.test`,
    password: "mot-de-passe-de-test",
    name: "Testeur compte",
    phone: `+2376${String(counter).padStart(2, "0")}${String(Date.now()).slice(-6)}`,
    ...extra,
  };
  const body = JSON.stringify(payload);
  const res = await call("POST", "/v1/auth/register", {
    payload,
    headers: { "x-device-token": device.deviceToken, ...signProof(device.keys.signing, "POST", "/v1/auth/register", body) },
  });
  return { res, device };
}

async function account() {
  const { res, device } = await register();
  assert.equal(res.status, 201, res.text);
  return deviceClient({ accessToken: String(res.body.accessToken), signing: device.keys.signing });
}

test("le code parrain est tiré une fois puis reste le même", async () => {
  const client = await account();
  const first = await client("GET", "/v1/me/referral");
  assert.equal(first.status, 200, first.text);
  assert.match(String(first.body.code), /^[A-Z2-9]{6}$/);
  assert.equal(first.body.invited, 0);
  const second = await client("GET", "/v1/me/referral");
  assert.equal(second.body.code, first.body.code);
});

test("une inscription avec le code est comptée chez le parrain", async () => {
  const referrer = await account();
  const code = String((await referrer("GET", "/v1/me/referral")).body.code);
  const { res } = await register({ referralCode: code.toLowerCase() });
  assert.equal(res.status, 201, res.text);
  const after = await referrer("GET", "/v1/me/referral");
  assert.equal(after.body.invited, 1);
});

test("un code parrain inconnu est refusé, pas ignoré", async () => {
  const { res } = await register({ referralCode: "ZZZZZZ" });
  assert.equal(res.status, 400, res.text);
  assert.equal(res.body.error?.code, "VALIDATION_FAILED");
});

test("les statistiques somment l'usage déclaré par l'appareil", async () => {
  const client = await account();
  const empty = await client("GET", "/v1/me/stats");
  assert.equal(empty.status, 200, empty.text);
  assert.equal(empty.body.seconds, 0);

  const day = new Date().toISOString().slice(0, 10);
  const sent = await client("POST", "/v1/me/telemetry", { usage: { day, bytesUp: 1_000, bytesDown: 9_000, seconds: 120 } });
  assert.ok(sent.status < 300, sent.text);

  const stats = await client("GET", "/v1/me/stats");
  assert.equal(stats.body.bytesUp, 1_000);
  assert.equal(stats.body.bytesDown, 9_000);
  assert.equal(stats.body.seconds, 120);
  assert.equal(stats.body.todayBytes, 10_000);
});
