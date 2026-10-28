import { z } from "zod";
import { id } from "@/server/api/schema-kit";

/** Source : `planDtoR6`, `planCreateR6Schema`, `planPatchR6Schema` de `apps/api/src/routes/admin.ts`. */
export const brandApp = z.object({
  id: z.string(),
  communityId: z.string(),
  name: z.string(),
  packageName: z.string(),
  theme: z.string(),
  brandReady: z.boolean(),
  brandMissing: z.array(z.string()),
});
export type BrandApp = z.infer<typeof brandApp>;

/** D45/D97 : nature des serveurs qu'achète le forfait (illimité = free-labs, limité = paid-gcp). */
export const endpointTier = z.enum(["free-labs", "paid-gcp"]);
export type EndpointTier = z.infer<typeof endpointTier>;
export const ENDPOINT_TIER_LABEL: Record<EndpointTier, string> = { "free-labs": "Illimité", "paid-gcp": "Limité" };

/** R6 / D132 : famille du forfait. `custom` (offre sur mesure) se règle à part. */
export const PLAN_FAMILY_LABEL = {
  limited: "Limité",
  unlimited: "Illimité",
  limited_night: "Limité + nuit",
  custom: "Sur mesure",
} as const;
export type PlanFamilyKey = keyof typeof PLAN_FAMILY_LABEL;

/** Plages de nuit proposées par l'API (`NIGHT_WINDOWS`). */
export const NIGHT_WINDOWS = ["20-24", "24-04", "20-04"] as const;
export type NightWindow = (typeof NIGHT_WINDOWS)[number];
export const NIGHT_WINDOW_LABEL: Record<NightWindow, string> = {
  "20-24": "20 h – 24 h",
  "24-04": "24 h – 4 h",
  "20-04": "20 h – 4 h",
};

export const nightOption = z.object({
  window: z.enum(NIGHT_WINDOWS),
  priceXaf: z.number().int(),
  active: z.boolean(),
});
export type NightOption = z.infer<typeof nightOption>;

export const plan = z.object({
  id: z.string(),
  appId: z.string(),
  code: z.string(),
  name: z.string(),
  description: z.string(),
  priceXaf: z.number(),
  durationDays: z.number(),
  deviceLimit: z.number(),
  badge: z.string().nullable(),
  featured: z.boolean(),
  active: z.boolean(),
  sortOrder: z.number(),
  endpointTier: endpointTier,
  revision: z.number().int(),
  family: z.enum(["limited", "limited_night", "unlimited", "custom"]).optional(),
  /** Quota en octets (1 Go = 1 000 000 000). `null` pour une offre sans quota. */
  quotaBytes: z.number().nullable().optional(),
  nightOptions: z.array(nightOption).optional(),
});
export type Plan = z.infer<typeof plan>;

export const BYTES_PER_GB = 1_000_000_000;

export const appIdParams = z.object({ appId: id });
export const planIdParams = z.object({ planId: id });

export const planCreateBody = z.object({
  code: z
    .string()
    .trim()
    .min(2, "2 caractères min.")
    .max(40)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Minuscules, chiffres et tirets uniquement."),
  name: z.string().trim().min(2, "2 caractères min.").max(80),
  description: z.string().trim().max(500).optional(),
  priceXaf: z.number().int().min(1, "1 XAF min.").max(10_000_000),
  durationDays: z.number().int().min(1).max(3650),
  deviceLimit: z.number().int().min(1).max(10).optional(),
  badge: z.string().trim().max(40).nullable().optional(),
  featured: z.boolean().optional(),
  active: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(1000).optional(),
  endpointTier: endpointTier.optional(),
  family: z.enum(["limited", "limited_night", "unlimited"]).optional(),
  quotaBytes: z.number().int().min(1).nullable().optional(),
  nightOptions: z.array(nightOption.pick({ window: true, priceXaf: true, active: true })).optional(),
});
export type PlanCreate = z.input<typeof planCreateBody>;

/** `code` est immuable (il fait partie de la révision). */
export const planUpdateBody = planCreateBody
  .omit({ code: true })
  .partial()
  .refine((v) => Object.keys(v).length > 0, "Aucun champ à modifier.");
export type PlanUpdate = z.input<typeof planUpdateBody>;

/**
 * Saisie du formulaire forfait. Les nombres sont des chaînes (champs texte),
 * convertis par `planFormToUpdate`. Les plages de nuit sont saisies par fenêtre :
 * un prix vide = plage non proposée.
 */
const wholeNumber = (label: string, min: number, max: number, optional = false) =>
  z
    .string()
    .trim()
    .refine((v) => (optional && v === "") || (/^\d+$/.test(v) && Number(v) >= min && Number(v) <= max), `${label} : entre ${min} et ${max}.`);

