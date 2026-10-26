import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { allSections, buildNav } from "@/components/shell/nav-model";
import { can, roleIn } from "@/lib/roles";
import { loadAuditParams } from "@/server/query/audit.params";
import { loadOrdersParams, ordersParsers, ordersUrlKeys } from "@/server/query/orders.params";
import { loadPayoutsParams } from "@/server/query/payouts.params";
import type { AdminMe } from "@/server/services/admin-auth/admin-auth.schema";
import { communityFormSchema } from "@/server/services/communities/communities.schema";
import { createSerializer } from "nuqs/server";

const owner: AdminMe = { adminId: "a", email: "o@x.io", name: "O", platformRole: "owner", memberships: [] };
const support: AdminMe = {
  adminId: "s",
  email: "s@x.io",
  name: "S",
  platformRole: "none",
  memberships: [{ communityId: "c1", role: "support" }],
};
const finance: AdminMe = {
  adminId: "f",
  email: "f@x.io",
  name: "F",
  platformRole: "none",
  memberships: [{ communityId: "c1", role: "finance" }],
};

describe("rôles : ce que l'écran affiche (miroir de permitted())", () => {
  it("support : abonnés, appareils, révocation, réseau en lecture ; ni argent ni versements ni journal", () => {
    assert.equal(roleIn(support, "c1"), "support");
    assert.equal(can(support, "members.read", "c1"), true);
    assert.equal(can(support, "devices.revoke", "c1"), true);
    assert.equal(can(support, "network.read", null), true);
    assert.equal(can(support, "money.read", "c1"), false);
    assert.equal(can(support, "payouts.read", null), false);
    assert.equal(can(support, "audit.read", "c1"), false);
    assert.equal(can(support, "network.write", null), false);
  });

  it("finance : commandes de toutes les communautés, versements, pas d'abonnés", () => {
    assert.equal(can(finance, "orders.read", "autre"), true);
    assert.equal(can(finance, "payouts.read", null), true);
    assert.equal(can(finance, "members.read", "c1"), false);
  });

  it("une communauté étrangère ne donne aucun rôle local", () => {
    assert.equal(roleIn(support, "c2"), null);
    assert.equal(can(support, "members.read", "c2"), false);
  });

  it("owner : tout, y compris forcer un nœud", () => {
    assert.equal(can(owner, "network.write", null), true);
    assert.equal(can(owner, "community.manage", null), true);
  });
});

describe("navigation par rôle et communauté active", () => {
  it("owner : 4 sections en barre basse au plus, Communauté, Plateforme et Réseau derrière Plus", () => {
    const nav = buildNav(owner, "c1");
    assert.ok(nav.bar.length <= 4, "barre basse : 4 sections + Plus");
    assert.ok(nav.more.some((s) => s.items.some((i) => i.href === "/communities")));
    assert.ok(nav.more.some((s) => s.key === "reseau"));
    assert.ok(nav.bar.some((s) => s.items.some((i) => i.href === "/c1/orders")));
  });

  it("reseau : seul l'espace Réseau, et rien d'autre", () => {
    const reseau = { adminId: "r", email: "r@x.io", name: "R", platformRole: "none" as const, memberships: [], platformRoles: ["reseau"] };
    assert.equal(can(reseau, "network.write", null), true);
    assert.equal(can(reseau, "payouts.read", null), false);
    assert.equal(can(reseau, "audit.read", "c1"), false);
    assert.deepEqual(allSections(buildNav(reseau, null)).map((s) => s.key), ["accueil", "reseau"]);
  });

  it("support : pas de Versements ni de Journal", () => {
    const hrefs = allSections(buildNav(support, "c1")).flatMap((s) => s.items.map((i) => i.href));
    assert.ok(!hrefs.includes("/payouts"));
    assert.ok(!hrefs.includes("/c1/audit"));
    assert.ok(hrefs.includes("/c1/devices"));
  });

  it("sans communauté active : seules les entrées globales", () => {
    const hrefs = allSections(buildNav(owner, null)).flatMap((s) => s.items.map((i) => i.href));
    assert.ok(hrefs.every((h) => !h.startsWith("/null")));
  });
});

describe("paramètres d'URL nuqs : un jeu de parseurs, deux côtés", () => {
  it("valeurs par défaut écrites une seule fois", () => {
    assert.deepEqual(loadOrdersParams({}), { status: "", cursor: "" });
    assert.equal(loadAuditParams({}).limit, 50);
    assert.equal(loadPayoutsParams({}).status, null);
  });

  it("clés d'URL préfixées par table", () => {
    assert.deepEqual(loadOrdersParams({ o_status: "paid", o_cursor: "C1", status: "ignoré" }), {
      status: "paid",
      cursor: "C1",
    });
  });

  it("valeur hors énumération : retombe sur le défaut", () => {
    assert.equal(loadAuditParams({ a_limit: "7" }).limit, 50);
    assert.equal(loadPayoutsParams({ p_status: "inconnu" }).status, null);
  });

  it("le sérialiseur serveur produit les mêmes clés que le client lira", () => {
    const serialize = createSerializer(ordersParsers, { urlKeys: ordersUrlKeys, clearOnDefault: true });
    assert.equal(serialize({ status: "paid", cursor: "C2" }), "?o_status=paid&o_cursor=C2");
    assert.equal(serialize({ status: "", cursor: null }), "");
  });
});

describe("formulaire communauté : même schéma côté client et serveur", () => {
  it("accepte 12,5 % et le vide", () => {
    assert.ok(communityFormSchema.safeParse({ name: "Alpha", slug: "alpha", commissionPercent: "12,5" }).success);
    assert.ok(communityFormSchema.safeParse({ name: "Alpha", slug: "alpha", commissionPercent: "" }).success);
  });

  it("refuse 31 %, un slug majuscule et un nom trop court", () => {
    const r = communityFormSchema.safeParse({ name: "A", slug: "Alpha", commissionPercent: "31" });
    assert.equal(r.success, false);
    if (!r.success) {
      const keys = r.error.issues.map((i) => i.path[0]);
      assert.deepEqual(new Set(keys), new Set(["name", "slug", "commissionPercent"]));
    }
  });
});
