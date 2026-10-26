import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { bffQuery, bffTargetPath } from "@/lib/bff-allowlist";
import { drawerCloseHref, parseDrawer } from "@/lib/drawers";

describe("BFF de lecture : liste blanche", () => {
  it("relaie les lectures autorisées, sous le préfixe admin", () => {
    assert.equal(bffTargetPath(["me"]), "/v1/admin/me");
    assert.equal(bffTargetPath(["communities", "c_1", "orders"]), "/v1/admin/communities/c_1/orders");
    assert.equal(bffTargetPath(["pool"]), "/v1/admin/pool");
  });

  it("refuse tout chemin hors liste, même proche d'un préfixe autorisé", () => {
    assert.equal(bffTargetPath(["mefoo"]), null);
    assert.equal(bffTargetPath(["secrets"]), null);
    assert.equal(bffTargetPath(["auth", "login"]), null);
    assert.equal(bffTargetPath([]), null);
  });

  it("refuse la traversée, les paramètres de chemin et les segments vides", () => {
    assert.equal(bffTargetPath(["communities", "..", "auth"]), null);
    assert.equal(bffTargetPath(["communities", "."]), null);
    assert.equal(bffTargetPath(["communities", ":id"]), null);
    assert.equal(bffTargetPath(["communities", ""]), null);
    assert.equal(bffTargetPath(["communities", "a b"]), null);
  });

  it("relaie une query bornée : clés simples, valeurs courtes, nombre limité", () => {
    const params = new URLSearchParams("cursor=abc&o.status=paid&limit=50");
    assert.deepEqual(bffQuery(params), { cursor: "abc", limit: "50" });
    const long = new URLSearchParams(`q=${"x".repeat(300)}&ok=1`);
    assert.deepEqual(bffQuery(long), { ok: "1" });
    const many = new URLSearchParams(Array.from({ length: 30 }, (_, i) => [`k${i}`, "v"] as [string, string]));
    assert.equal(Object.keys(bffQuery(many)).length, 20);
  });
});

describe("tiroirs pilotés par l'URL", () => {
  it("lit le premier tiroir reconnu et refuse un identifiant mal formé", () => {
    assert.deepEqual(parseDrawer({ abonne: "u_1" }), { kind: "abonne", id: "u_1" });
    assert.deepEqual(parseDrawer({ versement: ["p_9", "p_8"] }), { kind: "versement", id: "p_9" });
    assert.equal(parseDrawer({ abonne: "a b" }), null);
    assert.equal(parseDrawer({ inconnu: "x" }), null);
  });

  it("la fermeture retire tous les paramètres de tiroir et garde les filtres", () => {
    const href = drawerCloseHref("/c1/orders", { status: "paid", commande: "o_1", cursor: ["x"] });
    assert.equal(href, "/c1/orders?status=paid&cursor=x");
    assert.equal(drawerCloseHref("/c1/orders", { abonne: "u_1" }), "/c1/orders");
  });
});
