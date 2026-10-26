/**
 * Matrice `permitted()` : rôles plateforme cumulables, `reseau` limité au
 * réseau, court-circuit réservé à `owner`.
 *
 * Contexte construit à la main (pas de base) : la matrice est une fonction pure
 * des rôles et des appartenances.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

const { closeAll } = await import("./support.js");
const { permitted } = await import("../src/routes/admin.js");
type AdminContextLike = Parameters<typeof permitted>[0];
type Cap = Parameters<typeof permitted>[1];
type Role = "owner" | "reseau";
type StaffRoleName = "community_admin" | "support" | "finance";

function ctx(input: {
  platformRoles?: Role[];
  memberships?: Array<{ communityId: string; role: StaffRoleName }>;
}): AdminContextLike {
  const roles = (["owner", "reseau"] as const).filter((role) => (input.platformRoles ?? []).includes(role));
  return {
    adminId: "adm_perm",
    sessionId: "ses_perm",
    platformRole: roles[0] ?? "none",
    platformRoles: roles,
    memberships: (input.memberships ?? []).map((m, index) => ({ id: `mem_${index}`, ...m })),
    mustChangePassword: false,
    admin: {},
  };
}

const ALL_CAPS: Cap[] = [
  "community.manage", "community.read", "membership.read", "membership.write", "member.read", "order.read",
  "commission.read", "payout.create", "payout.approve", "payout.pay", "payout.confirm", "payout.resolve",
  "plan.manage", "endpoint.read", "endpoint.write", "device.revoke", "offline_bundle.issue", "audit.read",
  "account.self", "admin.invite", "onboarding.self", "build.request", "build.approve", "pricing.read",
  "pricing.manage", "xui.manage", "night_slot.manage", "presence.read",
];

const RESEAU_CAPS: Cap[] = ["endpoint.read", "endpoint.write", "night_slot.manage", "account.self", "onboarding.self"];

test("owner : tout est permis, y compris sur une communauté quelconque", () => {
  const owner = ctx({ platformRoles: ["owner"] });
  for (const cap of ALL_CAPS) assert.equal(permitted(owner, cap, null), true, cap);
  assert.equal(permitted(owner, "pricing.manage", "com_x"), true);
});

test("reseau seul : réseau et rien d'autre", () => {
  const reseau = ctx({ platformRoles: ["reseau"] });
  for (const cap of RESEAU_CAPS) assert.equal(permitted(reseau, cap, null), true, cap);
  for (const cap of ALL_CAPS) {
    if (RESEAU_CAPS.includes(cap)) continue;
    assert.equal(permitted(reseau, cap, null), false, `reseau ne doit pas avoir ${cap}`);
  }
});

test("owner et reseau cumulés : owner garde tout, reseau n'ajoute rien à owner", () => {
  const both = ctx({ platformRoles: ["owner", "reseau"] });
  assert.equal(both.platformRole, "owner", "le rang le plus haut est owner");
  assert.equal(permitted(both, "pricing.manage", null), true);
  assert.equal(permitted(both, "night_slot.manage", null), true);
});

test("reseau et community_admin cumulés : la communauté reste bornée à la sienne", () => {
  const mixed = ctx({
    platformRoles: ["reseau"],
    memberships: [{ communityId: "com_a", role: "community_admin" }],
  });
  assert.equal(permitted(mixed, "pricing.read", "com_a"), true);
  assert.equal(permitted(mixed, "pricing.read", "com_b"), false);
  assert.equal(permitted(mixed, "build.request", "com_a"), true);
  assert.equal(permitted(mixed, "build.approve", "com_a"), false, "approuver un build reste réservé à owner");
  assert.equal(permitted(mixed, "pricing.manage", "com_a"), false);
  assert.equal(permitted(mixed, "endpoint.write", null), true);
});

test("community_admin : ses capacités de communauté, aucune capacité owner", () => {
  const cadmin = ctx({ memberships: [{ communityId: "com_a", role: "community_admin" }] });
  assert.equal(permitted(cadmin, "build.request", null), true, "sans communauté désignée, un de ses rôles suffit");
  assert.equal(permitted(cadmin, "onboarding.self", null), true);
  for (const cap of ["admin.invite", "build.approve", "pricing.manage", "xui.manage", "presence.read", "night_slot.manage"] as Cap[]) {
    assert.equal(permitted(cadmin, cap, "com_a"), false, cap);
  }
  assert.equal(permitted(cadmin, "endpoint.write", null), false, "endpoint.write est réservé au réseau");
});

test("support : lecture du pool, pas d'écriture réseau, pas d'onboarding libre", () => {
  const support = ctx({ memberships: [{ communityId: "com_a", role: "support" }] });
  assert.equal(permitted(support, "endpoint.read", null), true);
  assert.equal(permitted(support, "endpoint.write", null), false);
  assert.equal(permitted(support, "pricing.read", "com_a"), false);
  assert.equal(permitted(support, "onboarding.self", null), false, "un admin déjà rattaché n'a pas d'onboarding libre");
});

test("aucun rôle, aucune appartenance : seul son propre compte", () => {
  const nobody = ctx({});
  assert.equal(permitted(nobody, "account.self", null), true);
  assert.equal(permitted(nobody, "onboarding.self", null), true);
  assert.equal(permitted(nobody, "endpoint.read", null), false);
  assert.equal(permitted(nobody, "community.read", null), false);
});

test("fermeture", async () => {
  await closeAll();
});
