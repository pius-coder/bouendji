/**
 * Forfait sur mesure (D127) : l'abonné choisit les Go et la durée.
 *
 * L'admin saisit un prix par Go pour une validité d'un jour et un prix par Go
 * pour trente jours. Entre les deux, le prix par Go suit une droite ; le total
 * est Go × prix par Go, arrondi au multiple de 50 FCFA supérieur. Le serveur est
 * la seule source du montant : l'app affiche une estimation avec la même
 * formule, puis le devis (`/quote`) et la commande le recalculent ici.
 *
 * Aucune valeur n'est codée en dur (D125) : sans offre saisie, rien n'est vendu.
 */
import { z } from "zod";
import type { Queryable, Row } from "../db.js";
import { ApiFailure, fail } from "../lib/errors.js";
import { BYTES_PER_GB, baseFloorXaf, type PricingSettings } from "./pricing.js";

/** Jours de référence des deux prix saisis par l'admin. */
export const SHORT_DAYS = 1;
export const LONG_DAYS = 30;
/** Arrondi du total, en FCFA. */
export const ROUND_XAF = 50;

export interface CustomTerms {
  pricePerGb1dXaf: number;
  pricePerGb30dXaf: number;
  minGb: number;
  maxGb: number;
  stepGb: number;
  minDays: number;
  maxDays: number;
}

export const customTermsSchema = z
  .object({
    pricePerGb1dXaf: z.number().int().min(1).max(1_000_000),
    pricePerGb30dXaf: z.number().int().min(1).max(1_000_000),
    minGb: z.number().int().min(1).max(10_000),
    maxGb: z.number().int().min(1).max(10_000),
    stepGb: z.number().int().min(1).max(1_000),
    minDays: z.number().int().min(1).max(LONG_DAYS),
    maxDays: z.number().int().min(1).max(LONG_DAYS),
  })
  .strict()
  .refine((t) => t.maxGb >= t.minGb, { message: "Le maximum doit être au moins égal au minimum.", path: ["maxGb"] })
  .refine((t) => t.maxDays >= t.minDays, { message: "Le maximum doit être au moins égal au minimum.", path: ["maxDays"] })
  .refine((t) => (t.maxGb - t.minGb) % t.stepGb === 0, {
    message: "L'écart entre minimum et maximum doit être un multiple du pas.",
    path: ["stepGb"],
  });

export const customChoiceSchema = z
  .object({
    gb: z.number().int().min(1).max(10_000),
    days: z.number().int().min(1).max(LONG_DAYS),
  })
  .strict();

export type CustomChoice = z.infer<typeof customChoiceSchema>;

/** Prix d'un Go pour une durée donnée, avant arrondi (peut être fractionnaire). */
export function pricePerGbAt(terms: CustomTerms, days: number): number {
  const ratio = (days - SHORT_DAYS) / (LONG_DAYS - SHORT_DAYS);
  return terms.pricePerGb1dXaf + (terms.pricePerGb30dXaf - terms.pricePerGb1dXaf) * ratio;
}

/** Total d'un choix, arrondi au multiple de 50 FCFA supérieur. */
export function customPriceXaf(terms: CustomTerms, choice: CustomChoice): number {
  const raw = choice.gb * pricePerGbAt(terms, choice.days);
  // Le petit epsilon évite qu'un 1000.0000000001 flottant passe à 1050.
  return Math.ceil(raw / ROUND_XAF - 1e-9) * ROUND_XAF;
}

/** Refuse un choix hors des bornes de l'offre (le client ne fixe jamais les bornes). */
export function assertChoiceAllowed(terms: CustomTerms, choice: CustomChoice): void {
  const details: Record<string, string> = {};
  if (choice.gb < terms.minGb || choice.gb > terms.maxGb || (choice.gb - terms.minGb) % terms.stepGb !== 0) {
    details.gb = `Entre ${terms.minGb} et ${terms.maxGb} Go, par pas de ${terms.stepGb}.`;
  }
  if (choice.days < terms.minDays || choice.days > terms.maxDays) {
    details.days = `Entre ${terms.minDays} et ${terms.maxDays} jours.`;
  }
  if (Object.keys(details).length > 0) throw fail.validation(details);
}

