import { z } from "zod";
import { BYTES_PER_GB, NIGHT_WINDOWS, type NightWindow } from "../plans/plans.schema";

const xafOrNull = z.number().int().min(0).max(10_000_000).nullable();
const bpsOrNull = z.number().int().min(0).max(10_000).nullable();

/** Source : `pricingDto` de `apps/api/src/routes/pricing.ts`. */
export const pricingSettings = z.object({
  costPerGbXaf: xafOrNull,
  nightWindowCostXaf: z.object({
    "20-24": xafOrNull,
    "24-04": xafOrNull,
    "20-04": xafOrNull,
  }),
  platformMarginBps: bpsOrNull,
  maxCommissionBps: bpsOrNull,
  effectiveMaxCommissionBps: z.number().int(),
  floorConfigured: z.boolean(),
  updatedAt: z.string().nullable(),
  updatedBy: z.string().nullable(),
});
export type PricingSettings = z.infer<typeof pricingSettings>;

/** Source : `pricingSchema` (`PUT /v1/admin/pricing`). */
export const pricingUpdateBody = z.object({
  costPerGbXaf: xafOrNull,
  nightWindowCostXaf: z.object({
    "20-24": xafOrNull,
    "24-04": xafOrNull,
    "20-04": xafOrNull,
  }),
  platformMarginBps: bpsOrNull,
  maxCommissionBps: bpsOrNull,
});
export type PricingUpdate = z.input<typeof pricingUpdateBody>;

const optionalIntString = (label: string, max: number) =>
  z
    .string()
    .trim()
    .refine((v) => v === "" || (/^\d+$/.test(v) && Number(v) <= max), `${label} : entier entre 0 et ${max.toLocaleString("fr-FR")}.`);

const optionalPercentString = (label: string, maxPercent: number) =>
  z
    .string()
    .trim()
    .refine(
      (v) => v === "" || (/^\d+([.,]\d{1,2})?$/.test(v) && Number(v.replace(",", ".")) <= maxPercent),
      `${label} : entre 0 et ${maxPercent} %.`,
    );

export const pricingFormSchema = z.object({
  costPerGbXaf: optionalIntString("Coût du Go", 10_000_000),
  night20_24: optionalIntString("Plage 20 h – 24 h", 10_000_000),
  night24_04: optionalIntString("Plage 00 h – 04 h", 10_000_000),
  night20_04: optionalIntString("Plage 20 h – 04 h", 10_000_000),
  platformMarginPercent: optionalPercentString("Marge plateforme", 100),
  maxCommissionPercent: optionalPercentString("Plafond de commission", 100),
});
export type PricingFormValues = z.input<typeof pricingFormSchema>;

function toIntOrNull(raw: string): number | null {
  const s = raw.trim();
  return s === "" ? null : Number(s);
}

function toBpsOrNull(raw: string): number | null {
  const s = raw.trim();
  if (s === "") return null;
  return Math.round(Number(s.replace(",", ".")) * 100);
}

export function pricingFormToBody(values: PricingFormValues): PricingUpdate {
  return {
    costPerGbXaf: toIntOrNull(values.costPerGbXaf),
    nightWindowCostXaf: {
      "20-24": toIntOrNull(values.night20_24),
      "24-04": toIntOrNull(values.night24_04),
      "20-04": toIntOrNull(values.night20_04),
    },
    platformMarginBps: toBpsOrNull(values.platformMarginPercent),
    maxCommissionBps: toBpsOrNull(values.maxCommissionPercent),
  };
}

export function pricingToFormValues(s: PricingSettings): PricingFormValues {
  return {
    costPerGbXaf: s.costPerGbXaf === null ? "" : String(s.costPerGbXaf),
    night20_24: s.nightWindowCostXaf["20-24"] === null ? "" : String(s.nightWindowCostXaf["20-24"]),
    night24_04: s.nightWindowCostXaf["24-04"] === null ? "" : String(s.nightWindowCostXaf["24-04"]),
    night20_04: s.nightWindowCostXaf["20-04"] === null ? "" : String(s.nightWindowCostXaf["20-04"]),
    platformMarginPercent: s.platformMarginBps === null ? "" : String(s.platformMarginBps / 100),
    maxCommissionPercent: s.maxCommissionBps === null ? "" : String(s.maxCommissionBps / 100),
  };
}

