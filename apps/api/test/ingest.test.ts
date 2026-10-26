/**
 * Ingestion contract tests.
 *
 * Environment variables are set *before* the dynamic imports below: config.ts
 * reads process.env at module evaluation, so a static import would freeze the
 * defaults (and open a file-backed PGlite in the repo).
 */
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { after, test } from "node:test";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "memory://";
process.env.MASTER_KEY = Buffer.alloc(32, 9).toString("base64");
process.env.ENDPOINT_INGEST_SECRET = "test-ingest-secret";
process.env.ENDPOINT_AUTO_APPROVE = "true";
process.env.ENDPOINT_DEFAULT_TTL = "14400";
process.env.ENDPOINT_DRAIN_LEAD = "900";

const { createDb } = await import("../src/db.js");
const { buildApp } = await import("../src/app.js");
const { env } = await import("../src/config.js");
const { sweepEndpoints } = await import("../src/services/endpoints.js");
const { buildVlessUri, parseVlessUri } = await import("../src/lib/vless.js");
const { sealForDevice, openEnvelope } = await import("../src/lib/crypto.js");

const TOKEN = "Bearer test-ingest-secret";
const auth = { authorization: TOKEN };
const url = (path: string) => `/v1/internal/endpoints/${path}`;

const db = await createDb();
await (await import("./r6schema.js")).applyR6Migrations(db);
const app = await buildApp({ db });

// Test-only probe: proves the custom JSON parser kept the exact bytes.
app.post("/__test/echo-raw", async (req) => ({ raw: req.rawBody ?? null, body: req.body ?? null }));

after(async () => {
  await app.close();
  await db.close();
});

async function revision(): Promise<number> {
  return Number(await db.scalar<number>("SELECT revision FROM pool_state WHERE id = 'pool'"));
}

async function post(path: string, payload: unknown, headers: Record<string, string> = auth) {
  const res = await app.inject({ method: "POST", url: url(path), headers, payload: payload as never });
  return { status: res.statusCode, body: res.json() as Record<string, never> };
}

const register = (deploymentKey: string, extra: Record<string, unknown> = {}) =>
  post("register", {
    deployment_key: deploymentKey,
    public_host: "node1.example.net",
    region: "eu",
    ...extra,
  });

const ready = (deploymentKey: string) => post("ready", { deployment_key: deploymentKey });
const beat = (deploymentKey: string, extra: Record<string, unknown> = {}) =>
  post("heartbeat", { deployment_key: deploymentKey, ...extra });

test("register est idempotent : même clé, même identité, même expiration", async () => {
  const first = await register("idem-key");
  assert.equal(first.status, 200);
  assert.ok(first.body.endpoint_id);
  assert.ok(first.body.uuid);
  assert.ok(first.body.ws_path);
  assert.equal(first.body.status, "pending");
  assert.equal(typeof first.body.pool_revision, "number");

  const second = await register("idem-key");
  assert.equal(second.status, 200);
  assert.equal(second.body.endpoint_id, first.body.endpoint_id);
  assert.equal(second.body.uuid, first.body.uuid);
  assert.equal(second.body.ws_path, first.body.ws_path);
  assert.equal(second.body.expires_at, first.body.expires_at);

  const rows = await db.query("SELECT id FROM endpoints WHERE deployment_key = $1", ["idem-key"]);
  assert.equal(rows.length, 1, "un redémarrage ne doit pas créer une seconde ligne");
});

test("un second register n'étend pas expires_at", async () => {
  const first = await register("ttl-key");
  const stored = await db.scalar<string>("SELECT expires_at::text FROM endpoints WHERE deployment_key = $1", ["ttl-key"]);

  await new Promise((resolve) => setTimeout(resolve, 25));

  const second = await register("ttl-key");
  assert.equal(second.body.expires_at, first.body.expires_at, "l'expiration ne doit pas bouger");
  const after = await db.scalar<string>("SELECT expires_at::text FROM endpoints WHERE deployment_key = $1", ["ttl-key"]);
  assert.equal(after, stored);
});

