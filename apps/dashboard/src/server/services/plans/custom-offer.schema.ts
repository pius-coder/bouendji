import { z } from "zod";

/**
 * Offre sur mesure (D127). Source : `apps/api/src/routes/adminCustomOffer.ts` et
 * `apps/api/src/services/customOffer.ts` (formule recopiée dans `customPriceXaf`).
 */
export const NIGHT_WINDOWS = ["20-24", "24-04", "20-04"] as const;
export type NightWindow = (typeof NIGHT_WINDOWS)[number];
export const NIGHT_WINDOW_LABEL: Record<NightWindow, string> = {
  "20-24": "20 h-24 h",
  "24-04": "24 h-4 h",
  "20-04": "20 h-4 h",
};

export const customTerms = z.object({
  pricePerGb1dXaf: z.number().int(),
  pricePerGb30dXaf: z.number().int(),
  minGb: z.number().int(),
  maxGb: z.number().int(),
  stepGb: z.number().int(),
  minDays: z.number().int(),
  maxDays: z.number().int(),
});
export type CustomTerms = z.infer<typeof customTerms>;

export const customOffer = z.object({
  planId: z.string(),
  name: z.string(),
  description: z.string(),
  active: z.boolean(),
  deviceLimit: z.number().int(),
  terms: customTerms.nullable(),
  nightOptions: z.array(z.object({ window: z.enum(NIGHT_WINDOWS), priceXaf: z.number().int(), active: z.boolean() })),
  fromXaf: z.number().int().nullable(),
  revision: z.number().int(),
});
export type CustomOffer = z.infer<typeof customOffer>;

export const customOfferResponse = z.object({ offer: customOffer.nullable() });

export const customOfferBody = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  description: z.string().trim().max(500).optional(),
  active: z.boolean(),
  deviceLimit: z.number().int().min(1).max(10),
  terms: z.object({
    pricePerGb1dXaf: z.number().int().min(1).max(1_000_000),
    pricePerGb30dXaf: z.number().int().min(1).max(1_000_000),
    minGb: z.number().int().min(1).max(10_000),
    maxGb: z.number().int().min(1).max(10_000),
    stepGb: z.number().int().min(1).max(1_000),
    minDays: z.number().int().min(1).max(30),
    maxDays: z.number().int().min(1).max(30),
  }),
  nightOptions: z.array(
    z.object({ window: z.enum(NIGHT_WINDOWS), priceXaf: z.number().int().min(1).max(10_000_000), active: z.boolean().optional() }),
  ),
});
export type CustomOfferBody = z.input<typeof customOfferBody>;

/** Même calcul que le serveur : droite entre 1 et 30 jours, arrondi au multiple de 50 FCFA supérieur. */
export function customPriceXaf(terms: Pick<CustomTerms, "pricePerGb1dXaf" | "pricePerGb30dXaf">, gb: number, days: number): number {
  const perGb = terms.pricePerGb1dXaf + ((terms.pricePerGb30dXaf - terms.pricePerGb1dXaf) * (days - 1)) / 29;
  return Math.ceil((gb * perGb) / 50 - 1e-9) * 50;
}

/* ------------------------------------------------------------ formulaire */

const whole = (label: string, min: number, max: number) =>
  z
    .string()
    .trim()
    .refine((v) => /^\d+$/.test(v) && Number(v) >= min && Number(v) <= max, `${label} : entre ${min} et ${max}.`);
const optionalPrice = z
  .string()
  .trim()
  .refine((v) => v === "" || (/^\d+$/.test(v) && Number(v) >= 1 && Number(v) <= 10_000_000), "Prix entier, ou vide.");

/** Champs texte (nombres en chaîne) ; une plage de nuit vide n'est pas proposée. */
export const customOfferFormSchema = z
  .object({
    name: z.string().trim().min(2, "2 caractères min.").max(80),
    active: z.boolean(),
    deviceLimit: whole("Appareils", 1, 10),
    pricePerGb1dXaf: whole("Prix du Go à 1 jour", 1, 1_000_000),
    pricePerGb30dXaf: whole("Prix du Go à 30 jours", 1, 1_000_000),
    minGb: whole("Go minimum", 1, 10_000),
    maxGb: whole("Go maximum", 1, 10_000),
    stepGb: whole("Pas", 1, 1_000),
    minDays: whole("Jours minimum", 1, 30),
    maxDays: whole("Jours maximum", 1, 30),
    night2024: optionalPrice,
    night2404: optionalPrice,
    night2004: optionalPrice,
  })
  .refine((v) => Number(v.maxGb) >= Number(v.minGb), { message: "Au moins égal au minimum.", path: ["maxGb"] })
  .refine((v) => Number(v.maxDays) >= Number(v.minDays), { message: "Au moins égal au minimum.", path: ["maxDays"] })
  .refine((v) => (Number(v.maxGb) - Number(v.minGb)) % Math.max(1, Number(v.stepGb)) === 0, {
    message: "L'écart min-max doit être un multiple du pas.",
    path: ["stepGb"],
  });
export type CustomOfferFormValues = z.input<typeof customOfferFormSchema>;

const NIGHT_FIELDS = { "20-24": "night2024", "24-04": "night2404", "20-04": "night2004" } as const;

export function customOfferFormToBody(v: z.output<typeof customOfferFormSchema>): CustomOfferBody {
  return {
    name: v.name,
    active: v.active,
    deviceLimit: Number(v.deviceLimit),
    terms: {
      pricePerGb1dXaf: Number(v.pricePerGb1dXaf),
      pricePerGb30dXaf: Number(v.pricePerGb30dXaf),
      minGb: Number(v.minGb),
      maxGb: Number(v.maxGb),
      stepGb: Number(v.stepGb),
      minDays: Number(v.minDays),
      maxDays: Number(v.maxDays),
    },
    nightOptions: NIGHT_WINDOWS.flatMap((w) => {
      const raw = v[NIGHT_FIELDS[w]];
      return raw ? [{ window: w, priceXaf: Number(raw), active: true }] : [];
    }),
  };
}

/** Valeurs initiales : celles de l'offre, sinon des champs vides (aucun tarif par défaut, D125). */
export function customOfferFormValues(offer: CustomOffer | null): CustomOfferFormValues {
  const t = offer?.terms;
  const night = (w: NightWindow) => String(offer?.nightOptions.find((o) => o.window === w && o.active)?.priceXaf ?? "");
  return {
    name: offer?.name ?? "Forfait sur mesure",
    active: offer?.active ?? true,
    deviceLimit: String(offer?.deviceLimit ?? 1),
    pricePerGb1dXaf: t ? String(t.pricePerGb1dXaf) : "",
    pricePerGb30dXaf: t ? String(t.pricePerGb30dXaf) : "",
    minGb: t ? String(t.minGb) : "1",
    maxGb: t ? String(t.maxGb) : "",
    stepGb: t ? String(t.stepGb) : "1",
    minDays: t ? String(t.minDays) : "1",
    maxDays: t ? String(t.maxDays) : "30",
    night2024: night("20-24"),
    night2404: night("24-04"),
    night2004: night("20-04"),
  };
}
