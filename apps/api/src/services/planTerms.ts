/**
 * Termes d'un forfait : famille, quota, options de nuit (R6, D115, D132).
 *
 * Ce module porte ce qui est commun aux routes admin, catalogue et commande :
 * le schéma de saisie, la lecture SQL des options en une passe, le DTO et
 * l'écriture des options. La révision (`planRevision`) reste dans
 * `payments.ts`, unique source de la comparaison côté achat.
 */
import { z } from "zod";
import type { Queryable, Row } from "../db.js";
import { fail } from "../lib/errors.js";
import { PLAN_FAMILIES, NIGHT_WINDOWS, type NightWindow, type PlanFamily } from "./pricing.js";
import { customTermsSql } from "./customOffer.js";

export interface NightOptionInput {
  window: NightWindow;
  priceXaf: number;
  active: boolean;
}

const nightOptionSchema = z
  .object({
    window: z.enum(NIGHT_WINDOWS),
    priceXaf: z.number().int().min(1).max(10_000_000),
    active: z.boolean().optional(),
  })
  .strict();

const nightOptionsSchema = z
  .array(nightOptionSchema)
  .max(NIGHT_WINDOWS.length)
  .refine((items) => new Set(items.map((item) => item.window)).size === items.length, "Plage en double.");

/** Champs R6 ajoutés à la saisie d'un forfait. */
export const planTermsSchema = {
  family: z.enum(PLAN_FAMILIES).optional(),
  quotaBytes: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER).nullable().optional(),
  nightOptions: nightOptionsSchema.optional(),
};

/** Valeurs par défaut d'un forfait sans famille explicite. */
export function resolveTerms(input: {
  family?: PlanFamily | undefined;
  quotaBytes?: number | null | undefined;
  nightOptions?: { window: NightWindow; priceXaf: number; active?: boolean | undefined }[] | undefined;
}): { family: PlanFamily; quotaBytes: number | null; nightOptions: NightOptionInput[] } {
  return {
    family: input.family ?? "limited",
    quotaBytes: input.quotaBytes ?? null,
    nightOptions: (input.nightOptions ?? []).map((option) => ({
      window: option.window,
      priceXaf: option.priceXaf,
      active: option.active ?? true,
    })),
  };
}

/** Cohérence famille / quota / options, vérifiée avant toute écriture. */
export function checkTerms(terms: { family: PlanFamily; quotaBytes: number | null; nightOptions: NightOptionInput[] }): void {
  if (terms.family === "limited_night" && terms.quotaBytes === null) {
    throw fail.validation({ quotaBytes: "Quota requis pour la famille limité + nuit." });
  }
  if (terms.family === "limited" && terms.nightOptions.length > 0) {
    throw fail.validation({ nightOptions: "Les plages de nuit ne s'appliquent qu'à la famille limité + nuit." });
  }
  // D132 : illimité = durée seule ; ni quota, ni plage de nuit.
  if (terms.family === "unlimited" && terms.quotaBytes !== null) {
    throw fail.validation({ quotaBytes: "Un forfait illimité n'a pas de quota." });
  }
  if (terms.family === "unlimited" && terms.nightOptions.length > 0) {
    throw fail.validation({ nightOptions: "Les plages de nuit ne s'appliquent qu'à la famille limité + nuit." });
  }
}

/**
 * Colonnes SQL des termes d'un forfait, lues avec les options en une seule
 * passe (`jsonb_agg`). `prefix` évite les collisions quand la requête joint
 * déjà une table portant les mêmes noms (la commande, par exemple).
 */
export function planTermsSql(alias: string, prefix = ""): string {
  return `${alias}.family AS ${prefix}family,
          ${alias}.quota_bytes AS ${prefix}quota_bytes,
          ${alias}.endpoint_tier AS ${prefix}endpoint_tier,
          COALESCE((SELECT jsonb_agg(jsonb_build_object('night_window', n.night_window, 'price_xaf', n.price_xaf, 'active', n.active)
                                     ORDER BY n.night_window)
                      FROM plan_night_options n WHERE n.plan_id = ${alias}.id), '[]'::jsonb) AS ${prefix}night_options,
          ${customTermsSql(alias, prefix)}`;
}

