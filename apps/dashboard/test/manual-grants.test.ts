import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { STATUS } from "@/components/common/status-badge";
import { allSections, buildNav } from "@/components/shell/nav-model";
import { bffTargetPath } from "@/lib/bff-allowlist";
import { can } from "@/lib/roles";
import type { AdminMe } from "@/server/services/admin-auth/admin-auth.schema";
import { grantBody, grantOptions, owedList, settlement } from "@/server/services/manual-grants/manual-grants.schema";

const owner: AdminMe = { adminId: "o", email: "o@x.io", name: "O", platformRole: "owner", memberships: [] };
const communityAdmin: AdminMe = {
  adminId: "a",
  email: "a@x.io",
  name: "A",
  platformRole: "none",
  memberships: [{ communityId: "c1", role: "community_admin" }],
};
const finance: AdminMe = {
  adminId: "f",
  email: "f@x.io",
  name: "F",
  platformRole: "none",
  memberships: [{ communityId: "c1", role: "finance" }],
};

describe("accès manuels (105) : miroir de permitted()", () => {
  it("owner partout ; community_admin dans sa communauté seulement ; finance non", () => {
    assert.equal(can(owner, "manual_grants.manage", "c1"), true);
    assert.equal(can(communityAdmin, "manual_grants.manage", "c1"), true);
    assert.equal(can(communityAdmin, "manual_grants.manage", "c2"), false);
    assert.equal(can(finance, "manual_grants.manage", "c1"), false);
  });

  it("navigation : « Impayés » dans Argent pour l'owner et l'admin de la communauté", () => {
    const hrefs = (me: AdminMe) => allSections(buildNav(me, "c1")).flatMap((s) => s.items.map((i) => i.href));
    assert.ok(hrefs(owner).includes("/c1/manual-grants"));
    assert.ok(hrefs(communityAdmin).includes("/c1/manual-grants"));
    assert.equal(hrefs(finance).includes("/c1/manual-grants"), false);
  });

  it("lectures BFF de la fiche abonné : options et historique", () => {
    assert.equal(bffTargetPath(["users", "u1", "manual-grants", "options"]), "/v1/admin/users/u1/manual-grants/options");
    assert.equal(bffTargetPath(["users", "u1", "manual-grants"]), "/v1/admin/users/u1/manual-grants");
  });

  it("corps d'accord : ni montant ni communauté acceptés, moyens connus seulement", () => {
    assert.equal(grantBody.safeParse({ planId: "p1", paymentMethod: "orange_money" }).success, true);
    assert.equal(grantBody.safeParse({ planId: "p1", paymentMethod: "mtn_momo", note: "Réf. 123" }).success, true);
    assert.equal(grantBody.safeParse({ planId: "p1", paymentMethod: "cash" }).success, false);
    assert.equal(grantBody.safeParse({ planId: "p1", paymentMethod: "other", amountXaf: 1 }).success, false);
    assert.equal(grantBody.safeParse({ planId: "p1", paymentMethod: "other", communityId: "c2" }).success, false);
  });

  it("réponses de l'API lues telles quelles (options, impayés, versement)", () => {
    const options = grantOptions.parse({
      plans: [
        { id: "p", code: "deux-heures", name: "2 heures", priceXaf: 1, durationDays: 1, durationMinutes: 120, family: "unlimited", nightOptions: [] },
      ],
      paymentMethods: ["orange_money", "mtn_momo", "other"],
      owed: { communityId: "c1", count: 2, totalXaf: 10 },
    });
    assert.equal(options.owed.count, 2);
    const list = owedList.parse({
      status: "owed",
      items: [],
      truncated: false,
      owed: { count: 0, totalXaf: 0 },
      communities: [],
    });
    assert.equal(list.owed.totalXaf, 0);
    const paid = settlement.parse({
      id: "stl_x",
      communityId: "c1",
      communityName: null,
      amountXaf: 10,
      status: "paid",
      grantCount: 2,
      createdAt: null,
      paidAt: null,
      createdByName: null,
      paymentUrl: null,
      failureReason: null,
    });
    assert.equal(paid.paymentUrl, null);
  });

  it("libellés de statut dédiés (pas de collision avec les commandes)", () => {
    assert.equal(STATUS.grant_owed?.label, "À régulariser");
    assert.equal(STATUS.grant_settled?.label, "Réglé");
    assert.equal(STATUS.settlement_paid?.label, "Versé");
  });
});
