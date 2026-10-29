import { z } from "zod";

/**
 * Contrat R1 (chantier-vague1 §6). L'API reste l'autorité : ces schémas refusent
 * tôt, côté Node, ce qu'elle refuserait, et valident ce qu'elle renvoie.
 */
export const platformRole = z.enum(["owner", "reseau", "none"]);
export const staffRole = z.enum(["community_admin", "support", "finance"]);
export type PlatformRole = z.infer<typeof platformRole>;
export type StaffRole = z.infer<typeof staffRole>;

const membershipRef = z.object({ communityId: z.string(), role: z.string() });

/** Code d'erreur 403 de l'API tant que le mot de passe doit être changé (contrat §6). */
export const PASSWORD_CHANGE_REQUIRED = "PASSWORD_CHANGE_REQUIRED";

/** Longueur minimale du nouveau mot de passe (chantier §6). */
export const PASSWORD_MIN_LENGTH = 1;
export const PASSWORD_MAX_LENGTH = 200;

/** Numéro WhatsApp camerounais : 9 chiffres, préfixe +237 retiré avant validation. */
const WHATSAPP_RE = /^\d{9}$/;

/**
 * Normalise l'identifiant de connexion : email en minuscules, ou numéro WhatsApp
 * réduit à ses 9 chiffres (espaces, tirets, points et préfixe +237 / 00237 retirés).
 * Renvoie `null` si ce n'est ni un email ni un numéro valide.
 */
export function normalizeIdentifier(raw: string): string | null {
  const value = raw.trim();
  if (value.includes("@")) {
    const email = value.toLowerCase();
    return z.string().email().max(190).safeParse(email).success ? email : null;
  }
  let digits = value.replace(/[\s.\-()]/g, "");
  if (digits.startsWith("+")) digits = digits.slice(1);
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("237") && digits.length === 12) digits = digits.slice(3);
  return WHATSAPP_RE.test(digits) ? digits : null;
}

/** Corps envoyé à l'API : `identifier` = email ou numéro WhatsApp (contrat §6). */
export const loginBody = z.object({
  identifier: z
    .string()
    .trim()
    .min(1, "Saisissez votre email ou votre numéro WhatsApp.")
    .max(190, "Identifiant trop long.")
    .transform((value, ctx) => {
      const normalized = normalizeIdentifier(value);
      if (normalized === null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Email ou numéro WhatsApp invalide (9 chiffres, +237 facultatif).",
        });
        return z.NEVER;
      }
      return normalized;
    }),
  password: z.string().min(1, "Mot de passe requis.").max(PASSWORD_MAX_LENGTH, "Mot de passe trop long."),
});
export type LoginBody = z.output<typeof loginBody>;

/** Session renvoyée par la connexion et par le changement de mot de passe. */
export const sessionToken = z.object({
  token: z.string().min(1),
  expiresAt: z.string(),
});

export const loginResult = z.object({
  token: z.string().min(1),
  expiresAt: z.string(),
  mustChangePassword: z.boolean(),
  // Contenu du compte non relu ici : la page lit `/me` ensuite.
  admin: z.object({}).passthrough(),
});
export type AdminLoginResult = z.infer<typeof loginResult>;

/** Profil tel que renvoyé par `GET /me` (et `PATCH /me`). `id` est renommé `adminId` côté dashboard. */
const meWire = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
  whatsappNumber: z.string().nullable(),
  telegramChatId: z.string().nullable().optional(),
  platformRoles: z.array(z.enum(["owner", "reseau"])),
  platformRole,
  mustChangePassword: z.boolean(),
  memberships: z.array(membershipRef),
  onboarding: z.object({ step: z.number(), completedAt: z.string().nullable() }).nullable(),
});

export const adminMe = meWire.transform((me) => ({
  adminId: me.id,
  email: me.email,
  name: me.name,
  whatsappNumber: me.whatsappNumber,
  telegramChatId: me.telegramChatId ?? null,
  platformRoles: me.platformRoles,
  platformRole: me.platformRole,
  mustChangePassword: me.mustChangePassword,
  memberships: me.memberships,
  onboarding: me.onboarding,
}));
/**
 * Type du compte. Les champs ajoutés par R1 sont optionnels ici : les littéraux
 * de test existants (ui-model, kit, network-offline, plans-members) ne les
 * fournissent pas. Le schéma `adminMe`, lui, les renvoie toujours.
 */
export type AdminMe = Pick<z.output<typeof adminMe>, "adminId" | "email" | "name" | "platformRole" | "memberships"> &
  Partial<Omit<z.output<typeof adminMe>, "adminId" | "email" | "name" | "platformRole" | "memberships">>;

/* ---------- Entrées des mutations du compte ---------- */

const optionalText = (max: number) => z.string().trim().max(max, `Maximum ${max} caractères.`);

/** Nom, numéro WhatsApp (9 chiffres ou vide = effacer), ID Telegram (plateforme seulement, côté UI). */
export const updateMeBody = z.object({
  name: optionalText(120).min(1, "Nom requis.").optional(),
  whatsappNumber: z
    .string()
    .trim()
    .refine((v) => v === "" || WHATSAPP_RE.test(v.replace(/\s/g, "")), "9 chiffres attendus (sans +237).")
    .transform((v) => (v === "" ? null : v.replace(/\s/g, "")))
    .optional(),
  telegramChatId: optionalText(40)
    .refine((v) => v === "" || /^-?\d+$/.test(v), "Identifiant numérique attendu.")
    .transform((v) => (v === "" ? null : v))
    .optional(),
});
export type UpdateMeBody = z.input<typeof updateMeBody>;

/** Règles du nouveau mot de passe (chantier §6 : 12 caractères minimum). */
export const passwordChangeBody = z
  .object({
    currentPassword: z.string().min(1, "Mot de passe actuel requis.").max(PASSWORD_MAX_LENGTH),
    newPassword: z
      .string()
      .min(PASSWORD_MIN_LENGTH, `Au moins ${PASSWORD_MIN_LENGTH} caractères.`)
      .max(PASSWORD_MAX_LENGTH, "Mot de passe trop long."),
  })
  .refine((v) => v.newPassword !== v.currentPassword, {
    path: ["newPassword"],
    message: "Le nouveau mot de passe doit être différent de l'actuel.",
  });
export type PasswordChangeBody = z.input<typeof passwordChangeBody>;

export const sessionItem = z.object({
  id: z.string(),
  createdAt: z.string(),
  lastSeenAt: z.string(),
  userAgent: z.string().nullable(),
  current: z.boolean(),
});
export type SessionItem = z.infer<typeof sessionItem>;

export const sessionList = z.object({ sessions: z.array(sessionItem) });