export interface NightOptionRow {
  night_window: string;
  price_xaf: number | string;
  active: boolean;
}

/** Options actives, dans l'ordre stable des plages. */
export function activeNightOptions(raw: unknown): { window: NightWindow; priceXaf: number }[] {
  const list = Array.isArray(raw) ? (raw as NightOptionRow[]) : [];
  return list
    .filter((option) => option.active !== false)
    .map((option) => ({ window: option.night_window as NightWindow, priceXaf: Number(option.price_xaf) }))
    .sort((a, b) => (a.window < b.window ? -1 : a.window > b.window ? 1 : 0));
}

/** DTO admin et catalogue : famille, quota et toutes les options (actives ou non). */
export function planTermsDto(row: Row): {
  family: PlanFamily | "custom";
  quotaBytes: number | null;
  nightOptions: { window: NightWindow; priceXaf: number; active: boolean }[];
} {
  const list = Array.isArray(row.night_options) ? (row.night_options as NightOptionRow[]) : [];
  return {
    family:
      row.family === "limited_night"
        ? "limited_night"
        : row.family === "custom"
          ? "custom"
          : row.family === "unlimited"
            ? "unlimited"
            : "limited",
    quotaBytes: row.quota_bytes === null || row.quota_bytes === undefined ? null : Number(row.quota_bytes),
    nightOptions: list
      .map((option) => ({
        window: option.night_window as NightWindow,
        priceXaf: Number(option.price_xaf),
        active: option.active !== false,
      }))
      .sort((a, b) => (a.window < b.window ? -1 : a.window > b.window ? 1 : 0)),
  };
}

/** Remplace l'ensemble des options d'un forfait. Appelée dans la transaction de la mutation. */
export async function replaceNightOptions(q: Queryable, planId: string, options: NightOptionInput[]): Promise<void> {
  await q.query("DELETE FROM plan_night_options WHERE plan_id = $1", [planId]);
  for (const option of options) {
    await q.query(
      "INSERT INTO plan_night_options (plan_id, night_window, price_xaf, active) VALUES ($1, $2, $3, $4)",
      [planId, option.window, option.priceXaf, option.active],
    );
  }
}

/* ------------------------------------------------- durée en minutes (103) */

export const MINUTES_PER_DAY = 1440;
/** Borne haute de `plans.duration_minutes` (365 jours), même valeur que la contrainte SQL. */
export const MAX_DURATION_MINUTES = 525_600;

/**
 * Durée réelle d'un forfait en minutes : `duration_minutes` si renseignée,
 * sinon `duration_days × 1440` (comportement historique).
 */
export function planDurationMinutes(row: { duration_minutes?: unknown; duration_days?: unknown }): number {
  const minutes = row.duration_minutes;
  if (minutes !== null && minutes !== undefined && Number.isFinite(Number(minutes))) return Number(minutes);
  return Number(row.duration_days) * MINUTES_PER_DAY;
}

/** Jours affichés pour une durée en minutes : arrondi au jour supérieur, au moins 1. */
export function daysForMinutes(minutes: number): number {
  return Math.max(1, Math.ceil(minutes / MINUTES_PER_DAY));
}

/**
 * Résout la saisie admin : exactement un de `durationDays` / `durationMinutes`.
 * Renvoie les valeurs à écrire dans `plans` (`duration_minutes` NULL pour une
 * durée en jours, ce qui garde le comportement des forfaits existants).
 */
export function resolveDuration(input: { durationDays?: number | undefined; durationMinutes?: number | undefined }): {
  days: number;
  minutes: number | null;
} {
  const hasDays = input.durationDays !== undefined;
  const hasMinutes = input.durationMinutes !== undefined && input.durationMinutes !== null;
  if (hasDays === hasMinutes) {
    throw fail.validation({ durationDays: "Indiquez soit durationDays, soit durationMinutes." });
  }
  if (hasMinutes) {
    const minutes = input.durationMinutes as number;
    return { days: daysForMinutes(minutes), minutes };
  }
  return { days: input.durationDays as number, minutes: null };
}