const nightPriceField = z
  .string()
  .trim()
  .refine((v) => v === "" || (/^\d+$/.test(v) && Number(v) >= 1 && Number(v) <= 10_000_000), "Prix : entre 1 et 10 000 000 FCFA.");

export const planFormSchema = z.object({
  code: planCreateBody.shape.code,
  name: planCreateBody.shape.name,
  description: z.string().trim().max(500, "500 caractères max."),
  family: z.enum(["limited", "limited_night", "unlimited"]),
  quotaGb: wholeNumber("Quota", 1, 10_000, true),
  priceXaf: wholeNumber("Prix", 1, 10_000_000),
  durationDays: wholeNumber("Durée", 1, 3650),
  deviceLimit: wholeNumber("Appareils", 1, 10, true),
  badge: z.string().trim().max(40, "40 caractères max."),
  sortOrder: wholeNumber("Ordre", 0, 1000, true),
  featured: z.boolean(),
  active: z.boolean(),
  endpointTier: endpointTier,
  nightPrices: z.object({ "20-24": nightPriceField, "24-04": nightPriceField, "20-04": nightPriceField }),
  nightActive: z.object({ "20-24": z.boolean(), "24-04": z.boolean(), "20-04": z.boolean() }),
});
export type PlanFormValues = z.input<typeof planFormSchema>;

/** Termes d'un forfait : le même bloc que l'API reçoit (famille, quota, plages). */
export const TERM_KEYS = ["family", "quotaGb", "nightPrices", "nightActive"] as const;

/**
 * Corps envoyé à l'API. Seuls les champs présents dans `values` partent : une
 * modification de nom ne redéclenche pas le contrôle de plancher. Les termes
 * (famille, quota, plages) partent ensemble, complets.
 */
export function planFormToUpdate(values: Partial<Omit<z.output<typeof planFormSchema>, "code">> & { quotaGb?: string }): PlanUpdate {
  const body: PlanUpdate = {};
  if (values.name !== undefined) body.name = values.name;
  if (values.description !== undefined) body.description = values.description;
  if (values.priceXaf !== undefined) body.priceXaf = Number(values.priceXaf);
  if (values.durationDays !== undefined) body.durationDays = Number(values.durationDays);
  if (values.deviceLimit !== undefined) body.deviceLimit = values.deviceLimit ? Number(values.deviceLimit) : 1;
  if (values.badge !== undefined) body.badge = values.badge || null;
  if (values.sortOrder !== undefined) body.sortOrder = values.sortOrder ? Number(values.sortOrder) : 0;
  if (values.featured !== undefined) body.featured = values.featured;
  if (values.active !== undefined) body.active = values.active;
  if (values.endpointTier !== undefined) body.endpointTier = values.endpointTier;
  if (values.family !== undefined) {
    body.family = values.family;
    if (values.family === "unlimited") {
      body.quotaBytes = null;
      body.nightOptions = [];
      body.endpointTier = "free-labs";
    } else if (values.quotaGb !== undefined && values.nightPrices && values.nightActive) {
      body.quotaBytes = values.quotaGb ? Number(values.quotaGb) * BYTES_PER_GB : null;
      body.nightOptions =
        values.family === "limited_night"
          ? NIGHT_WINDOWS.filter((w) => values.nightPrices?.[w]).map((w) => ({
              window: w,
              priceXaf: Number(values.nightPrices?.[w]),
              active: values.nightActive?.[w] ?? true,
            }))
          : [];
    }
  }
  return body;
}

/** Création : tous les champs, code compris. */
export function planFormToBody(values: z.output<typeof planFormSchema>): PlanCreate {
  const { code, ...rest } = values;
  return { code, ...planFormToUpdate(rest) } as PlanCreate;
}

/** Valeurs du formulaire à partir d'un forfait existant. */
export function planToFormValues(p: Plan): z.output<typeof planFormSchema> {
  const nightPrices = { "20-24": "", "24-04": "", "20-04": "" } as Record<NightWindow, string>;
  const nightActive = { "20-24": true, "24-04": true, "20-04": true } as Record<NightWindow, boolean>;
  for (const option of p.nightOptions ?? []) {
    nightPrices[option.window] = String(option.priceXaf);
    nightActive[option.window] = option.active;
  }
  return {
    code: p.code,
    name: p.name,
    description: p.description,
    family: p.family === "limited_night" ? "limited_night" : p.family === "unlimited" ? "unlimited" : "limited",
    quotaGb: p.quotaBytes ? String(Math.round(p.quotaBytes / BYTES_PER_GB)) : "",
    priceXaf: String(p.priceXaf),
    durationDays: String(p.durationDays),
    deviceLimit: String(p.deviceLimit),
    badge: p.badge ?? "",
    sortOrder: String(p.sortOrder),
    featured: p.featured,
    active: p.active,
    endpointTier: p.endpointTier,
    nightPrices,
    nightActive,
  };
}
