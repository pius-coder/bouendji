/**
 * Rideau anti-curieux : navigateur sans métadonnées → 302 leurre.
 * Vraie app (buildApp + PGlite), pas de mock. Vérifie aussi les bypass
 * (sondes + webhook Fapshi, D14) et que l'API légitime passe.
 */
import assert from "node:assert/strict";
import { after, test } from "node:test";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "memory://";
process.env.MASTER_KEY = Buffer.alloc(32, 12).toString("base64");
process.env.JWT_SECRET = "test-secret-decoy-test-secret!";
process.env.DECOY_URL = "https://example-sms.com";

const { createDb } = await import("../src/db.js");
const { buildApp } = await import("../src/app.js");

const db = await createDb();
await (await import("./xuiSchema.js")).applyXuiTestSchema(db); // colonnes R6/R8 de test, voir xuiSchema.ts
const app = await buildApp({ db });

after(async () => {
  await app.close();
  await db.close();
});

test("navigateur nu sur / → 302 leurre", async () => {
  const res = await app.inject({ method: "GET", url: "/", headers: { accept: "text/html" } });
  assert.equal(res.statusCode, 302);
  assert.equal(res.headers.location, "https://example-sms.com");
});

test("/v1/me sans rien → 302 leurre (pas de JSON qui fuit)", async () => {
  const res = await app.inject({ method: "GET", url: "/v1/me", headers: { accept: "text/html" } });
  assert.equal(res.statusCode, 302);
});

test("sondes et webhook : jamais de redirect", async () => {
  for (const url of ["/healthz", "/readyz", "/v1/payments/webhook/fapshi"]) {
    const res = await app.inject({ method: "GET", url, headers: { accept: "text/html" } });
    assert.notEqual(res.statusCode, 302, url);
  }
});

test("documentation : un navigateur doit pouvoir l'ouvrir", async () => {
  // Sans ces exceptions, `/reference/` renvoie vers le site leurre et
  // l'interface est inutilisable exactement là où elle sert.
  for (const url of ["/reference", "/reference/", "/openapi.json"]) {
    const res = await app.inject({ method: "GET", url, headers: { accept: "text/html" } });
    assert.notEqual(res.statusCode, 302, url);
  }
});

test("pages de paiement : le navigateur ouvert par l'app ne part pas au leurre", async () => {
  for (const url of ["/pay/return/ord_123", "/pay/mock/mock_abc"]) {
    const res = await app.inject({ method: "GET", url, headers: { accept: "text/html" } });
    assert.notEqual(res.statusCode, 302, url);
  }
});

test("client JSON sans metadata : JSON normal, pas de redirect", async () => {
  const res = await app.inject({ method: "GET", url: "/v1/me", headers: { accept: "application/json" } });
  assert.notEqual(res.statusCode, 302);
  assert.match(res.headers["content-type"] ?? "", /application\/json/);
});

test("app légitime (X-App-Id + UA) : pas de redirect, JSON même en 401", async () => {
  const res = await app.inject({
    method: "GET",
    url: "/v1/me",
    headers: { accept: "application/json", "user-agent": "vpn-android", "x-app-id": "bouendji" },
  });
  assert.notEqual(res.statusCode, 302);
  assert.match(res.headers["content-type"] ?? "", /application\/json/);
});
