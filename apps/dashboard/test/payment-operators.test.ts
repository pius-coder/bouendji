import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { STATUS } from "@/components/common/status-badge";
import { allSections, buildNav } from "@/components/shell/nav-model";
import { can } from "@/lib/roles";
import type { BaseServiceDeps } from "@/server/api/base-service";
import { createServices } from "@/server/services";
import type { AdminMe } from "@/server/services/admin-auth/admin-auth.schema";
import {
  CUT_WARNING,
  MANUAL_NOTICE,
  NOTICE_PREVIEW,
  noticeModeOf,
  operatorParams,
  paymentOperatorsState,
  paymentOperatorUpdateBody,
} from "@/server/services/payment-operators/payment-operators.schema";

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

const apiState = {
  items: [
    { operator: "orange", label: "Orange Money", available: false, updatedAt: "2026-10-30T10:00:00.000Z", updatedByName: "O" },
    { operator: "momo", label: "MTN MoMo", available: true, updatedAt: null, updatedByName: null },
  ],
  mode: "orange_down",
  automaticDetection: false,
  canManage: true,
};

interface Call {
  url: string;
  init: RequestInit;
}

function deps(respond: () => Response) {
  const calls: Call[] = [];
  let mutations = 0;
  const d: BaseServiceDeps = {
    baseUrl: "http://api.test",
    accessKey: "KEY",
    getToken: async () => "jwt-1",
    afterMutation: () => {
      mutations += 1;
    },
    fetch: (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return respond();
    }) as unknown as typeof fetch,
  };
  return { d, calls, mutations: () => mutations };
}

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });

describe("opérateurs de paiement (106) : miroir de permitted()", () => {
  it("modifier : owner seul", () => {
    assert.equal(can(owner, "payment_operators.manage", null), true);
    assert.equal(can(communityAdmin, "payment_operators.manage", null), false);
    assert.equal(can(communityAdmin, "payment_operators.manage", "c1"), false);
    assert.equal(can(finance, "payment_operators.manage", "c1"), false);
  });

  it("navigation : « Paiements » dans Plateforme pour l'owner seulement", () => {
    const hrefs = (me: AdminMe) => allSections(buildNav(me, "c1")).flatMap((s) => s.items.map((i) => i.href));
    assert.ok(hrefs(owner).includes("/payments"));
    assert.equal(hrefs(communityAdmin).includes("/payments"), false);
    assert.equal(hrefs(finance).includes("/payments"), false);
  });
});

describe("opérateurs de paiement (106) : schémas et appels", () => {
  it("corps strict : un booléen, rien d'autre ; opérateur connu seulement", () => {
    assert.equal(paymentOperatorUpdateBody.safeParse({ available: false }).success, true);
    assert.equal(paymentOperatorUpdateBody.safeParse({ available: "non" }).success, false);
    assert.equal(paymentOperatorUpdateBody.safeParse({ available: true, operator: "momo" }).success, false);
    assert.equal(operatorParams.safeParse({ operator: "orange" }).success, true);
    assert.equal(operatorParams.safeParse({ operator: "wave" }).success, false);
  });

  it("réponse de l'API lue telle quelle ; la détection automatique est toujours fausse", () => {
    const state = paymentOperatorsState.parse(apiState);
    assert.equal(state.mode, "orange_down");
    assert.equal(state.items[0]?.updatedByName, "O");
    assert.equal(paymentOperatorsState.safeParse({ ...apiState, automaticDetection: true }).success, false);
  });

  it("getState : GET ; setAvailability : PUT sous l'opérateur, corps exact, relecture demandée", async () => {
    const read = deps(() => json(apiState));
    await createServices(read.d).paymentOperators.getState();
    assert.equal(read.calls[0]?.url, "http://api.test/v1/admin/payment-operators");
    assert.equal(read.calls[0]?.init.method, "GET");

    const write = deps(() => json({ ...apiState, changed: true }));
    const res = await createServices(write.d).paymentOperators.setAvailability("orange", { available: false });
    assert.equal(res.changed, true);
    assert.equal(write.calls[0]?.url, "http://api.test/v1/admin/payment-operators/orange");
    assert.equal(write.calls[0]?.init.method, "PUT");
    assert.equal(write.calls[0]?.init.body, '{"available":false}');
    assert.equal(write.mutations(), 1);
  });
});

describe("opérateurs de paiement (106) : affichage", () => {
  it("mode d'avis : même règle que l'API", () => {
    const of = (orange: boolean, momo: boolean) =>
      noticeModeOf([
        { operator: "orange", available: orange },
        { operator: "momo", available: momo },
      ]);
    assert.equal(of(true, true), "direct");
    assert.equal(of(false, true), "orange_down");
    assert.equal(of(true, false), "momo_down");
    assert.equal(of(false, false), "both_down");
  });

  it("aperçu : textes décidés par l'owner, aucun bouton quand les deux sont coupés", () => {
    assert.equal(
      NOTICE_PREVIEW.orange_down.message,
      "Orange Money est indisponible pour le moment. Choisissez MTN MoMo sur la page suivante, ou payez l'administrateur de votre communauté.",
    );
    assert.equal(
      NOTICE_PREVIEW.momo_down.message,
      "MTN MoMo est indisponible pour le moment. Choisissez Orange Money sur la page suivante, ou payez l'administrateur de votre communauté.",
    );
    assert.equal(
      NOTICE_PREVIEW.both_down.message,
      "Les paiements en ligne sont indisponibles pour le moment. Payez l'administrateur de votre communauté.",
    );
    assert.equal(NOTICE_PREVIEW.orange_down.withCheckout, true);
    assert.equal(NOTICE_PREVIEW.momo_down.withCheckout, true);
    assert.equal(NOTICE_PREVIEW.both_down.withCheckout, false);
  });

  it("avertissements et mention manuelle présents ; statuts dédiés", () => {
    assert.match(MANUAL_NOTICE, /aucune détection automatique/);
    assert.match(CUT_WARNING.orange_down, /Orange Money est coupé/);
    assert.match(CUT_WARNING.momo_down, /MTN MoMo est coupé/);
    assert.match(CUT_WARNING.both_down, /aucun paiement en ligne/);
    assert.equal(STATUS.operator_available?.label, "Disponible");
    assert.equal(STATUS.operator_unavailable?.label, "Indisponible");
  });
});
