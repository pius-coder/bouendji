import { z } from "zod";
import { platformRole } from "../admin-auth/admin-auth.schema";
import { normalizeCameroonWhatsapp } from "../onboarding/onboarding.schema";

/** Source : `adminDirectoryDto`, `adminCreateSchema` de `apps/api/src/routes/admin.ts`. */
export const adminAccount = z.object({
  id: z.string(),
  email: z.string().nullable(),
  name: z.string(),
  platformRole,
  active: z.boolean(),
});
export type AdminAccount = z.infer<typeof adminAccount>;

/**
 * R4 : aucun mot de passe dans le corps (il est généré côté serveur).
 * Au moins un email ou un numéro WhatsApp est requis.
 */
export const adminCreateBody = z
  .object({
    email: z.string().trim().toLowerCase().email("Email invalide.").max(190).optional(),
    name: z.string().trim().min(2, "2 caractères min.").max(120),
    whatsappNumber: z
      .string()
      .trim()
      .refine((v) => normalizeCameroonWhatsapp(v) !== null, "9 chiffres attendus, +237 facultatif.")
      .optional(),
    platformRole: z.enum(["none", "owner"]).optional(),
  })
  .refine((v) => Boolean(v.email || v.whatsappNumber), {
    message: "Un email ou un numéro WhatsApp est requis.",
    path: ["whatsappNumber"],
  });
export type AdminCreate = z.input<typeof adminCreateBody>;

export const adminCreated = z
  .object({
    adminId: z.string().optional(),
    id: z.string().optional(),
    email: z.string().nullable(),
    name: z.string(),
    whatsappNumber: z.string().nullable().optional(),
    platformRole,
    mustChangePassword: z.boolean().optional(),
    temporaryPassword: z.string(),
    whatsappLink: z.string().nullable(),
  })
  .transform((data) => ({
    ...data,
    adminId: data.adminId ?? data.id ?? "",
  }));
export type AdminCreated = z.infer<typeof adminCreated>;

/** Réinitialisation par l'owner : mot de passe provisoire renvoyé une seule fois. */
export const adminResetResponse = z
  .object({
    adminId: z.string().optional(),
    id: z.string().optional(),
    mustChangePassword: z.literal(true),
    temporaryPassword: z.string(),
    whatsappLink: z.string().nullable(),
  })
  .transform((data) => ({
    adminId: data.adminId ?? data.id ?? "",
    mustChangePassword: data.mustChangePassword,
    temporaryPassword: data.temporaryPassword,
    whatsappLink: data.whatsappLink,
  }));
export type AdminResetResult = z.infer<typeof adminResetResponse>;
