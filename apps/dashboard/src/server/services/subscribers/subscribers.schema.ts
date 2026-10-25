import { z } from "zod";

/** Source : handler `GET /communities/:id/users` (100 derniers, sans pagination ni recherche). */
export const subscriber = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
  locale: z.string(),
  emailVerified: z.boolean(),
  deleted: z.boolean(),
  createdAt: z.string().nullable(),
});
export type Subscriber = z.infer<typeof subscriber>;
