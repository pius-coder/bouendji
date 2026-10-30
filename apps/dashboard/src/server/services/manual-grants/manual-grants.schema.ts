import { z } from "zod";
import { id } from "@/server/api/schema-kit";
import { NIGHT_WINDOWS } from "@/server/services/plans/custom-offer.schema";

/**
 * Source : `apps/api/src/routes/manualGrants.ts` et `services/manualGrants.ts` (105).
 *
 * Accès manuel : l'abonné a payé l'administrateur en direct (Orange Money, MTN
 * ou autre) ; l'accès est immédiat et devient une dette de la communauté envers
 * la plateforme, au prix plein du forfait, jusqu'au versement (`settlement`).
 */
export const PAYMENT_METHODS = ["orange_money", "mtn_momo", "other"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  orange_money: "Orange Money",
  mtn_momo: "MTN Mobile Money",
  other: "Autre",
};

export const manualGrant = z.object({
  id: z.string(),
  communityId: z.string(),
  communityName: z.string().nullable(),
  userId: z.string(),
  userName: z.string().nullable(),
  planId: z.string(),
  planName: z.string(),
  paymentMethod: z.enum(PAYMENT_METHODS),
  note: z.string().nullable(),
  amountXaf: z.number(),
  status: z.enum(["owed", "settled"]),
  grantedAt: z.string().nullable(),
  settledAt: z.string().nullable(),
  settlementId: z.string().nullable(),
  grantedByName: z.string().nullable(),
  accessEndsAt: z.string().nullable(),
});
export type ManualGrant = z.infer<typeof manualGrant>;

export const owedSummary = z.object({ count: z.number(), totalXaf: z.number() });
export type OwedSummary = z.infer<typeof owedSummary>;

export const grantablePlan = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  priceXaf: z.number(),
  durationDays: z.number(),
  durationMinutes: z.number(),
  family: z.string(),
  nightOptions: z.array(z.object({ window: z.enum(NIGHT_WINDOWS), priceXaf: z.number() })),
});
export type GrantablePlan = z.infer<typeof grantablePlan>;

export const grantOptions = z.object({
  plans: z.array(grantablePlan),
  paymentMethods: z.array(z.enum(PAYMENT_METHODS)),
  owed: owedSummary.extend({ communityId: z.string() }),
});
export type GrantOptions = z.infer<typeof grantOptions>;

export const manualGrantList = z.object({ items: z.array(manualGrant) });

export const grantCreated = z.object({
  grant: manualGrant,
  subscription: z.object({ startsAt: z.string(), endsAt: z.string() }).nullable(),
  owed: owedSummary,
  replayed: z.boolean(),
});
export type GrantCreated = z.infer<typeof grantCreated>;

export const owedCommunity = z.object({
  communityId: z.string(),
  communityName: z.string().nullable(),
  count: z.number(),
  totalXaf: z.number(),
});

export const owedList = z.object({
  status: z.enum(["owed", "settled"]),
  items: z.array(manualGrant),
  truncated: z.boolean(),
  owed: owedSummary,
  communities: z.array(owedCommunity),
});
export type OwedList = z.infer<typeof owedList>;

export const settlement = z.object({
  id: z.string(),
  communityId: z.string(),
  communityName: z.string().nullable(),
  amountXaf: z.number(),
  status: z.enum(["pending", "paid", "failed", "needs_review"]),
  grantCount: z.number(),
  createdAt: z.string().nullable(),
  paidAt: z.string().nullable(),
  createdByName: z.string().nullable(),
  /** Présent seulement tant que le versement est `pending`. */
  paymentUrl: z.string().nullable(),
  failureReason: z.string().nullable(),
});
export type Settlement = z.infer<typeof settlement>;

export const settlementList = z.object({ items: z.array(settlement) });
export const settlementCreated = z.object({ settlement, paymentUrl: z.string() });
export type SettlementCreated = z.infer<typeof settlementCreated>;

export const settlementRefreshed = z.object({
  settlement,
  providerStatus: z.enum(["pending", "paid", "failed"]).nullable(),
  changed: z.boolean(),
  settledGrants: z.number(),
  commissionXaf: z.number(),
});
export type SettlementRefreshed = z.infer<typeof settlementRefreshed>;

export const userIdParams = z.object({ userId: id });
export const settlementIdParams = z.object({ settlementId: id });

export const owedQuery = z.object({
  communityId: id.optional(),
  status: z.enum(["owed", "settled"]).optional(),
  limit: z.number().int().min(1).max(500).optional(),
});
export const settlementsQuery = z.object({
  communityId: id.optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

/** Bornes recopiées de l'API (`grantSchema`). Aucun montant : il vient du forfait, côté API. */
export const grantBody = z
  .object({
    planId: id,
    paymentMethod: z.enum(PAYMENT_METHODS),
    note: z.string().trim().max(280, "280 caractères au plus.").nullable().optional(),
    nightWindow: z.enum(NIGHT_WINDOWS).nullable().optional(),
  })
  .strict();
export type GrantBody = z.infer<typeof grantBody>;

export const settlementBody = z.object({ communityId: id }).strict();
