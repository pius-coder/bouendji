import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { z } from "zod";
import { ApiError } from "@/server/api/api-error";
import { BaseService, type BaseServiceDeps } from "@/server/api/base-service";
import { endpoint } from "@/server/api/endpoint";
import { pageOf } from "@/server/api/schema-kit";
import { createServices } from "@/server/services";

interface Call {
  url: string;
  init: RequestInit;
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

const header = (c: Call, name: string) => new Headers(c.init.headers).get(name);

function deps(respond: (c: Call) => Response | Promise<Response>, token: string | null = "jwt-1") {
  const calls: Call[] = [];
  let mutations = 0;
  const d: BaseServiceDeps = {
    baseUrl: "http://api.test",
    accessKey: "KEY",
    getToken: async () => token ?? undefined,
    afterMutation: () => {
      mutations += 1;
    },
    fetch: (async (url: string, init: RequestInit) => {
      const call = { url, init };
      calls.push(call);
      return respond(call);
    }) as unknown as typeof fetch,
  };
  return { d, calls, mutations: () => mutations };
}

/** Service de sonde : exerce chaque option d'endpoint par le process générique. */
class Probe extends BaseService {
  private static readonly endpoints = {
    read: endpoint({
      method: "GET",
      path: "/:id/things",
      params: z.object({ id: z.string().min(1) }),
      query: z.object({ a: z.number().optional(), c: z.string().optional() }),
      response: z.object({ ok: z.boolean() }),
    }),
    open: endpoint({ method: "GET", path: "/pub", admin: false }),
    key: endpoint({ method: "POST", path: "/login", admin: "key", body: z.object({ e: z.number() }) }),
    write: endpoint({
      method: "POST",
      path: "/",
      body: z.object({ n: z.string().min(3, "3 min."), age: z.number().int().max(10, "Trop.") }),
      idempotent: true,
      refreshAfter: true,
    }),
    pages: endpoint({
      method: "GET",
      path: "/orders",
      query: z.object({ cursor: z.string().optional(), limit: z.number().optional() }),
      paginate: "cursor",
      response: pageOf(z.object({ id: z.string() })),
    }),
    slow: endpoint({ method: "GET", path: "/slow", timeout: 20 }),
    cachedAdmin: endpoint({ method: "GET", path: "/c", revalidate: 60 }),
    cachedPublic: endpoint({ method: "GET", path: "/c", admin: false, revalidate: 60, cacheTags: ["t"] }),
    remove: endpoint({ method: "DELETE", path: "/d" }),
    other: endpoint({ method: "GET", basePath: "/v1/other", path: "/", admin: false }),
  } as const;