test("register sur une clé expirée renvoie 409, jamais une résurrection", async () => {
  const first = await register("dead-key");
  assert.equal(first.status, 200);
  await db.query("UPDATE endpoints SET expires_at = now() - interval '1 second' WHERE deployment_key = $1", ["dead-key"]);

  const retry = await register("dead-key");
  assert.equal(retry.status, 409);
  assert.equal(retry.body.error.code, "CONFLICT");
});

test("ready passe en active et ne bump la révision qu'une fois", async () => {
  const reg = await register("ready-key");
  assert.equal(reg.body.status, "pending");
  const before = await revision();

  const first = await ready("ready-key");
  assert.equal(first.status, 200);
  assert.equal(first.body.status, "active");
  assert.equal(first.body.pool_revision, before + 1);

  const second = await ready("ready-key");
  assert.equal(second.body.status, "active");
  assert.equal(second.body.pool_revision, first.body.pool_revision, "un second ready ne doit pas bump");

  assert.equal(await revision(), first.body.pool_revision);
});

test("heartbeat met à jour sans bump de révision et sans prolonger la vie", async () => {
  const reg = await register("beat-key");
  await ready("beat-key");
  const before = await revision();

  const hb = await beat("beat-key", { latency_ms: 123, healthy: true, agent_version: "1.2.3" });
  assert.equal(hb.status, 200);
  assert.equal(hb.body.status, "active");
  assert.equal(hb.body.expires_at, reg.body.expires_at);
  assert.equal(await revision(), before, "un battement ne doit pas forcer un nouveau bundle");

  const row = await db.one<{ latency_ms: number; health: string; agent_version: string; last_seen_at: Date }>(
    "SELECT latency_ms, health, agent_version, last_seen_at FROM endpoints WHERE deployment_key = $1",
    ["beat-key"],
  );
  assert.equal(Number(row?.latency_ms), 123);
  assert.equal(row?.health, "healthy");
  assert.equal(row?.agent_version, "1.2.3");
  assert.ok(row?.last_seen_at);
});

test("sans jeton : 401 ; avec un mauvais jeton : 401", async () => {
  const missing = await post("register", { deployment_key: "no-token", public_host: "node1.example.net" }, {});
  assert.equal(missing.status, 401);
  assert.equal(missing.body.error.code, "UNAUTHENTICATED");

  const wrong = await post(
    "register",
    { deployment_key: "no-token", public_host: "node1.example.net" },
    { authorization: "Bearer not-the-secret" },
  );
  assert.equal(wrong.status, 401);

  const poolWithout = await app.inject({ method: "GET", url: "/v1/internal/pool" });
  assert.equal(poolWithout.statusCode, 401);
});

test("secret vide : 503, même avec un jeton", async () => {
  const original = env.ingest.secret;
  env.ingest.secret = "";
  try {
    const res = await post("register", { deployment_key: "closed-key", public_host: "node1.example.net" });
    assert.equal(res.status, 503);
    assert.equal(res.body.error.code, "INTERNAL");
  } finally {
    env.ingest.secret = original;
  }
});

test("balayage : draining à expires_at - 900 s, expired après", async () => {
  const reg = await register("sweep-key", { ttl_seconds: 3600 });
  await ready("sweep-key");
  const expiresAt = new Date(reg.body.expires_at).getTime();
  const lead = env.ingest.drainLeadSeconds;
  assert.equal(lead, 900, "le drain testé est celui de l'environnement");

  const early = await sweepEndpoints(db, new Date(expiresAt - (lead + 1) * 1000));
  assert.equal(await statusOf("sweep-key"), "active", "hors de la fenêtre de drain, rien ne bouge");

  const atLead = await sweepEndpoints(db, new Date(expiresAt - lead * 1000));
  assert.ok(atLead.draining >= 1);
  assert.equal(await statusOf("sweep-key"), "draining");

  const late = await sweepEndpoints(db, new Date(expiresAt + 1000));
  assert.ok(late.expired >= 1);
  assert.equal(await statusOf("sweep-key"), "expired");
});

