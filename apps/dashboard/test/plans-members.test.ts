import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { allSections, buildNav } from "@/components/shell/nav-model";
import { can } from "@/lib/roles";
import type { ApiError } from "@/server/api/api-error";
import type { BaseServiceDeps } from "@/server/api/base-service";
import { createServices } from "@/server/services";
import type { AdminMe } from "@/server/services/admin-auth/admin-auth.schema";
import { memberFormSchema } from "@/server/services/communities/communities.schema";
import { planFormSchema, planFormToBody, planFormToUpdate } from "@/server/services/plans/plans.schema";

interface Call {
  url: string;
  method: string;
  headers: Headers;
  body: string | undefined;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function setup(respond: (c: Call) => Response) {
  const calls: Call[] = [];
  let refreshes = 0;
  const deps: BaseServiceDeps = {
    baseUrl: "http://api.test",
    accessKey: "KEY",
    getToken: async () => "jwt",
    afterMutation: () => {
      refreshes += 1;
    },
    fetch: (async (url: string, init: RequestInit) => {
      const call = { url, method: String(init.method), headers: new Headers(init.headers), body: init.body as string | undefined };
      calls.push(call);
      return respond(call);
    }) as unknown as typeof fetch,
  };
  return { services: createServices(deps), calls, refreshes: () => refreshes };
}

const planRow = {
  id: "p1",
  appId: "a1",
  code: "mensuel",
  name: "Mensuel",
  description: "",
  priceXaf: 2500,
  durationDays: 30,
  deviceLimit: 1,
  badge: null,
  featured: false,
  active: true,
  sortOrder: 0,
  endpointTier: "free-labs",
  revision: 1,
};
const memberRow = {
  id: "m1",
  adminUserId: "u1",
  email: "s@x.io",
  name: "Sam",
  role: "support",
  status: "active",
  communityId: "c1",
  createdAt: null,
};

describe("service plans", () => {
  it("listPlans : GET /v1/admin/apps/:appId/plans, liste déroulée", async () => {
    const { services, calls } = setup(() => json({ items: [planRow] }));
    const plans = await services.plans.listPlans({ appId: "a1" });
    assert.equal(plans.length, 1);
    assert.equal(calls[0].url, "http://api.test/v1/admin/apps/a1/plans");
    assert.equal(calls[0].headers.get("authorization"), "Bearer jwt");
    assert.equal(calls[0].headers.get("x-access-key"), "KEY");
  });

  it("createPlan : POST idempotent, relecture après succès, code invalide refusé avant envoi", async () => {
    const { services, calls, refreshes } = setup(() => json(planRow, 201));
    await services.plans.createPlan({ appId: "a1", code: "mensuel", name: "Mensuel", priceXaf: 2500, durationDays: 30 });
    assert.equal(calls[0].method, "POST");
    assert.ok(calls[0].headers.get("idempotency-key"));
    assert.equal(refreshes(), 1);

    await assert.rejects(
      services.plans.createPlan({ appId: "a1", code: "Mensuel!", name: "Mensuel", priceXaf: 2500, durationDays: 30 }),
      (e: ApiError) => Boolean(e.details?.code),
    );
    assert.equal(calls.length, 1, "aucun appel pour une entrée invalide");
  });

  it("createPlan : prix hors bornes (0 XAF, > 10 M) refusé localement", async () => {
    const { services, calls } = setup(() => json(planRow, 201));
    for (const priceXaf of [0, 10_000_001]) {
      await assert.rejects(
        services.plans.createPlan({ appId: "a1", code: "ab", name: "Ab", priceXaf, durationDays: 30 }),
        (e: ApiError) => Boolean(e.details?.priceXaf),
      );
    }
    assert.equal(calls.length, 0);
  });

  it("updatePlan : PATCH /v1/admin/plans/:planId, corps vide refusé, code non modifiable", async () => {
    const { services, calls } = setup(() => json(planRow));
    await services.plans.updatePlan({ planId: "p1", priceXaf: 3000 });
    assert.equal(calls[0].method, "PATCH");
    assert.equal(calls[0].url, "http://api.test/v1/admin/plans/p1");
    assert.equal(calls[0].body, '{"priceXaf":3000}');

    await assert.rejects(services.plans.updatePlan({ planId: "p1" }), (e: ApiError) => e.code === "VALIDATION_FAILED");
    // `code` n'existe pas dans le schéma de mise à jour : il est retiré, jamais transmis.
    await services.plans.updatePlan({ planId: "p1", ...({ code: "autre", name: "Nom" } as object) });
    assert.equal(calls[1].body, '{"name":"Nom"}');
  });

  it("endpointTier (D45) : transmis tel quel, valeur inconnue refusée avant envoi", async () => {
    const { services, calls } = setup(() => json({ ...planRow, endpointTier: "paid-gcp" }));
    const updated = await services.plans.updatePlan({ planId: "p1", endpointTier: "paid-gcp" });
    assert.equal(calls[0].body, '{"endpointTier":"paid-gcp"}');
    assert.equal(updated.endpointTier, "paid-gcp");

    await assert.rejects(
      services.plans.updatePlan({ planId: "p1", endpointTier: "gcp" as "paid-gcp" }),
      (e: ApiError) => Boolean(e.details?.endpointTier),
    );
    assert.equal(calls.length, 1);
  });

  it("409 de l'API (code déjà pris) : ApiError conservée avec son message", async () => {
    const { services } = setup(() =>
      json({ error: { code: "CONFLICT", message: "Ce code d'offre existe déjà pour cette application." } }, 409),
    );
    await assert.rejects(
      services.plans.createPlan({ appId: "a1", code: "ab", name: "Ab", priceXaf: 100, durationDays: 1 }),
      (e: ApiError) => e.status === 409 && e.message.includes("existe déjà"),
    );
  });
});

describe("service communities : membres", () => {
  it("listMembers : GET /v1/admin/communities/:id/memberships", async () => {
    const { services, calls } = setup(() => json({ items: [memberRow] }));
    const members = await services.communities.listMembers({ communityId: "c1" });
    assert.equal(members[0].role, "support");
    assert.equal(calls[0].url, "http://api.test/v1/admin/communities/c1/memberships");
  });

  it("addMember : POST, rôle hors énumération (owner, finance2) refusé avant envoi", async () => {
    const { services, calls, refreshes } = setup(() => json(memberRow, 201));
    await services.communities.addMember({ communityId: "c1", adminUserId: "u1", role: "support" });
    assert.equal(calls[0].body, '{"adminUserId":"u1","role":"support"}');
    assert.equal(refreshes(), 1);
    await assert.rejects(
      services.communities.addMember({ communityId: "c1", adminUserId: "u1", role: "owner" as never }),
      (e: ApiError) => Boolean(e.details?.role),
    );
    assert.equal(calls.length, 1);
  });

  it("updateMember : PATCH /v1/admin/memberships/:id (autre dossier), corps vide refusé", async () => {
    const { services, calls } = setup(() => json({ ...memberRow, role: "finance" }));
    const updated = await services.communities.updateMember({ membershipId: "m1", role: "finance" });
    assert.equal(updated.role, "finance");
    assert.equal(calls[0].url, "http://api.test/v1/admin/memberships/m1");
    await assert.rejects(services.communities.updateMember({ membershipId: "m1" }), (e: ApiError) => e.code === "VALIDATION_FAILED");
  });

  it("removeMember : DELETE, relecture ; 409 du dernier community_admin remonte avec le message de l'API", async () => {
    const ok = setup(() => json({ ...memberRow, status: "disabled" }));
    await ok.services.communities.removeMember({ membershipId: "m1" });
    assert.equal(ok.calls[0].method, "DELETE");
    assert.equal(ok.calls[0].url, "http://api.test/v1/admin/memberships/m1");
    assert.equal(ok.refreshes(), 1);

    const last = setup(() =>
      json({ error: { code: "CONFLICT", message: "Impossible de retirer le dernier administrateur de la communauté." } }, 409),
    );
    await assert.rejects(
      last.services.communities.removeMember({ membershipId: "m1" }),
      (e: ApiError) => e.status === 409 && e.message.includes("dernier administrateur"),
    );
    assert.equal(last.refreshes(), 0, "pas de relecture après un échec");
  });
});

const account = (platformRole: "owner" | "none", memberships: AdminMe["memberships"]): AdminMe => ({
  adminId: "x",
  email: "x@x.io",
  name: "X",
  platformRole,
  memberships,
});

describe("rôles : forfaits et membres (miroir de plan.manage, membership.*)", () => {
  const owner = account("owner", []);
  const admin = account("none", [{ communityId: "c1", role: "community_admin" }]);
  const support = account("none", [{ communityId: "c1", role: "support" }]);
  const finance = account("none", [{ communityId: "c1", role: "finance" }]);

  it("forfaits : lecture pour tout rôle local, écriture owner et community_admin seulement", () => {
    for (const me of [owner, admin, support, finance]) assert.equal(can(me, "plans.read", "c1"), true);
    assert.equal(can(owner, "plans.manage", "c1"), true);
    assert.equal(can(admin, "plans.manage", "c1"), true);
    assert.equal(can(support, "plans.manage", "c1"), false);
    assert.equal(can(finance, "plans.manage", "c1"), false);
  });

  it("membres : owner et community_admin de la communauté ; pas support, finance, ni une autre communauté", () => {
    assert.equal(can(owner, "staff.manage", "c1"), true);
    assert.equal(can(admin, "staff.manage", "c1"), true);
    assert.equal(can(admin, "staff.manage", "c2"), false);
    assert.equal(can(support, "staff.manage", "c1"), false);
    assert.equal(can(finance, "staff.manage", "c1"), false);
  });

  it("navigation : Forfaits pour tous les rôles locaux, Membres pour owner et community_admin", () => {
    const hrefs = (me: AdminMe) => allSections(buildNav(me, "c1")).flatMap((s) => s.items.map((i) => i.href));
    assert.ok(hrefs(support).includes("/c1/plans"));
    assert.ok(!hrefs(support).includes("/c1/members"));
    assert.ok(hrefs(admin).includes("/c1/members"));
    assert.ok(hrefs(owner).includes("/c1/members"));
    assert.ok(!hrefs(finance).includes("/c1/members"));
  });
});

describe("formulaires forfait et membre", () => {
  const valid = {
    code: "mensuel",
    name: "Mensuel",
    description: "",
    priceXaf: "2500",
    durationDays: "30",
    deviceLimit: "",
    badge: "",
    sortOrder: "",
    featured: false,
    active: true,
    endpointTier: "paid-gcp" as const,
    family: "limited_night" as const,
    quotaGb: "10",
    nightPrices: { "20-24": "200", "24-04": "", "20-04": "" },
    nightActive: { "20-24": true, "24-04": true, "20-04": true },
  };

  it("valeurs vides = défauts de l'API ; nombres convertis", () => {
    const body = planFormToBody(planFormSchema.parse(valid));
    assert.equal(body.priceXaf, 2500);
    assert.equal(body.durationDays, 30);
    assert.equal(body.badge, null);
    assert.equal(body.endpointTier, "paid-gcp");
    const update = planFormToUpdate(planFormSchema.omit({ code: true }).parse(valid));
    assert.equal(update.deviceLimit, 1);
    assert.equal(update.sortOrder, 0);
    assert.ok(!("code" in update));
    assert.equal(update.quotaBytes, 10_000_000_000);
    assert.deepEqual(update.nightOptions, [{ window: "20-24", priceXaf: 200, active: true }]);
  });

  it("modification : seuls les champs fournis partent, pas de termes sans famille", () => {
    assert.deepEqual(planFormToUpdate({ name: "Nouveau nom" }), { name: "Nouveau nom" });
    assert.ok(!("quotaBytes" in planFormToUpdate({ priceXaf: "3000" })));
  });

  it("refuse prix décimal, durée 0, appareils 11, code en majuscules", () => {
    const r = planFormSchema.safeParse({ ...valid, priceXaf: "12,5", durationDays: "0", deviceLimit: "11", code: "Mensuel" });
    assert.equal(r.success, false);
    if (!r.success) {
      assert.deepEqual(new Set(r.error.issues.map((i) => i.path[0])), new Set(["priceXaf", "durationDays", "deviceLimit", "code"]));
    }
  });

  it("membre : compte requis, rôle parmi les trois rôles de personnel", () => {
    assert.equal(memberFormSchema.safeParse({ adminUserId: " ", role: "support" }).success, false);
    assert.equal(memberFormSchema.safeParse({ adminUserId: "u1", role: "owner" }).success, false);
    assert.ok(memberFormSchema.safeParse({ adminUserId: "u1", role: "finance" }).success);
  });
});
