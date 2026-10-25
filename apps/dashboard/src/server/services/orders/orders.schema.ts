import { z } from "zod";
import { pageOf } from "@/server/api/schema-kit";

/** Source : `orderDto`, `commissionDto`, `listQuerySchema` de `apps/api/src/routes/admin.ts`. */
export const order = z.object({
  id: z.string(),
  userId: z.string(),
  planId: z.string(),
  status: z.string(),
  currency: z.string(),
  // Absents pour `support` : l'API retire les montants (on n'affiche pas 0).
  amountXaf: z.number().optional(),
  commissionBps: z.number().optional(),
  commissionXaf: z.number().optional(),
  createdAt: z.string().nullable(),
  paidAt: z.string().nullable(),
  activatedAt: z.string().nullable(),
});
export type Order = z.infer<typeof order>;
export const orderPage = pageOf(order);

export const ordersQuery = z.object({
  cursor: z.string().max(512).optional(),
  limit: z.number().int().min(1).max(100).optional(),
  status: z.string().trim().max(32).optional(),
});
export type OrdersQuery = z.input<typeof ordersQuery>;

export const commission = z.object({
  id: z.string(),
  orderId: z.string(),
  bps: z.number(),
  amountXaf: z.number(),
  status: z.string(),
  payoutId: z.string().nullable(),
  createdAt: z.string().nullable(),
  availableAt: z.string().nullable(),
});
export type Commission = z.infer<typeof commission>;

export const commissionsQuery = z.object({
  status: z.string().trim().max(32).optional(),
  limit: z.number().int().min(1).max(100).optional(),
});
export type CommissionsQuery = z.input<typeof commissionsQuery>;
