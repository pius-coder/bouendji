import { z } from "zod";
import { id } from "@/server/api/schema-kit";

export const BRAND_THEMES = ["billet", "halo", "mono", "vector", "otaku"] as const;
export type BrandTheme = (typeof BRAND_THEMES)[number];

export const BRAND_THEME_META: Record<BrandTheme, { label: string; color: string; description: string }> = {
  billet: { label: "Billet", color: "#ffcc00", description: "Contraste élevé, jaune signature et typographie billet." },
  halo: { label: "Halo", color: "#10b981", description: "Lueur émeraude moderne et surfaces apaisées." },
  mono: { label: "Mono", color: "#18181b", description: "Noir et blanc épuré, sobriété technique." },
  vector: { label: "Vector", color: "#e11d48", description: "Accents vifs rubis et géométrie nette." },
  otaku: { label: "Otaku", color: "#ec4899", description: "Rose électrique et énergie communautaire." },
};

const WHATSAPP_NUMBER_RE = /^(?:\+237)?(\d{9})$/;
const WHATSAPP_GROUP_RE = /^https:\/\/chat\.whatsapp\.com\/[A-Za-z0-9_-]{8,128}$/;

export function isWhatsappGroupUrl(input: string): boolean {
  const s = input.trim();
  return s.length <= 200 && WHATSAPP_GROUP_RE.test(s);
}

export function normalizeCameroonWhatsapp(input: string): string | null {
  const compact = input.replace(/[\s-]/g, "");
  const match = WHATSAPP_NUMBER_RE.exec(compact);
  return match ? (match[1] ?? null) : null;
}

export function slugFromName(name: string): string | null {
  const slug = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64)
    .replace(/-+$/g, "");
  return slug.length >= 2 ? slug : null;
}

/** Même règle que `packageNameForCommunity` de `apps/api/src/lib/onboarding.ts`. */
export function previewPackageName(communitySlugOrName: string): string {
  const slug = slugFromName(communitySlugOrName) ?? "marque";
  let segment = slug.replace(/-/g, "_");
  if (!/^[a-z]/.test(segment)) segment = `c${segment}`;
  return `cm.${segment}.vpn`;
}

/** Source : `readOnboarding` de `apps/api/src/routes/adminOnboarding.ts`. */
export const onboardingState = z.object({
  step: z.number().int(),
  completedAt: z.string().nullable(),
  guideStep: z.number().int(),
  guideDoneAt: z.string().nullable(),
  communityId: z.string().nullable(),
  appId: z.string().nullable(),
});
export type OnboardingState = z.infer<typeof onboardingState>;

export const onboardingPatchBody = z
  .object({
    step: z.number().int().min(0).max(5).optional(),
    guideStep: z.number().int().min(0).max(20).optional(),
    guideDone: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "Aucun champ à modifier.");
export type OnboardingPatch = z.input<typeof onboardingPatchBody>;

export const onboardingCommunityBody = z.object({
  name: z.string().trim().min(2, "2 caractères min.").max(120),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(64)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Minuscules, chiffres et tirets uniquement.")
    .optional(),
  whatsappGroupUrl: z
    .string()
    .trim()
    .refine(isWhatsappGroupUrl, "Lien de groupe attendu : https://chat.whatsapp.com/...")
    .optional(),
  contactWhatsapp: z
    .string()
    .trim()
    .refine((v) => normalizeCameroonWhatsapp(v) !== null, "9 chiffres attendus, +237 facultatif.")
    .optional(),
});
export type OnboardingCommunityCreate = z.input<typeof onboardingCommunityBody>;

export const onboardingCommunityCreated = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  status: z.string(),
  whatsappGroupUrl: z.string().nullable(),
  contactWhatsapp: z.string().nullable(),
});

export const appDetail = z.object({
  id: z.string(),
  communityId: z.string(),
  name: z.string(),
  packageName: z.string(),
  theme: z.string(),
  accent: z.string().nullable().optional(),
  supportUrl: z.string().nullable().optional(),
  supportEmail: z.string().nullable().optional(),
  privacyUrl: z.string().nullable().optional(),
  termsUrl: z.string().nullable().optional(),
  logoKey: z.string().nullable().optional(),
});
export type AppDetail = z.infer<typeof appDetail>;

export const appCreateBody = z.object({
  name: z.string().trim().min(2, "Nom requis (2 à 40 caractères).").max(40),
  theme: z.enum(BRAND_THEMES),
  accent: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, "Couleur hexadécimale #RRGGBB attendue.")
    .nullable()
    .optional(),
  supportUrl: z.string().trim().min(4, "Lien d'assistance requis."),
  supportEmail: z.string().trim().email("Email invalide.").max(190).optional(),
});
export type AppCreate = z.input<typeof appCreateBody>;

export const appIdParams = z.object({ appId: id });

export const appPatchBody = z
  .object({
    name: z.string().trim().min(2, "2 à 40 caractères.").max(40).optional(),
    theme: z.enum(BRAND_THEMES).optional(),
    accent: z
      .string()
      .trim()
      .regex(/^#[0-9a-fA-F]{6}$/, "Couleur hexadécimale #RRGGBB attendue.")
      .nullable()
      .optional(),
    supportUrl: z.string().trim().min(4).optional(),
    supportEmail: z.string().trim().email("Email invalide.").max(190).nullable().optional(),
    privacyUrl: z.string().trim().url("URL https attendue.").nullable().optional(),
    termsUrl: z.string().trim().url("URL https attendue.").nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "Aucun champ à modifier.");
export type AppPatch = z.input<typeof appPatchBody>;

export const appLogoBody = z.object({
  mime: z.enum(["image/png", "image/svg+xml"]),
  data: z.string().min(1, "Fichier requis.").max(1_398_104, "1 Mo maximum."),
});
export type AppLogoUpload = z.input<typeof appLogoBody>;

export const appLogoResult = z.object({
  appId: z.string(),
  logoKey: z.string(),
  mime: z.string(),
  sha256: z.string(),
  bytes: z.number(),
});