/**
 * Plancher (D121) : le Go le moins cher de l'offre ne descend pas sous le
 * plancher d'un Go. Comme le prix est linéaire en Go et en jours, vérifier les
 * deux extrémités suffit. Sans réglages owner, rien n'est refusé.
 */
export function assertCustomAboveFloor(settings: PricingSettings, terms: CustomTerms): void {
  const floorPerGb = baseFloorXaf(BYTES_PER_GB, settings);
  if (floorPerGb === null) return;
  const cheapest = Math.min(pricePerGbAt(terms, terms.minDays), pricePerGbAt(terms, terms.maxDays));
  if (cheapest < floorPerGb) {
    throw new ApiFailure(409, "CONFLICT", "Le prix par Go est sous le plancher calculé à partir des réglages tarifaires.", {
      reason: "BELOW_FLOOR",
      field: "pricePerGb1dXaf",
      floorXaf: String(floorPerGb),
    });
  }
}

/** Sous-requête SQL : les termes sur mesure d'un forfait, en objet JSON ou NULL. */
export function customTermsSql(alias: string, prefix = ""): string {
  return `(SELECT jsonb_build_object(
             'price_per_gb_1d_xaf', t.price_per_gb_1d_xaf, 'price_per_gb_30d_xaf', t.price_per_gb_30d_xaf,
             'min_gb', t.min_gb, 'max_gb', t.max_gb, 'step_gb', t.step_gb,
             'min_days', t.min_days, 'max_days', t.max_days)
             FROM plan_custom_terms t WHERE t.plan_id = ${alias}.id) AS ${prefix}custom_terms`;
}

/** Lit l'objet JSON de `customTermsSql`. `null` si le forfait n'est pas sur mesure. */
export function customTermsFromJson(raw: unknown): CustomTerms | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  return {
    pricePerGb1dXaf: Number(value.price_per_gb_1d_xaf),
    pricePerGb30dXaf: Number(value.price_per_gb_30d_xaf),
    minGb: Number(value.min_gb),
    maxGb: Number(value.max_gb),
    stepGb: Number(value.step_gb),
    minDays: Number(value.min_days),
    maxDays: Number(value.max_days),
  };
}

/** Matière de la révision : changer un prix ou une borne invalide l'écran d'achat. */
export function customRevisionMaterial(terms: CustomTerms | null): string {
  if (!terms) return "";
  return [
    terms.pricePerGb1dXaf,
    terms.pricePerGb30dXaf,
    terms.minGb,
    terms.maxGb,
    terms.stepGb,
    terms.minDays,
    terms.maxDays,
  ].join(":");
}

export async function upsertCustomTerms(q: Queryable, planId: string, terms: CustomTerms): Promise<void> {
  await q.query(
    `INSERT INTO plan_custom_terms
       (plan_id, price_per_gb_1d_xaf, price_per_gb_30d_xaf, min_gb, max_gb, step_gb, min_days, max_days, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
     ON CONFLICT (plan_id) DO UPDATE SET
       price_per_gb_1d_xaf  = EXCLUDED.price_per_gb_1d_xaf,
       price_per_gb_30d_xaf = EXCLUDED.price_per_gb_30d_xaf,
       min_gb = EXCLUDED.min_gb, max_gb = EXCLUDED.max_gb, step_gb = EXCLUDED.step_gb,
       min_days = EXCLUDED.min_days, max_days = EXCLUDED.max_days, updated_at = now()`,
    [
      planId,
      terms.pricePerGb1dXaf,
      terms.pricePerGb30dXaf,
      terms.minGb,
      terms.maxGb,
      terms.stepGb,
      terms.minDays,
      terms.maxDays,
    ],
  );
}

/** Ligne `plans` de l'offre sur mesure d'une application (une seule par app). */
export async function loadCustomPlan(q: Queryable, appId: string): Promise<Row | null> {
  return q.one<Row>(`SELECT p.*, ${customTermsSql("p")} FROM plans p WHERE p.app_id = $1 AND p.family = 'custom'`, [appId]);
}
