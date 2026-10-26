/**
 * Réglages tarifaires et prix plancher (D121, D125).
 *
 * Aucune valeur tarifaire n'est codée ici. Les coûts, la marge et le plafond de
 * commission sont saisis par les owners (`PUT /v1/admin/pricing`). Tant qu'un
 * réglage est absent, la règle correspondante ne s'applique pas : le plancher
 * n'est pas calculé, et le plafond de commission retombe sur l'ancien 30 % (D35),
 * seule valeur conservée en dur, et seulement comme repli.
 */
import type { Queryable, Row } from "../db.js";
import { ApiFailure } from "../lib/errors.js";

export const NIGHT_WINDOWS = ["20-24", "24-04", "20-04"] as const;
export type NightWindow = (typeof NIGHT_WINDOWS)[number];

export const PLAN_FAMILIES = ["limited", "limited_night"] as const;
export type PlanFamily = (typeof PLAN_FAMILIES)[number];

/**
 * Le Go est décimal (10^9 octets). Choix à confirmer par l'owner : le plancher
 * arrondit au Go supérieur.
 */
export const BYTES_PER_GB = 1_000_000_000;

/** D35 : repli du plafond de commission tant que l'owner n'a rien réglé. */
export const FALLBACK_MAX_COMMISSION_BPS = 3000;

export interface PricingSettings {
  costPerGbXaf: number | null;
  nightWindowCostXaf: Record<NightWindow, number | null>;
  platformMarginBps: number | null;
  maxCommissionBps: number | null;
  updatedAt: string | null;
  updatedBy: string | null;
}

const emptyNightCosts = (): Record<NightWindow, number | null> => ({ "20-24": null, "24-04": null, "20-04": null });

const nullableInt = (value: unknown): number | null =>
  value === null || value === undefined ? null : Number(value);

export function settingsFromRow(row: Row | null): PricingSettings {
  if (!row) {
    return {
      costPerGbXaf: null,
      nightWindowCostXaf: emptyNightCosts(),
      platformMarginBps: null,
      maxCommissionBps: null,
      updatedAt: null,
      updatedBy: null,
    };
  }
  const raw = (row.night_window_cost_xaf ?? {}) as Record<string, unknown>;
  const nightWindowCostXaf = emptyNightCosts();
  for (const window of NIGHT_WINDOWS) nightWindowCostXaf[window] = nullableInt(raw[window]);
  return {
    costPerGbXaf: nullableInt(row.cost_per_gb_xaf),
    nightWindowCostXaf,
    platformMarginBps: nullableInt(row.platform_margin_bps),
    maxCommissionBps: nullableInt(row.max_commission_bps),
    updatedAt: row.updated_at ? new Date(row.updated_at as string | Date).toISOString() : null,
    updatedBy: (row.updated_by as string | null) ?? null,
  };
}

export async function loadPricingSettings(db: Queryable): Promise<PricingSettings> {
  const row = await db.one<Row>(
    `SELECT cost_per_gb_xaf, night_window_cost_xaf, platform_margin_bps, max_commission_bps, updated_at, updated_by
       FROM pricing_settings WHERE id = 'current'`,
  );
  return settingsFromRow(row);
}

/** Plafond de commission effectif, en points de base. */
export function commissionCapBps(settings: PricingSettings): number {
  return settings.maxCommissionBps ?? FALLBACK_MAX_COMMISSION_BPS;
}

function withMargin(costXaf: number, marginBps: number): number {
  return Math.ceil((costXaf * (10_000 + marginBps)) / 10_000);
}

/**
 * Plancher du forfait de base : coût du Go × quota (arrondi au Go supérieur),
 * plus la marge. `null` si les réglages nécessaires ne sont pas saisis.
 */
export function baseFloorXaf(quotaBytes: number, settings: PricingSettings): number | null {
  if (settings.costPerGbXaf === null || settings.platformMarginBps === null) return null;
  const gigabytes = Math.ceil(quotaBytes / BYTES_PER_GB);
  return withMargin(gigabytes * settings.costPerGbXaf, settings.platformMarginBps);
}

/** Plancher d'une option de nuit : coût de la plage plus la marge. */
export function nightOptionFloorXaf(window: NightWindow, settings: PricingSettings): number | null {
  const cost = settings.nightWindowCostXaf[window];
  if (cost === null || settings.platformMarginBps === null) return null;
  return withMargin(cost, settings.platformMarginBps);
}

export interface FloorCheckInput {
  /** `null` : offre sans quota (ancien comportement), aucun plancher. */
  quotaBytes: number | null;
  priceXaf: number;
  nightOptions: { window: NightWindow; priceXaf: number; active: boolean }[];
}

function belowFloor(field: string, floorXaf: number, window?: NightWindow): ApiFailure {
  return new ApiFailure(409, "CONFLICT", "Le prix est sous le plancher calculé à partir des réglages tarifaires.", {
    reason: "BELOW_FLOOR",
    field,
    floorXaf: String(floorXaf),
    ...(window ? { window } : {}),
  });
}

/**
 * Refuse un prix sous le plancher. Sans réglages saisis, rien n'est refusé :
 * la règle ne s'applique qu'une fois les coûts connus.
 */
export function assertAboveFloor(settings: PricingSettings, input: FloorCheckInput): void {
  if (input.quotaBytes === null) return;
  const base = baseFloorXaf(input.quotaBytes, settings);
  if (base !== null && input.priceXaf < base) throw belowFloor("priceXaf", base);
  for (const option of input.nightOptions) {
    if (!option.active) continue;
    const floor = nightOptionFloorXaf(option.window, settings);
    if (floor !== null && option.priceXaf < floor) {
      throw belowFloor(`nightOptions.${option.window}`, floor, option.window);
    }
  }
}
