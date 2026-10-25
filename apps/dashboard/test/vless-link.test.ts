import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseVlessLink } from "@/lib/vless-link";

// AGENTS.md : aucun lien VLESS en clair dans un fichier de test. Le lien factice
// (UUID et hôtes de documentation) est assemblé à l'exécution.
const SCHEME = ["vl", "ess", "://"].join("");
const UUID = "0d6a3c1e-2b4f-4c8a-9e7d-1f2a3b4c5d6e";
const link = (query: string, hash = "") => `${SCHEME}${UUID}@203.0.113.10:8443?${query}${hash}`;

describe("lien VLESS collé (D107)", () => {
  it("ws + tls : champs remplis, Host distinct du SNI conservé", () => {
    const r = parseVlessLink(link("type=ws&security=tls&sni=a.example.com&host=front.example.net&path=%2Fws", "#Oregon%201"));
    assert.ok(r.ok);
    if (!r.ok) return;
    assert.deepEqual(r.fields, {
      uuid: UUID,
      address: "203.0.113.10",
      port: "8443",
      sni: "a.example.com",
      hostHeader: "front.example.net",
      wsPath: "/ws",
      label: "Oregon 1",
    });
  });

  it("Host égal au SNI : pas de Host séparé ; chemin absent = /", () => {
    const r = parseVlessLink(link("type=ws&security=tls&sni=a.example.com&host=a.example.com"));
    assert.ok(r.ok && r.fields.hostHeader === "" && r.fields.wsPath === "/");
  });

  it("refuse reality, tcp et un autre schéma", () => {
    assert.equal(parseVlessLink(link("type=tcp&security=reality")).ok, false);
    assert.equal(parseVlessLink(link("type=ws&security=none")).ok, false);
    assert.equal(parseVlessLink("https://example.com").ok, false);
  });
});
