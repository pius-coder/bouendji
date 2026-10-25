import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { can } from "@/lib/roles";
import type { ApiError } from "@/server/api/api-error";
import type { BaseServiceDeps } from "@/server/api/base-service";
import { createServices } from "@/server/services";
import type { AdminMe } from "@/server/services/admin-auth/admin-auth.schema";
import {
  manualEndpointFormSchema,
  manualEndpointFormToBody,
  type ManualEndpointFormValues,
} from "@/server/services/network/network.schema";

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

const UUID = "0d6a3c1e-2b4f-4c8a-9e7d-1f2a3b4c5d6e";

const form: ManualEndpointFormValues = {
  group: "cloudrun-uswest1",
  label: "Oregon",
  region: "Oregon",
  address: "203.0.113.10",
  port: "443",
  snis: "a.example.com\nb.example.com, c.example.com",
  hostHeader: "",
  wsPath: "/ws",
  uuid: UUID,
  ttlHours: "5",
  tier: "free-labs",
};

const created = { group: "cloudrun-uswest1", count: 3, ids: ["e1", "e2", "e3"], expiresAt: "2026-10-25T12:00:00.000Z", poolRevision: 7 };

describe("réseau : ajout manuel de nœuds", () => {
  it("formulaire → corps : SNI découpés, nombres convertis, Host vide = null", () => {
    const body = manualEndpointFormToBody(manualEndpointFormSchema.parse(form));
    assert.deepEqual(body.snis, ["a.example.com", "b.example.com", "c.example.com"]);
    assert.equal(body.port, 443);
    assert.equal(body.ttlHours, 5);
    assert.equal(body.hostHeader, null);
  });

  it("formulaire : SNI invalide, 13 SNI, UUID faux, durée 721 h refusés", () => {
    const thirteen = Array.from({ length: 13 }, (_, i) => `s${i}.example.com`).join("\n");
    for (const [field, value] of [
      ["snis", "bad_host!"],
      ["snis", thirteen],
      ["snis", "  "],
      ["uuid", "pas-un-uuid"],
      ["ttlHours", "721"],
      ["wsPath", "ws"],
    ] as const) {
      const r = manualEndpointFormSchema.safeParse({ ...form, [field]: value });
      assert.equal(r.success, false, `${field}=${value}`);
      if (!r.success) assert.equal(r.error.issues[0].path[0], field);
    }
  });

  it("POST /v1/admin/endpoints/manual : idempotent, relecture après succès", async () => {
    const { services, calls, refreshes } = setup(() => json(created, 201));
    const result = await services.network.addManualEndpoints(manualEndpointFormToBody(manualEndpointFormSchema.parse(form)));
    assert.equal(result.count, 3);
    assert.equal(calls[0].method, "POST");
    assert.equal(calls[0].url, "http://api.test/v1/admin/endpoints/manual");
    assert.ok(calls[0].headers.get("idempotency-key"));
    assert.equal(JSON.parse(calls[0].body ?? "{}").tier, "free-labs");
    assert.equal(refreshes(), 1);
  });

  it("le service refuse localement un SNI invalide (aucun appel)", async () => {
    const { services, calls } = setup(() => json(created, 201));
    await assert.rejects(
      services.network.addManualEndpoints({ ...manualEndpointFormToBody(manualEndpointFormSchema.parse(form)), snis: ["bad_host!"] }),
      (e: ApiError) => e.code === "VALIDATION_FAILED",
    );
    assert.equal(calls.length, 0);
  });
});

describe("appareils : fichier de secours .bvpn", () => {
  const issued = {
    bundleId: "b-123456789",
    deviceId: "d1",
    notAfter: "2026-10-25T13:00:00.000Z",
    singleUse: true,
    endpointCount: 2,
    file: { v: 1, bundleId: "b-123456789", envelope: { opaque: true }, sig: "x" },
  };

  it("POST /v1/admin/devices/:id/offline-bundles : durée transmise, conteneur rendu tel quel", async () => {
    const { services, calls } = setup(() => json(issued, 201));
    const result = await services.devices.issueOfflineBundle({ deviceId: "d1", ttlHours: 6 });
    assert.equal(calls[0].url, "http://api.test/v1/admin/devices/d1/offline-bundles");
    assert.equal(calls[0].body, '{"ttlHours":6}');
    assert.deepEqual(result.file, issued.file);
  });

  it("durée hors bornes de l'API (73 h) refusée avant envoi", async () => {
    const { services, calls } = setup(() => json(issued, 201));
    await assert.rejects(services.devices.issueOfflineBundle({ deviceId: "d1", ttlHours: 73 }));
    assert.equal(calls.length, 0);
  });
});

describe("rôles : nouvelles capacités (miroir de permitted())", () => {
  const admin: AdminMe = {
    adminId: "c",
    email: "c@x.io",
    name: "C",
    platformRole: "none",
    memberships: [{ communityId: "c1", role: "community_admin" }],
  };
  const finance: AdminMe = { ...admin, memberships: [{ communityId: "c1", role: "finance" }] };
  const support: AdminMe = { ...admin, memberships: [{ communityId: "c1", role: "support" }] };

  it("offline_bundle.issue : community_admin et support de la communauté, pas finance", () => {
    assert.equal(can(admin, "devices.offline", "c1"), true);
    assert.equal(can(support, "devices.offline", "c1"), true);
    assert.equal(can(finance, "devices.offline", "c1"), false);
    assert.equal(can(support, "devices.offline", "c2"), false);
  });

  it("endpoint.write (ajout manuel) : propriétaire seulement", () => {
    assert.equal(can(admin, "network.write", null), false);
  });
});
