/**
 * Réglages tarifaires et prix plancher (D121, D125).
 *
 * Aucune valeur tarifaire n'est codée ici. Les coûts, la marge et le plafond de
 * commission sont saisis par les owners (`PUT /v1/admin/pricing`). Tant qu'un
 * coût est absent, le plancher correspondant n'est pas calculé. Une marge
 * absente vaut **0 %** : le plancher reste le coût, il n'est jamais masqué par
 * un champ facultatif laissé vide (corrigé le 2026-10-30 : le dashboard
 * affichait « plancher 0 »). Le plafond de commission retombe sur l'ancien
 * 30 % (D35) tant que l'owner n'a rien réglé.
 */
import type { Queryable, Row } from "../db.js";
import { ApiFailure } from "../lib/errors.js";

export const NIGHT_WINDOWS = ["20-24", "24-04", "20-04"] as const;
export type NightWindow = (typeof NIGHT_WINDOWS)[number];

/**
 * D132 : `unlimited` = data illimitée pendant une durée (jours), prix propre au
 * forfait, servi par le pool partagé `free-labs` (pas de client 3x-ui).
 */
export const PLAN_FAMILIES = ["limited", "limited_night", "unlimited"] as const;
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
  /** D132 : coût d'un jour d'illimité, base du plancher des forfaits illimités. */
  unlimitedCostPerDayXaf: number | null;
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
      unlimitedCostPerDayXaf: null,
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
    unlimitedCostPerDayXaf: nullableInt(row.unlimited_cost_per_day_xaf),
    platformMarginBps: nullableInt(row.platform_margin_bps),
    maxCommissionBps: nullableInt(row.max_commission_bps),
    updatedAt: row.updated_at ? new Date(row.updated_at as string | Date).toISOString() : null,
    updatedBy: (row.updated_by as string | null) ?? null,
  };
}

export async function loadPricingSettings(db: Queryable): Promise<PricingSettings> {
  const row = await db.one<Row>(
    `SELECT cost_per_gb_xaf, night_window_cost_xaf, unlimited_cost_per_day_xaf, platform_margin_bps, max_commission_bps,
            updated_at, updated_by
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
 * plus la marge. `null` si le coût du Go n'est pas saisi ; une marge absente
 * signifie 0 %.
 */
export function baseFloorXaf(quotaBytes: number, settings: PricingSettings): number | null {
  if (settings.costPerGbXaf === null) return null;
  const gigabytes = Math.ceil(quotaBytes / BYTES_PER_GB);
  return withMargin(gigabytes * settings.costPerGbXaf, settings.platformMarginBps ?? 0);
}

/** Plancher d'une option de nuit : coût de la plage plus la marge (0 % si absente). */
export function nightOptionFloorXaf(window: NightWindow, settings: PricingSettings): number | null {
  const cost = settings.nightWindowCostXaf[window];
  if (cost === null) return null;
  return withMargin(cost, settings.platformMarginBps ?? 0);
}

/**
 * D132 : plancher d'un forfait illimité = coût d'un jour d'illimité × durée,
 * plus la marge (0 % si absente). `null` tant que ce coût n'est pas saisi.
 */
export function unlimitedFloorXaf(durationDays: number, settings: PricingSettings): number | null {
  if (settings.unlimitedCostPerDayXaf === null) return null;
  return withMargin(durationDays * settings.unlimitedCostPerDayXaf, settings.platformMarginBps ?? 0);
}

export interface FloorCheckInput {
  /** `null` : offre sans quota (ancien comportement), aucun plancher au Go. */
  quotaBytes: number | null;
  priceXaf: number;
  nightOptions: { window: NightWindow; priceXaf: number; active: boolean }[];
  /** D132 : `unlimited` se contrôle à la durée, pas au Go. */
  family?: PlanFamily | undefined;
  durationDays?: number | undefined;
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
  if (input.family === "unlimited") {
    if (input.durationDays === undefined) return;
    const floor = unlimitedFloorXaf(input.durationDays, settings);
    if (floor !== null && input.priceXaf < floor) throw belowFloor("priceXaf", floor);
    return;
  }
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