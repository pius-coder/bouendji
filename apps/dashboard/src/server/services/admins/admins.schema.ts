import { z } from "zod";
import { platformRole } from "../admin-auth/admin-auth.schema";

/** Source : `adminDirectoryDto`, `adminCreateSchema` de `apps/api/src/routes/admin.ts`. */
export const adminAccount = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
  platformRole,
  active: z.boolean(),
});
export type AdminAccount = z.infer<typeof adminAccount>;

export const adminCreateBody = z.object({
  email: z.string().trim().toLowerCase().email("Email invalide.").max(190),
  name: z.string().trim().min(2, "2 caractères min.").max(120),
  password: z.string().min(12, "12 caractères min.").max(256),
  platformRole: z.enum(["none", "owner"]).optional(),
});
export type AdminCreate = z.input<typeof adminCreateBody>;

export const adminCreated = z.object({ adminId: z.string(), email: z.string(), name: z.string(), platformRole });
