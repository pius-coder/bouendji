import { z } from "zod";
import { id } from "@/server/api/schema-kit";
import { order } from "../orders/orders.schema";

/** Source : handler `GET /communities/:id/users` et `GET /users/:id` (`adminDetails.ts`). */
export const subscriber = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
  phone: z.string().nullable().optional(),
  locale: z.string(),
  emailVerified: z.boolean(),
  deleted: z.boolean(),
  createdAt: z.string().nullable(),
});
export type Subscriber = z.infer<typeof subscriber>;

export const userIdParams = z.object({ userId: id });

export const subscriberDetail = z.object({
  id: z.string(),
  communityId: z.string().nullable(),
  app: z.object({ id: z.string(), name: z.string() }),
  email: z.string(),
  name: z.string(),
  phone: z.string().nullable(),
  locale: z.string(),
  emailVerified: z.boolean(),
  deleted: z.boolean(),
  createdAt: z.string().nullable(),
  subscription: z
    .object({
      id: z.string(),
      status: z.string(),
      planCode: z.string(),
      planName: z.string(),
      startsAt: z.string().nullable(),
      endsAt: z.string().nullable(),
    })
    .nullable(),
  usage: z
    .object({
      bytesUp: z.number(),
      bytesDown: z.number(),
      seconds: z.number(),
      periodStart: z.string().nullable(),
      periodEnd: z.string().nullable(),
    })
    .nullable(),
  devices: z.array(
    z.object({
      deviceId: z.string(),
      name: z.string(),
      platform: z.string(),
      status: z.string(),
      integrityOk: z.boolean(),
      lastSeenAt: z.string().nullable(),
      revokedAt: z.string().nullable(),
      createdAt: z.string().nullable(),
    }),
  ),
  recentOrders: z.array(order),
  offlineBundles: z.array(
    z.object({
      id: z.string(),
      deviceId: z.string(),
      notAfter: z.string().nullable(),
      consumedAt: z.string().nullable(),
      createdAt: z.string().nullable(),
    }),
  ),
});
export type SubscriberDetail = z.infer<typeof subscriberDetail>;

export const searchQuery = z.object({
  q: z.string().trim().min(2, "Deux caractères minimum.").max(64),
});

export const searchResult = z.object({
  q: z.string(),
  subscribers: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      phone: z.string().nullable(),
      communityId: z.string(),
    }),
  ),
  devices: z.array(
    z.object({
      deviceId: z.string(),
      name: z.string(),
      userId: z.string(),
      communityId: z.string(),
    }),
  ),
  orders: z.array(
    z.object({
      id: z.string(),
      status: z.string(),
      communityId: z.string(),
      createdAt: z.string().nullable(),
    }),
  ),
});
export type SearchResult = z.infer<typeof searchResult>;
