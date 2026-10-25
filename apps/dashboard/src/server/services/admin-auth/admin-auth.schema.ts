import { z } from "zod";

/** Source : `apps/api/src/routes/adminAuth.ts` et handler `/me` de `admin.ts` (relus). */
export const platformRole = z.enum(["owner", "none"]);
export const staffRole = z.enum(["community_admin", "support", "finance"]);
export type PlatformRole = z.infer<typeof platformRole>;
export type StaffRole = z.infer<typeof staffRole>;

const membershipRef = z.object({ communityId: z.string(), role: z.string() });

export const loginBody = z.object({
  email: z.string().trim().toLowerCase().email("Email invalide.").max(190),
  password: z.string().min(1, "Mot de passe requis.").max(200),
});

export const loginResult = z.object({
  accessToken: z.string(),
  accessExpiresAt: z.string(),
  admin: z.object({
    id: z.string(),
    email: z.string(),
    name: z.string(),
    platformRole,
    memberships: z.array(membershipRef),
  }),
});
export type AdminLoginResult = z.infer<typeof loginResult>;

export const adminMe = z.object({
  adminId: z.string(),
  email: z.string(),
  name: z.string(),
  platformRole,
  memberships: z.array(membershipRef),
});
export type AdminMe = z.infer<typeof adminMe>;
