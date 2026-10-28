import { z } from "zod";
import { id } from "@/server/api/schema-kit";
import { commission } from "../orders/orders.schema";

/** Source : `payoutDto`, `payoutCreateSchema`, `payoutResolveSchema`, `payoutQueueQuerySchema` (admin.ts). */
export const payoutStatus = z.enum(["pending", "approved", "processing", "paid", "failed", "needs_review"]);
export type PayoutStatus = z.infer<typeof payoutStatus>;

export const payout = z.object({
  id: z.string(),
  communityId: z.string(),
  communityName: z.string().nullable().optional(),
  amountXaf: z.number(),
  currency: z.string(),
  status: z.string(),
  note: z.string().nullable(),
  providerRef: z.string().nullable(),
  createdBy: z.string().nullable(),
  approvedBy: z.string().nullable(),
  approvedAt: z.string().nullable(),
  claimedAt: z.string().nullable(),
  attempts: z.number(),
  failedReason: z.string().nullable(),
  confirmedAt: z.string().nullable(),
  resolvedBy: z.string().nullable(),
  createdAt: z.string().nullable(),
  paidAt: z.string().nullable(),
});
export type Payout = z.infer<typeof payout>;

/** Source : `GET /v1/admin/payouts/:id` (`routes/adminDetails.ts`). */
export const payoutDetail = payout.extend({
  commissions: z.array(commission),
});
export type PayoutDetail = z.infer<typeof payoutDetail>;

/** Réponses d'étape : l'API renvoie au moins ces champs. */
export const payoutStep = z.object({
  id: z.string(),
  status: z.string(),
  approvedBy: z.string().nullable().optional(),
  providerRef: z.string().nullable().optional(),
});

export const payoutPrepared = z.object({
  id: z.string(),
  communityId: z.string(),
  amountXaf: z.number(),
  status: z.string(),
  commissionCount: z.number(),
  note: z.string().nullable(),
  createdAt: z.string().nullable(),
  createdBy: z.string().nullable(),
});

export const payoutIdParams = z.object({ payoutId: id });
export const payoutPrepareBody = z.object({ note: z.string().trim().max(280).optional() });
export const payoutResolveBody = z.object({
  outcome: z.enum(["paid", "failed"]),
  providerRef: z.string().trim().min(1).max(190).optional(),
  reason: z.string().trim().max(280).optional(),
});
export type PayoutResolve = z.input<typeof payoutResolveBody>;

export const payoutsQuery = z.object({
  communityId: z.string().trim().max(190).optional(),
  status: payoutStatus.optional(),
  limit: z.number().int().min(1).max(200).optional(),
});
export type PayoutsQuery = z.input<typeof payoutsQuery>;
