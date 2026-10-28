import { z } from "zod";
import { id } from "@/server/api/schema-kit";
import { staffRole } from "../admin-auth/admin-auth.schema";
import { isWhatsappGroupUrl, normalizeCameroonWhatsapp } from "../onboarding/onboarding.schema";

/** Source : `communityDto` et schémas d'entrée de `apps/api/src/routes/admin.ts` (relus). */
export const community = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  status: z.string(),
  commissionBps: z.number(),
  whatsappGroupUrl: z.string().nullable().optional(),
  contactWhatsapp: z.string().nullable().optional(),
  createdAt: z.string().nullable(),
  suspended: z.boolean(),
});
export type Community = z.infer<typeof community>;

export const communityIdParams = z.object({ communityId: id });

/** `commissionBps` : 0 à 3000 (30 %). */
export const communityCreateBody = z.object({
  name: z.string().trim().min(2, "Nom requis (2 caractères min).").max(120),
  slug: z
    .string()
    .trim()
    .min(2, "Identifiant requis (2 caractères min).")
    .max(64)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Minuscules, chiffres et tirets uniquement."),
  commissionBps: z.number().int().min(0, "Entre 0 et 30 %.").max(3000, "Entre 0 et 30 %.").optional(),
});
export type CommunityCreate = z.input<typeof communityCreateBody>;

export const communityUpdateBody = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  commissionBps: z.number().int().min(0).max(3000).optional(),
  status: z.enum(["active", "suspended"]).optional(),
  whatsappGroupUrl: z
    .string()
    .trim()
    .refine(isWhatsappGroupUrl, "Lien de groupe attendu : https://chat.whatsapp.com/...")
    .nullable()
    .optional(),
  contactWhatsapp: z
    .string()
    .trim()
    .refine((v) => normalizeCameroonWhatsapp(v) !== null, "9 chiffres attendus, +237 facultatif.")
    .nullable()
    .optional(),
});
export type CommunityUpdate = z.input<typeof communityUpdateBody>;

/** Source : `GET /v1/admin/communities/:communityId/summary` (`routes/adminDetails.ts`). */
export const communityTodoItem = z.object({
  kind: z.string(),
  count: z.number().int(),
  ids: z.array(z.string()),
});
export type CommunityTodoItem = z.infer<typeof communityTodoItem>;

export const communitySummary = z.object({
  communityId: z.string(),
  name: z.string(),
  status: z.string(),
  commissionBps: z.number(),
  sales: z.object({
    today: z.object({ count: z.number().int(), amountXaf: z.number().optional() }),
    month: z.object({ count: z.number().int(), amountXaf: z.number().optional() }),
  }),
  activeSubscribers: z.number().int(),
  usageTodayBytes: z.number(),
  commissionsAvailable: z.object({ count: z.number().int(), amountXaf: z.number() }).nullable().optional(),
  todo: z.array(communityTodoItem),
});
export type CommunitySummary = z.infer<typeof communitySummary>;

export const membership = z.object({
  id: z.string(),
  adminUserId: z.string(),
  email: z.string().nullable(),
  name: z.string().nullable(),
  role: z.string(),
  status: z.string(),
  communityId: z.string(),
  createdAt: z.string().nullable(),
});
export type Membership = z.infer<typeof membership>;

export const membershipIdParams = z.object({ membershipId: id });
export const membershipCreateParams = communityIdParams;
export const membershipCreateBody = z.object({ adminUserId: id, role: staffRole });
export const membershipUpdateBody = z
  .object({ role: staffRole.optional(), status: z.enum(["active", "disabled"]).optional() })
  .refine((v) => v.role !== undefined || v.status !== undefined, "Aucun champ à modifier.");
export type MembershipCreate = z.input<typeof membershipCreateBody>;
export type MembershipUpdate = z.input<typeof membershipUpdateBody>;

/**
 * Saisie du formulaire « Nouvelle communauté » : la commission est un pourcentage
 * (0 à 30), converti en points de base par l'action. Même schéma côté client
 * (zodResolver) et côté serveur (l'action le rejoue : l'entrée n'est pas fiable).
 */
export const communityFormSchema = z.object({
  name: communityCreateBody.shape.name,
  slug: communityCreateBody.shape.slug,
  commissionPercent: z
    .string()
    .trim()
    .refine((v) => v === "" || (/^\d+([.,]\d{1,2})?$/.test(v) && Number(v.replace(",", ".")) <= 30), "Entre 0 et 30 %."),
});
export type CommunityFormValues = z.input<typeof communityFormSchema>;

/** Formulaire « Ajouter un membre » : l'identifiant du compte admin et son rôle. */
export const memberFormSchema = z.object({
  adminUserId: z.string().trim().min(1, "Compte requis.").max(190),
  role: staffRole,
});
export type MemberFormValues = z.input<typeof memberFormSchema>;
