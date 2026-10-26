/**
 * Noms génériques et lecture stricte d'une URI VLESS de nœud (R8). Sans base :
 * ce sont des fonctions pures.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "memory://";
process.env.MASTER_KEY = Buffer.alloc(32, 5).toString("base64");

const { nodeNameFor, randomNodeName } = await import("../src/lib/names.js");
const { parseNodeVless } = await import("../src/lib/vless.js");

const NAME = /^[a-z]+-[a-z]+-\d{2}$/;

test("un nom stable pour une même graine, lisible et ASCII", () => {
  const seed = "K_SERVICE:rev-00042";
  assert.equal(nodeNameFor(seed), nodeNameFor(seed));
  assert.match(nodeNameFor(seed), NAME);
  assert.match(nodeNameFor(seed), /^[\x00-\x7f]+$/);
});

test("des graines différentes donnent des noms variés", () => {
  const names = new Set(Array.from({ length: 40 }, (_, i) => nodeNameFor(`dep-${i}`)));
  assert.ok(names.size > 25, `trop peu de variété : ${names.size}`);
});

test("un nom aléatoire respecte le même format", () => {
  for (let i = 0; i < 20; i += 1) assert.match(randomNodeName(), NAME);
});

const UUID = randomUUID();
const base = (query: string, host = "203.0.113.20", port = 443) =>
  `vless://${UUID}@${host}:${port}?${query}`;

test("lit une URI de nœud : hôte, port, chemin, SNI et en-tête Host distincts", () => {
  const node = parseNodeVless(
    base("encryption=none&security=tls&sni=cdn.example.com&type=ws&host=svc-1.example.run.app&path=%2Fws%2Fabc#Libelle"),
  );
  assert.equal(node.uuid, UUID);
  assert.equal(node.host, "203.0.113.20");
  assert.equal(node.port, 443);
  assert.equal(node.wsPath, "/ws/abc");
  assert.equal(node.sni, "cdn.example.com");
  assert.equal(node.hostHeader, "svc-1.example.run.app");
});

test("en-tête Host identique au SNI : rien de plus à stocker", () => {
  const node = parseNodeVless(base("security=tls&type=ws&sni=svc.example.com&host=svc.example.com&path=%2Fws"));
  assert.equal(node.hostHeader, null);
});

test("SNI absent : l'hôte sert de SNI, et l'UUID est ramené en minuscules", () => {
  const node = parseNodeVless(`vless://${UUID.toUpperCase()}@node.example.net:8443?security=tls&type=ws&path=%2Fws`);
  assert.equal(node.sni, null);
  assert.equal(node.uuid, UUID);
  assert.equal(node.port, 8443);
});

test("refuse tout ce que l'API ne sait pas servir, sans jamais citer l'URI", () => {
  const cases = [
    "vless://pas-un-uuid@203.0.113.20:443?security=tls&type=ws&path=%2Fws",
    base("security=none&type=ws&path=%2Fws"),
    base("security=tls&type=grpc&path=%2Fws"),
    base("security=tls&type=ws&path=ws-sans-slash"),
    base("security=tls&type=ws&path=%2Fws", "203.0.113.20", 0),
    base("security=tls&type=ws&path=%2Fws&sni=-mauvais-"),
    "http://example.com",
    "",
  ];
  for (const raw of cases) {
    let thrown: unknown = null;
    try {
      parseNodeVless(raw);
    } catch (err) {
      thrown = err;
    }
    assert.ok(thrown instanceof Error, `doit être refusé : ${raw}`);
    const message = (thrown as Error).message;
    assert.equal(message.includes(UUID), false);
    assert.equal(message.includes("vless://"), false);
  }
});
