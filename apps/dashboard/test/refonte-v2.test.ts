import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { bffTargetPath } from "@/lib/bff-allowlist";
import { drawerOpenHref } from "@/lib/drawers";
import {
  isWhatsappGroupUrl,
  normalizeCameroonWhatsapp,
  previewPackageName,
  slugFromName,
} from "@/server/services/onboarding/onboarding.schema";
import {
  baseFloorXaf,
  breakdownBasePrice,
  isPlanBelowFloor,
  nightOptionFloorXaf,
  unlimitedFloorXaf,
  pricingFormSchema,
  pricingFormToBody,
  type PricingSettings,
} from "@/server/services/pricing/pricing.schema";

const SAMPLE_PRICING: PricingSettings = {
  costPerGbXaf: 100,
  nightWindowCostXaf: {
    "20-24": 300,
    "24-04": 400,
    "20-04": 600,
  },
  unlimitedCostPerDayXaf: 100,
  platformMarginBps: 2000, // 20 %
  maxCommissionBps: 3000, // 30 %
  effectiveMaxCommissionBps: 3000,
  floorConfigured: true,
  updatedAt: null,
  updatedBy: null,
};

describe("Refonte v2 : calculs de prix plancher et indicateur de répartition", () => {
  it("calcule le prix plancher de base et le supplément nuit selon la formule plateforme", () => {
    // 10 Go * 100 = 1000 XAF coût serveur ; marge plateforme 20% => ceil(1000 * 1.20) = 1200 XAF
    const floor = baseFloorXaf(10 * 1_000_000_000, SAMPLE_PRICING);
    assert.equal(floor, 1200);

    // Nuit 20-04 : coût 600 XAF ; marge 20% => ceil(600 * 1.20) = 720 XAF
    const nightFloor = nightOptionFloorXaf("20-04", SAMPLE_PRICING);
    assert.equal(nightFloor, 720);

    // Illimité 7 jours : 7 * 100 = 700 XAF coût ; marge 20% => ceil(700 * 1.20) = 840 XAF
    const unlimFloor = unlimitedFloorXaf(7, SAMPLE_PRICING);
    assert.equal(unlimFloor, 840);
  });

  it("ventile le prix entre serveur, marge plateforme et gain admin", () => {
    const breakdown = breakdownBasePrice(10, 2000, SAMPLE_PRICING);
    assert.ok(breakdown);
    assert.equal(breakdown.aboveFloor, true);
    assert.equal(breakdown.floorXaf, 1200);
    assert.equal(breakdown.costXaf, 1000);
    assert.equal(breakdown.platformMarginXaf, 200);
    assert.equal(breakdown.gainXaf, 800);
  });

  it("détecte un forfait ou une plage de nuit sous le plancher", () => {
    const okPlan = isPlanBelowFloor(
      {
        quotaBytes: 10 * 1024 ** 3,
        priceXaf: 2000,
        nightOptions: [{ window: "20-04", priceXaf: 1000, active: true }],
      },
      SAMPLE_PRICING,
    );
    assert.equal(okPlan, false);

    const lowNightPlan = isPlanBelowFloor(
      {
        quotaBytes: 10 * 1024 ** 3,
        priceXaf: 2000,
        nightOptions: [{ window: "20-04", priceXaf: 500, active: true }],
      },
      SAMPLE_PRICING,
    );
    assert.equal(lowNightPlan, true);

    const okUnlimited = isPlanBelowFloor(
      {
        family: "unlimited",
        durationDays: 7,
        priceXaf: 1000,
      },
      SAMPLE_PRICING,
    );
    assert.equal(okUnlimited, false);

    const lowUnlimited = isPlanBelowFloor(
      {
        family: "unlimited",
        durationDays: 7,
        priceXaf: 800,
      },
      SAMPLE_PRICING,
    );
    assert.equal(lowUnlimited, true);
  });

  it("valide et convertit le formulaire de tarifs plateforme", () => {
    const parsed = pricingFormSchema.parse({
      costPerGbXaf: "120",
      night20_24: "350",
      night24_04: "450",
      night20_04: "700",
      unlimitedCostPerDayXaf: "80",
      platformMarginPercent: "18,5",
      maxCommissionPercent: "25",
    });
    const body = pricingFormToBody(parsed);
    assert.equal(body.costPerGbXaf, 120);
    assert.equal(body.nightWindowCostXaf["20-24"], 350);
    assert.equal(body.unlimitedCostPerDayXaf, 80);
    assert.equal(body.platformMarginBps, 1850);
    assert.equal(body.maxCommissionBps, 2500);
  });
});

describe("Refonte v2 : helpers d'onboarding et validation WhatsApp", () => {
  it("valide les liens de groupe WhatsApp et les numéros camerounais (+237)", () => {
    assert.equal(isWhatsappGroupUrl("https://chat.whatsapp.com/AbCdEf123456"), true);
    assert.equal(isWhatsappGroupUrl("https://wa.me/237690000000"), false);

    assert.equal(normalizeCameroonWhatsapp("690 12 34 56"), "690123456");
    assert.equal(normalizeCameroonWhatsapp("+237677889900"), "677889900");
    assert.equal(normalizeCameroonWhatsapp("12345"), null);
  });

  it("génère le slug et l'identifiant de paquet Android depuis le nom", () => {
    assert.equal(slugFromName("Campus Douala Élite !"), "campus-douala-elite");
    assert.equal(previewPackageName("Campus Douala"), "cm.campus_douala.vpn");
  });
});

describe("Refonte v2 : navigation croisée entre tiroirs et liste blanche BFF", () => {
  it("drawerOpenHref remplace le tiroir actif tout en gardant l'onglet et les filtres", () => {
    const href = drawerOpenHref(
      "/c1/subscribers",
      { tab: "appareils", abonne: "u_1", q: "jean" },
      "appareil",
      "d_42",
    );
    assert.equal(href, "/c1/subscribers?tab=appareils&q=jean&appareil=d_42");
  });

  it("autorise les nouvelles routes de lecture BFF (users, orders, search, onboarding, pricing, night-slots)", () => {
    assert.equal(bffTargetPath(["users", "u_1"]), "/v1/admin/users/u_1");
    assert.equal(bffTargetPath(["orders", "o_1"]), "/v1/admin/orders/o_1");
    assert.equal(bffTargetPath(["search"]), "/v1/admin/search");
    assert.equal(bffTargetPath(["onboarding"]), "/v1/admin/onboarding");
    assert.equal(bffTargetPath(["pricing"]), "/v1/admin/pricing");
    assert.equal(bffTargetPath(["night-slots"]), "/v1/admin/night-slots");
  });
});
