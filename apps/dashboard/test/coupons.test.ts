import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { allSections, buildNav } from "@/components/shell/nav-model";
import { bffTargetPath } from "@/lib/bff-allowlist";
import { formatDurationMinutes } from "@/lib/format";
import { can } from "@/lib/roles";
import type { AdminMe } from "@/server/services/admin-auth/admin-auth.schema";
import { couponIssueBody, couponList, couponTypeCreateBody } from "@/server/services/coupons/coupons.schema";

const owner: AdminMe = { adminId: "o", email: "o@x.io", name: "O", platformRole: "owner", memberships: [] };
const communityAdmin: AdminMe = {
  adminId: "a",
  email: "a@x.io",
  name: "A",
  platformRole: "none",
  memberships: [{ communityId: "c1", role: "community_admin" }],
};
const support: AdminMe = {
  adminId: "s",
  email: "s@x.io",
  name: "S",
  platformRole: "none",
  memberships: [{ communityId: "c1", role: "support" }],
};

describe("coupons (104) : miroir de permitted()", () => {
  it("types : owner seul ; émission : owner et community_admin de la communauté", () => {
    assert.equal(can(owner, "coupons.types", null), true);
    assert.equal(can(communityAdmin, "coupons.types", "c1"), false);
    assert.equal(can(owner, "coupons.issue", "c1"), true);
    assert.equal(can(communityAdmin, "coupons.issue", "c1"), true);
    assert.equal(can(communityAdmin, "coupons.issue", "c2"), false);
    assert.equal(can(support, "coupons.issue", "c1"), false);
  });

  it("navigation : « Types de coupon » pour l'owner seulement", () => {
    const hrefs = (me: AdminMe) => allSections(buildNav(me, "c1")).flatMap((s) => s.items.map((i) => i.href));
    assert.ok(hrefs(owner).includes("/coupons"));
    assert.equal(hrefs(communityAdmin).includes("/coupons"), false);
  });

  it("lectures BFF : types et coupons d'un abonné, types d'une app", () => {
    assert.equal(bffTargetPath(["users", "u1", "coupons"]), "/v1/admin/users/u1/coupons");
    assert.equal(bffTargetPath(["users", "u1", "coupon-types"]), "/v1/admin/users/u1/coupon-types");
    assert.equal(bffTargetPath(["apps", "a1", "coupon-types"]), "/v1/admin/apps/a1/coupon-types");
  });

  it("schémas : bornes de l'API, aucune lecture ne porte de code", () => {
    assert.equal(couponTypeCreateBody.safeParse({ label: "1 heure", durationMinutes: 60 }).success, true);
    assert.equal(couponTypeCreateBody.safeParse({ label: "1 heure", durationMinutes: 525_601 }).success, false);
    assert.equal(couponIssueBody.safeParse({ typeId: "t1", communityId: "c1" }).success, false);
    const parsed = couponList.parse({
      items: [
        {
          id: "c",
          typeId: "t",
          label: "1 heure",
          durationMinutes: 60,
          status: "issued",
          expired: false,
          issuedAt: null,
          expiresAt: null,
          redeemedAt: null,
          issuedByName: null,
          code: "ABCD-EFGH-JKMN",
        },
      ],
    });
    assert.equal("code" in (parsed.items[0] as object), false);
  });

  it("durées lisibles", () => {
    assert.equal(formatDurationMinutes(30), "30 min");
    assert.equal(formatDurationMinutes(60), "1 h");
    assert.equal(formatDurationMinutes(90), "1 h 30");
    assert.equal(formatDurationMinutes(120), "2 h");
    assert.equal(formatDurationMinutes(1440), "1 j");
    assert.equal(formatDurationMinutes(1560), "1 j 2 h");
  });
});
