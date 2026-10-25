import { z } from "zod";
import { id } from "@/server/api/schema-kit";

/** Source : `planDto`, `appDto`, `planCreateSchema`, `planPatchSchema` de `apps/api/src/routes/admin.ts`. */
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
  revision: z.string(),
});
export type Plan = z.infer<typeof plan>;

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
});
export type PlanCreate = z.input<typeof planCreateBody>;

/** `code` est immuable (il fait partie de la révision). */
export const planUpdateBody = planCreateBody
  .omit({ code: true })
  .partial()
  .refine((v) => Object.keys(v).length > 0, "Aucun champ à modifier.");
export type PlanUpdate = z.input<typeof planUpdateBody>;

/**
 * Saisie du formulaire forfait : les nombres sont des chaînes (champs texte),
 * convertis par `planFormToBody`. Même schéma côté client (zodResolver) et dans
 * l'action ; les bornes recopient `planCreateBody`, qui revalide avant l'envoi.
 */
const wholeNumber = (label: string, min: number, max: number, optional = false) =>
  z
    .string()
    .trim()
    .refine((v) => (optional && v === "") || (/^\d+$/.test(v) && Number(v) >= min && Number(v) <= max), `${label} : entre ${min} et ${max}.`);

export const planFormSchema = z.object({
  code: planCreateBody.shape.code,
  name: planCreateBody.shape.name,
  description: z.string().trim().max(500, "500 caractères max."),
  priceXaf: wholeNumber("Prix", 1, 10_000_000),
  durationDays: wholeNumber("Durée", 1, 3650),
  deviceLimit: wholeNumber("Appareils", 1, 10, true),
  badge: z.string().trim().max(40, "40 caractères max."),
  sortOrder: wholeNumber("Ordre", 0, 1000, true),
  featured: z.boolean(),
  active: z.boolean(),
  endpointTier: endpointTier,
});
export type PlanFormValues = z.input<typeof planFormSchema>;

/** Champs vides = valeur par défaut de l'API (appareils 1, ordre 0, pas de badge). Le code est exclu : immuable. */
export function planFormToUpdate(values: Omit<z.output<typeof planFormSchema>, "code">): PlanUpdate {
  return {
    name: values.name,
    description: values.description,
    priceXaf: Number(values.priceXaf),
    durationDays: Number(values.durationDays),
    deviceLimit: values.deviceLimit ? Number(values.deviceLimit) : 1,
    badge: values.badge || null,
    sortOrder: values.sortOrder ? Number(values.sortOrder) : 0,
    featured: values.featured,
    active: values.active,
    endpointTier: values.endpointTier,
  };
}

export function planFormToBody(values: z.output<typeof planFormSchema>): PlanCreate {
  const { code, ...rest } = values;
  return { code, ...planFormToUpdate(rest) } as PlanCreate;
}
