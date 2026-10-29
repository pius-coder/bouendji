import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ApiError } from "@/server/api/api-error";
import type { BaseServiceDeps } from "@/server/api/base-service";
import { passwordChangeTarget } from "@/server/services/admin-auth/account-guard";
import {
  adminMe,
  loginBody,
  normalizeIdentifier,
  passwordChangeBody,
  PASSWORD_CHANGE_REQUIRED,
  updateMeBody,
} from "@/server/services/admin-auth/admin-auth.schema";
import { createServices } from "@/server/services";

interface Call {
  url: string;
  init: RequestInit;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const header = (c: Call, name: string) => new Headers(c.init.headers).get(name);

function deps(respond: (c: Call) => Response, token: string | null = "jwt-1") {
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

const wireMe = {
  id: "adm_1",
  email: "ada@example.cm",
  name: "Ada",
  whatsappNumber: "699001122",
  telegramChatId: null,
  platformRoles: ["reseau"],
  platformRole: "reseau",
  mustChangePassword: false,
  memberships: [{ communityId: "c1", role: "support" }],
  onboarding: null,
};

describe("identifiant de connexion", () => {
  it("email : minuscules et espaces retirés", () => {
    assert.equal(normalizeIdentifier("  Ada@Example.CM "), "ada@example.cm");
  });

  it("numéro WhatsApp : +237 et séparateurs retirés, 9 chiffres", () => {
    assert.equal(normalizeIdentifier("+237 6 99 00 11 22"), "699001122");
    assert.equal(normalizeIdentifier("00237 699-00-11-22"), "699001122");
    assert.equal(normalizeIdentifier("699 00 11 22"), "699001122");
  });

  it("refuse ce qui n'est ni un email ni un numéro", () => {
    assert.equal(normalizeIdentifier("pas-un-email"), null);
    assert.equal(normalizeIdentifier("12345"), null);
    assert.equal(normalizeIdentifier("a@b"), null);
  });

  it("loginBody : identifiant normalisé, message français si invalide", () => {
    const ok = loginBody.safeParse({ identifier: "+237 699001122", password: "x" });
    assert.equal(ok.success, true);
    if (ok.success) assert.equal(ok.data.identifier, "699001122");
    const ko = loginBody.safeParse({ identifier: "nope", password: "x" });
    assert.equal(ko.success, false);
    if (!ko.success) assert.match(ko.error.issues[0].message, /Email ou numéro WhatsApp invalide/);
  });
});

describe("contrat /me", () => {
  it("adminMe : id renommé en adminId, champs de R1 lus", () => {
    const me = adminMe.parse(wireMe);
    assert.equal(me.adminId, "adm_1");
    assert.equal(me.platformRole, "reseau");
    assert.equal(me.mustChangePassword, false);
    assert.equal(me.whatsappNumber, "699001122");
    assert.equal(me.telegramChatId, null);
  });

  it("adminMe : rôle plateforme inconnu refusé", () => {
    assert.equal(adminMe.safeParse({ ...wireMe, platformRole: "root" }).success, false);
  });

  it("updateMeBody : numéro vide efface, numéro à 8 chiffres refusé", () => {
    const cleared = updateMeBody.parse({ whatsappNumber: "" });
    assert.equal(cleared.whatsappNumber, null);
    assert.equal(updateMeBody.safeParse({ whatsappNumber: "12345678" }).success, false);
  });

  it("passwordChangeBody : non vide et différent de l'actuel", () => {
    const empty = passwordChangeBody.safeParse({ currentPassword: "ancien-mdp-ok", newPassword: "" });
    assert.equal(empty.success, false);
    const short = passwordChangeBody.safeParse({ currentPassword: "ancien-mdp-ok", newPassword: "court" });
    assert.equal(short.success, true);
    const same = passwordChangeBody.safeParse({ currentPassword: "identique-123", newPassword: "identique-123" });
    assert.equal(same.success, false);
    const fine = passwordChangeBody.safeParse({ currentPassword: "ancien-mdp-ok", newPassword: "nouveau-mdp-2026" });
    assert.equal(fine.success, true);
  });
});

describe("service du compte : URL, en-têtes, corps", () => {
  it("login : clé seule, corps identifier, session lue", async () => {
    const { d, calls } = deps(() =>
      json({ token: "t", expiresAt: "2026-10-26T20:00:00Z", mustChangePassword: true, admin: {} }),
    );
    const res = await createServices({ ...d, getToken: async () => undefined }).auth.login({
      identifier: "+237699001122",
      password: "pw",
    });
    assert.equal(res.mustChangePassword, true);
    assert.equal(calls[0].url, "http://api.test/v1/admin/auth/login");
    assert.equal(header(calls[0], "authorization"), null);
    assert.equal(calls[0].init.body, '{"identifier":"699001122","password":"pw"}');
  });

  it("logout : POST /auth/logout avec Bearer, 204 sans corps", async () => {
    const { d, calls } = deps(() => new Response(null, { status: 204 }));
    assert.equal(await createServices(d).auth.logout(), undefined);
    assert.equal(calls[0].url, "http://api.test/v1/admin/auth/logout");
    assert.equal(calls[0].init.method, "POST");
    assert.equal(header(calls[0], "authorization"), "Bearer jwt-1");
  });

  it("changePassword : POST /me/password, nouveau JWT renvoyé", async () => {
    const { d, calls } = deps(() => json({ token: "t2", expiresAt: "2026-10-26T21:00:00Z" }));
    const res = await createServices(d).auth.changePassword({
      currentPassword: "ancien-mdp-ok",
      newPassword: "nouveau-mdp-2026",
    });
    assert.equal(res.token, "t2");
    assert.equal(calls[0].url, "http://api.test/v1/admin/me/password");
    assert.equal(calls[0].init.method, "POST");
  });

  it("changePassword : refusé localement si vide, aucun appel", async () => {
    const { d, calls } = deps(() => json({}));
    await assert.rejects(
      createServices(d).auth.changePassword({ currentPassword: "ancien-mdp-ok", newPassword: "" }),
      (e: ApiError) => Boolean(e.details?.newPassword),
    );
    assert.equal(calls.length, 0);
  });

  it("revokeSession : DELETE /me/sessions/:id, relecture après mutation", async () => {
    const { d, calls, mutations } = deps(() => new Response(null, { status: 204 }));
    await createServices(d).auth.revokeSession("ses_9");
    assert.equal(calls[0].url, "http://api.test/v1/admin/me/sessions/ses_9");
    assert.equal(calls[0].init.method, "DELETE");
    assert.equal(mutations(), 1);
  });

  it("revokeOtherSessions : DELETE /me/sessions?scope=others", async () => {
    const { d, calls } = deps(() => new Response(null, { status: 204 }));
    await createServices(d).auth.revokeOtherSessions();
    assert.equal(calls[0].url, "http://api.test/v1/admin/me/sessions?scope=others");
    assert.equal(calls[0].init.method, "DELETE");
  });

  it("listSessions : GET /me/sessions validé, current conservé", async () => {
    const { d, calls } = deps(() =>
      json({
        sessions: [
          { id: "s1", createdAt: "2026-10-26T08:00:00Z", lastSeenAt: "2026-10-26T09:00:00Z", userAgent: null, current: true },
        ],
      }),
    );
    const res = await createServices(d).auth.listSessions();
    assert.equal(res.sessions[0].current, true);
    assert.equal(calls[0].url, "http://api.test/v1/admin/me/sessions");
  });

  it("PATCH /me : corps validé, relecture après mutation", async () => {
    const { d, calls, mutations } = deps(() => json(wireMe));
    const me = await createServices(d).auth.updateMe({ name: "Ada" });
    assert.equal(me.adminId, "adm_1");
    assert.equal(calls[0].url, "http://api.test/v1/admin/me");
    assert.equal(calls[0].init.method, "PATCH");
    assert.equal(mutations(), 1);
  });
});

describe("403 PASSWORD_CHANGE_REQUIRED", () => {
  it("passwordChangeTarget : envoie vers /mot-de-passe", () => {
    const err = new ApiError({ status: 403, code: PASSWORD_CHANGE_REQUIRED, message: "Changez votre mot de passe." });
    assert.equal(passwordChangeTarget(err), "/mot-de-passe");
  });

  it("passwordChangeTarget : une autre erreur 403 ne redirige pas", () => {
    assert.equal(passwordChangeTarget(new ApiError({ status: 403, code: "FORBIDDEN", message: "Interdit." })), null);
    assert.equal(passwordChangeTarget(new Error("x")), null);
  });
});