  constructor(d: BaseServiceDeps) {
    super(d, { basePath: "/v1/probe" });
  }
  read(input: { id: string; a?: number; c?: string }) {
    const { id, ...query } = input;
    return this.call(Probe.endpoints.read, { params: { id }, query });
  }
  open() {
    return this.call(Probe.endpoints.open);
  }
  key() {
    return this.call(Probe.endpoints.key, { body: { e: 1 } });
  }
  write(body: { n: string; age: number }, idempotencyKey?: string) {
    return this.call(Probe.endpoints.write, { body, idempotencyKey });
  }
  pages(query: { cursor?: string; limit?: number }) {
    return this.call(Probe.endpoints.pages, { query });
  }
  slow() {
    return this.call(Probe.endpoints.slow);
  }
  cachedAdmin() {
    return this.call(Probe.endpoints.cachedAdmin);
  }
  cachedPublic() {
    return this.call(Probe.endpoints.cachedPublic);
  }
  remove() {
    return this.call(Probe.endpoints.remove);
  }
  other() {
    return this.call(Probe.endpoints.other);
  }
}

describe("process générique - URL et en-têtes", () => {
  it("admin par défaut : basePath + chemin relatif + params + query filtrée, clé + Bearer, no-store", async () => {
    const { d, calls } = deps(() => json({ ok: true, extra: 1 }));
    assert.deepEqual(await new Probe(d).read({ id: "a/b", a: 1 }), { ok: true });
    assert.equal(calls[0].url, "http://api.test/v1/probe/a%2Fb/things?a=1");
    assert.equal(header(calls[0], "x-access-key"), "KEY");
    assert.equal(header(calls[0], "authorization"), "Bearer jwt-1");
    assert.equal(calls[0].init.cache, "no-store");
    assert.equal(calls[0].init.method, "GET");
  });

  it("basePath d'endpoint : autre dossier, chemin '/' = le dossier lui-même", async () => {
    const { d, calls } = deps(() => json({}));
    await new Probe(d).other();
    assert.equal(calls[0].url, "http://api.test/v1/other");
  });

  it("admin:false n'envoie aucun secret", async () => {
    const { d, calls } = deps(() => json({}));
    await new Probe(d).open();
    assert.equal(header(calls[0], "x-access-key"), null);
    assert.equal(header(calls[0], "authorization"), null);
  });

  it('admin:"key" : clé sans Bearer, corps JSON, même sans session', async () => {
    const { d, calls } = deps(() => json({}), null);
    await new Probe(d).key();
    assert.equal(header(calls[0], "x-access-key"), "KEY");
    assert.equal(header(calls[0], "authorization"), null);
    assert.equal(calls[0].init.body, '{"e":1}');
    assert.equal(header(calls[0], "content-type"), "application/json");
  });

  it("admin sans session : 401 UNAUTHENTICATED, aucun appel", async () => {
    const { d, calls } = deps(() => json({}), null);
    await assert.rejects(new Probe(d).read({ id: "x" }), (e: ApiError) => e instanceof ApiError && e.status === 401);
    assert.equal(calls.length, 0);
  });

  it("idempotent : UUID généré ou clé fournie", async () => {
    const { d, calls } = deps(() => json({}));
    const p = new Probe(d);
    await p.write({ n: "abcd", age: 1 });
    await p.write({ n: "abcd", age: 1 }, "fixe");
    assert.match(header(calls[0], "idempotency-key") ?? "", /^[0-9a-f-]{36}$/);
    assert.equal(header(calls[1], "idempotency-key"), "fixe");
  });

  it("revalidate refusé avec admin, accepté sans (next.revalidate + tags)", async () => {
    const { d, calls } = deps(() => json({}));
    const p = new Probe(d);
    await assert.rejects(p.cachedAdmin(), /interdit/);
    assert.equal(calls.length, 0);
    await p.cachedPublic();
    assert.deepEqual((calls[0].init as { next?: unknown }).next, { revalidate: 60, tags: ["t"] });
    assert.equal(calls[0].init.cache, undefined);
  });

  it("204 renvoie undefined ; DELETE passe par le même process", async () => {
    const { d, calls } = deps(() => new Response(null, { status: 204 }));
    assert.equal(await new Probe(d).remove(), undefined);
    assert.equal(calls[0].init.method, "DELETE");
  });
});

describe("process générique - validation avant envoi", () => {
  it("corps invalide : VALIDATION_FAILED par champ, aucun appel réseau, pas de refresh", async () => {
    const { d, calls, mutations } = deps(() => json({}));
    await assert.rejects(new Probe(d).write({ n: "a", age: 99 }), (e: ApiError) => {
      assert.equal(e.status, 400);
      assert.equal(e.code, "VALIDATION_FAILED");
      assert.deepEqual(e.details, { n: "3 min.", age: "Trop." });
      return true;
    });
    assert.equal(calls.length, 0);
    assert.equal(mutations(), 0);
  });

  it("paramètre de chemin vide : refusé avant envoi", async () => {
    const { d, calls } = deps(() => json({}));
    await assert.rejects(new Probe(d).read({ id: "" }), (e: ApiError) => e.code === "VALIDATION_FAILED");
    assert.equal(calls.length, 0);
  });

  it("réponse hors schéma : BAD_RESPONSE", async () => {
    const { d } = deps(() => json({ ok: "oui" }));
    await assert.rejects(new Probe(d).read({ id: "x" }), (e: ApiError) => e.code === "BAD_RESPONSE");
  });

  it("refreshAfter : afterMutation appelé après succès seulement", async () => {
    const ok = deps(() => json({}));
    await new Probe(ok.d).write({ n: "abcd", age: 1 });
    assert.equal(ok.mutations(), 1);
    const ko = deps(() => json({ error: { code: "CONFLICT", message: "x" } }, 409));
    await assert.rejects(new Probe(ko.d).write({ n: "abcd", age: 1 }));
    assert.equal(ko.mutations(), 0);
  });
});

describe("process générique - pagination", () => {
  it("normalise items + nextCursor, envoie cursor/limit", async () => {
    const { d, calls } = deps(() => json({ items: [{ id: "a" }], nextCursor: "c2", extra: 1 }));
    assert.deepEqual(await new Probe(d).pages({ cursor: "c1", limit: 2 }), { items: [{ id: "a" }], nextCursor: "c2" });
    assert.equal(calls[0].url, "http://api.test/v1/probe/orders?cursor=c1&limit=2");
  });

  it("dernière page : pas de nextCursor", async () => {
    const { d } = deps(() => json({ items: [] }));
    assert.deepEqual(await new Probe(d).pages({}), { items: [] });
  });
});

describe("process générique - erreurs", () => {
  it("enveloppe { error } -> ApiError typée", async () => {
    const { d } = deps(() =>
      json({ error: { code: "VALIDATION_FAILED", message: "Non.", details: { slug: "pris" }, requestId: "r1" } }, 400),
    );
    await assert.rejects(new Probe(d).open(), (e: ApiError) => {
      assert.equal(e.status, 400);
      assert.equal(e.code, "VALIDATION_FAILED");
      assert.deepEqual(e.details, { slug: "pris" });
      assert.equal(e.requestId, "r1");
      return true;
    });
  });

  it("enveloppe plate acceptée ; 429 lit retryAfter du corps puis de l'en-tête", async () => {
    const a = deps(() => json({ code: "RATE_LIMITED", message: "Trop", retryAfter: 42 }, 429));
    await assert.rejects(new Probe(a.d).open(), (e: ApiError) => e.isRateLimited && e.retryAfter === 42);
    const b = deps(() => json({ error: { code: "RATE_LIMITED", message: "x" } }, 429, { "retry-after": "7" }));
    await assert.rejects(new Probe(b.d).open(), (e: ApiError) => e.retryAfter === 7);
  });

  it("502 non JSON -> INTERNAL ; 200 non JSON -> BAD_RESPONSE", async () => {
    const a = deps(() => new Response("<html>", { status: 502 }));
    await assert.rejects(new Probe(a.d).open(), (e: ApiError) => e.status === 502 && e.code === "INTERNAL");
    const b = deps(() => new Response("oops", { status: 200 }));
    await assert.rejects(new Probe(b.d).open(), (e: ApiError) => e.code === "BAD_RESPONSE");
  });

  it("réseau coupé -> UNREACHABLE ; délai dépassé -> TIMEOUT", async () => {
    const a = deps(() => {
      throw new TypeError("fetch failed");
    });
    await assert.rejects(new Probe(a.d).open(), (e: ApiError) => e.code === "UNREACHABLE" && e.status === 0);
    const b = deps(
      (c) =>
        new Promise((_, reject) => {
          const s = c.init.signal as AbortSignal;
          s.addEventListener("abort", () => reject(s.reason));
        }),
    );
    await assert.rejects(new Probe(b.d).slow(), (e: ApiError) => e.code === "TIMEOUT");
  });

  it("toResult ne contient ni pile ni statut", () => {
    assert.deepEqual(new ApiError({ status: 409, code: "CONFLICT", message: "m" }).toResult(), {
      ok: false,
      code: "CONFLICT",
      message: "m",
    });
  });
});

describe("services réels (fake fetch)", () => {
  it("login : clé seule, corps validé, JWT lu depuis la réponse", async () => {
    const { d, calls } = deps(
      () =>
        json({
          token: "t",
          expiresAt: "2026-10-23T20:00:00Z",
          mustChangePassword: false,
          admin: { id: "a", email: "x@y.zz", name: "N" },
        }),
      null,
    );
    const res = await createServices(d).auth.login({ identifier: " X@Y.ZZ ", password: "pw" });
    assert.equal(res.token, "t");
    assert.equal(calls[0].url, "http://api.test/v1/admin/auth/login");
    assert.equal(header(calls[0], "authorization"), null);
    assert.equal(calls[0].init.body, '{"identifier":"x@y.zz","password":"pw"}');
  });

  it("login : identifiant invalide refusé localement", async () => {
    const { d, calls } = deps(() => json({}), null);
    await assert.rejects(createServices(d).auth.login({ identifier: "pas-un-email", password: "pw" }), (e: ApiError) =>
      Boolean(e.details?.identifier),
    );
    assert.equal(calls.length, 0);
  });

  it("createCommunity : bornes de l'API recopiées (commission > 30 %)", async () => {
    const { d, calls } = deps(() => json({}));
    await assert.rejects(
      createServices(d).communities.createCommunity({ name: "Bouendji", slug: "bouendji", commissionBps: 5000 }),
      (e: ApiError) => Boolean(e.details?.commissionBps),
    );
    assert.equal(calls.length, 0);
  });

  it("revokeDevice : autre dossier, POST idempotent, refresh", async () => {
    const { d, calls, mutations } = deps(() => json({ deviceId: "d1", status: "revoked", sessionsRevoked: 2 }));
    const res = await createServices(d).devices.revokeDevice({ deviceId: "d1" });
    assert.equal(res.sessionsRevoked, 2);
    assert.equal(calls[0].url, "http://api.test/v1/admin/devices/d1/revoke");
    assert.ok(header(calls[0], "idempotency-key"));
    assert.equal(mutations(), 1);
  });

  it("listDevices / listOrders : chemin sous la communauté, curseur renvoyé", async () => {
    const dev = deps(() => json({ items: [] }));
    await createServices(dev.d).devices.listDevices({ communityId: "c1" });
    assert.equal(dev.calls[0].url, "http://api.test/v1/admin/communities/c1/devices");
    const ord = deps(() => json({ items: [], nextCursor: "n" }));
    const page = await createServices(ord.d).orders.listOrders({ communityId: "c1", limit: 20, status: "paid" });
    assert.equal(page.nextCursor, "n");
    assert.equal(ord.calls[0].url, "http://api.test/v1/admin/communities/c1/orders?limit=20&status=paid");
  });

  it("preparePayout : POST sous la communauté, corps vide accepté", async () => {
    const { d, calls } = deps(() =>
      json({ id: "p", communityId: "c", amountXaf: 10, status: "pending", commissionCount: 1, note: null, createdAt: null, createdBy: null }),
    );
    await createServices(d).payouts.preparePayout({ communityId: "c" });
    assert.equal(calls[0].url, "http://api.test/v1/admin/communities/c/payouts");
    assert.equal(calls[0].init.body, "{}");
  });

  it("payPayout : délai de 30 s déclaré sur l'endpoint (signal présent)", async () => {
    const { d, calls } = deps(() => json({ id: "p", status: "processing", providerRef: "r" }));
    await createServices(d).payouts.payPayout({ payoutId: "p" });
    assert.ok(calls[0].init.signal);
    assert.equal(calls[0].url, "http://api.test/v1/admin/payouts/p/pay");
  });
});