async function statusOf(deploymentKey: string): Promise<string> {
  return String(await db.scalar("SELECT status FROM endpoints WHERE deployment_key = $1", [deploymentKey]));
}

test("diagnostic /pool : jamais de credential, jamais d'UUID", async () => {
  await register("diag-key");
  const res = await app.inject({ method: "GET", url: "/v1/internal/pool", headers: auth });
  assert.equal(res.statusCode, 200);
  const body = res.json() as { count: number; endpoints: Array<Record<string, unknown>> };
  assert.ok(body.count >= 1);
  const raw = res.body;
  assert.ok(!raw.includes("credential"), "le secret scellé ne doit pas sortir");
  for (const row of body.endpoints) {
    assert.ok(!("credential" in row));
    assert.ok(!("deployment_key" in row));
    assert.ok(row.endpoint_id);
  }
});

test("aller-retour buildVlessUri / parseVlessUri", async () => {
  const id = "5f0c9a3e-2b5d-4a1e-9d3c-7f1a2b3c4d5e";
  const uri = buildVlessUri({
    id,
    host: "node1.example.net",
    port: 443,
    security: "tls",
    sni: "cdn.example.net",
    wsPath: "/ws/aBcD123",
    label: "Nœud 1",
  });

  const parsed = parseVlessUri(uri);
  assert.equal(parsed.id, id);
  assert.equal(parsed.host, "node1.example.net");
  assert.equal(parsed.port, 443);
  assert.equal(parsed.params.type, "ws");
  assert.equal(parsed.params.security, "tls");
  assert.equal(parsed.params.encryption, "none");
  assert.equal(parsed.params.sni, "cdn.example.net");
  assert.equal(parsed.params.path, "/ws/aBcD123");
  assert.equal(parsed.label, "Nœud 1");
});

test("enveloppe scellée : sealForDevice puis openEnvelope rend la même chose", async () => {
  const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const spki = publicKey.export({ format: "der", type: "spki" }).toString("base64");
  const pem = privateKey.export({ format: "pem", type: "pkcs8" }) as string;
  const plaintext = JSON.stringify({ revision: 7, configs: [{ label: "n1" }] });
  const context = { deviceId: "device-1", revision: 7 };

  const sealed = sealForDevice(spki, plaintext, context);
  assert.equal(openEnvelope(sealed, pem, context), plaintext);

  // Wrong context must fail the GCM tag: the AAD is bound to device + revision.
  assert.throws(() => openEnvelope(sealed, pem, { deviceId: "device-1", revision: 8 }));
});

test("le parseur JSON conserve le corps brut octet pour octet", async () => {
  const payload = '{ "b": 1,  "a": [2, 3] }';
  const res = await app.inject({
    method: "POST",
    url: "/__test/echo-raw",
    headers: { "content-type": "application/json" },
    payload,
  });
  assert.equal(res.statusCode, 200);
  const body = res.json() as { raw: string; body: unknown };
  assert.equal(body.raw, payload);
  assert.deepEqual(body.body, { b: 1, a: [2, 3] });
});

test("JSON invalide : enveloppe d'erreur, pas de trace", async () => {
  const res = await app.inject({
    method: "POST",
    url: "/v1/internal/endpoints/register",
    headers: { "content-type": "application/json", ...auth },
    payload: "{not json",
  });
  assert.equal(res.statusCode, 400);
  const body = res.json() as { error: { code: string; message: string } };
  assert.equal(body.error.code, "VALIDATION_FAILED");
  assert.ok(!res.body.includes("at "), "pas de pile d'appels dans la réponse");
});