/** Même formule que `withMargin` dans `apps/api/src/services/pricing.ts`. */
export function withMargin(costXaf: number, marginBps: number): number {
  return Math.ceil((costXaf * (10_000 + marginBps)) / 10_000);
}

/** Plancher du forfait de base : coût du Go × quota (arrondi au Go supérieur) + marge. */
export function baseFloorXaf(
  quotaBytes: number,
  settings: Pick<PricingSettings, "costPerGbXaf" | "platformMarginBps">,
): number | null {
  if (settings.costPerGbXaf === null || settings.platformMarginBps === null || quotaBytes <= 0) return null;
  const gigabytes = Math.ceil(quotaBytes / BYTES_PER_GB);
  return withMargin(gigabytes * settings.costPerGbXaf, settings.platformMarginBps);
}

/** Plancher d'une option de nuit : coût de la plage + marge. */
export function nightOptionFloorXaf(
  window: NightWindow,
  settings: Pick<PricingSettings, "nightWindowCostXaf" | "platformMarginBps">,
): number | null {
  const cost = settings.nightWindowCostXaf[window];
  if (cost === null || settings.platformMarginBps === null) return null;
  return withMargin(cost, settings.platformMarginBps);
}

export interface PriceBreakdown {
  costXaf: number;
  platformMarginXaf: number;
  floorXaf: number;
  priceXaf: number;
  aboveFloor: boolean;
  /** Gain estimé pour la communauté (sur la marge au-dessus du plancher ou commission). */
  gainXaf: number;
}

/**
 * Décomposition d'un prix saisi par l'admin par rapport au coût de base et à la marge
 * plateforme (pour `PriceIndicator`). Renvoie `null` si les tarifs ne sont pas configurés.
 */
export function breakdownBasePrice(
  quotaGb: number,
  priceXaf: number,
  settings: Pick<PricingSettings, "costPerGbXaf" | "platformMarginBps">,
): PriceBreakdown | null {
  if (settings.costPerGbXaf === null || settings.platformMarginBps === null || quotaGb <= 0) return null;
  const gbs = Math.ceil(quotaGb);
  const costXaf = gbs * settings.costPerGbXaf;
  const floorXaf = withMargin(costXaf, settings.platformMarginBps);
  const platformMarginXaf = Math.max(0, floorXaf - costXaf);
  const validPrice = Number.isFinite(priceXaf) && priceXaf > 0 ? Math.floor(priceXaf) : 0;
  const aboveFloor = validPrice >= floorXaf;
  const gainXaf = Math.max(0, validPrice - floorXaf);
  return { costXaf, platformMarginXaf, floorXaf, priceXaf: validPrice, aboveFloor, gainXaf };
}

/** Vérifie si un forfait existant est sous le plancher actuel. */
export function isPlanBelowFloor(
  plan: {
    quotaBytes?: number | null;
    priceXaf: number;
    nightOptions?: readonly { window: NightWindow; priceXaf: number; active: boolean }[];
  },
  settings: PricingSettings | null,
): boolean {
  if (!settings || !settings.floorConfigured) return false;
  if (plan.quotaBytes && plan.quotaBytes > 0) {
    const floor = baseFloorXaf(plan.quotaBytes, settings);
    if (floor !== null && plan.priceXaf < floor) return true;
  }
  if (plan.nightOptions) {
    for (const opt of plan.nightOptions) {
      if (!opt.active) continue;
      const floor = nightOptionFloorXaf(opt.window, settings);
      if (floor !== null && opt.priceXaf < floor) return true;
    }
  }
  return false;
}

export { NIGHT_WINDOWS, type NightWindow };