test("validation : public_host obligatoire, ws_path jamais accepté", async () => {
  const missingHost = await post("register", { deployment_key: "bad-key" });
  assert.equal(missingHost.status, 400);
  assert.equal(missingHost.body.error.code, "VALIDATION_FAILED");

  const withPath = await register("path-key", { ws_path: "/ws/claimed" });
  assert.equal(withPath.status, 200);
  assert.notEqual(withPath.body.ws_path, "/ws/claimed", "le chemin WS est généré côté serveur");
  assert.match(String(withPath.body.ws_path), /^\/ws\//);
});

test("/healthz ne touche pas la base, /readyz la vérifie", async () => {
  const probeHeaders = { "x-health-check-key": "test-health-check-key" };
  const live = await app.inject({ method: "GET", url: "/healthz", headers: probeHeaders });
  assert.equal(live.statusCode, 200);
  assert.equal((live.json() as { status: string }).status, "ok");

  const readyRes = await app.inject({ method: "GET", url: "/readyz", headers: probeHeaders });
  assert.equal(readyRes.statusCode, 200);
  assert.equal((readyRes.json() as { status: string }).status, "ready");

  // Same app shape, closed database: readiness must fail, liveness must not.
  const deadDb = await createDb();
  const deadApp = await buildApp({ db: deadDb });
  await deadDb.close();
  try {
    const down = await deadApp.inject({ method: "GET", url: "/readyz", headers: probeHeaders });
    assert.equal(down.statusCode, 503);
    const stillLive = await deadApp.inject({ method: "GET", url: "/healthz", headers: probeHeaders });
    assert.equal(stillLive.statusCode, 200);
  } finally {
    await deadApp.close();
  }
});

test("route inconnue : 404 dans l'enveloppe", async () => {
  const res = await app.inject({ method: "GET", url: "/v1/internal/nope" });
  assert.equal(res.statusCode, 404);
  assert.equal((res.json() as { error: { code: string } }).error.code, "NOT_FOUND");
});

/* ------------------------------------------------------- domain fronting (D93) */

test("front : une sortie sœur par SNI, Host = public_host, même identité ; ready les active", async () => {
  const key = "fronted:rev1";
  const first = await register(key, {
    public_host: "svc-1.us-west1.run.app",
    front: { address: "203.0.113.20", snis: ["a.example.com", "b.example.com"] },
  });
  assert.equal(first.status, 200);
  assert.equal(first.body.front_outputs, 2);

  await ready(key);
  const rows = await db.query<any>(
    "SELECT deployment_key, status, host, sni, ws_host, ws_path, credential FROM endpoints WHERE left(deployment_key, $1) = $2 ORDER BY deployment_key",
    [key.length, key],
  );
  const main = rows.find((r) => r.deployment_key === key);
  const sisters = rows.filter((r) => r.deployment_key !== key);
  assert.equal(sisters.length, 2);
  for (const sister of sisters) {
    assert.equal(sister.status, "active", "ready active aussi les sœurs");
    assert.equal(sister.host, "203.0.113.20");
    assert.equal(sister.ws_host, "svc-1.us-west1.run.app");
    assert.equal(sister.ws_path, main.ws_path);
    assert.equal(sister.credential, main.credential, "même identité que le nœud");
  }

  // Redémarrage sans front : les sœurs sortent du pool.
  const again = await register(key, { public_host: "svc-1.us-west1.run.app" });
  assert.equal(again.body.front_outputs, 0);
  const left = await db.query<any>("SELECT status FROM endpoints WHERE left(deployment_key, $1) = $2 AND deployment_key <> $2", [key.length, key]);
  assert.ok(left.every((r) => r.status === "expired"));
});

test("front : SNI invalide refusé", async () => {
  const res = await register("fronted:bad", { front: { address: "203.0.113.20", snis: ["pas un sni"] } });
  assert.equal(res.status, 400);
});
