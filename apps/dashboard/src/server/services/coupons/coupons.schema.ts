import { z } from "zod";
import { id } from "@/server/api/schema-kit";

/**
 * Source : `apps/api/src/routes/coupons.ts` et `services/coupons.ts` (104).
 * Le code d'un coupon n'apparaît que dans `couponIssued` (réponse d'émission) :
 * aucune lecture ne le renvoie.
 */
export const couponType = z.object({
  id: z.string(),
  appId: z.string(),
  label: z.string(),
  durationMinutes: z.number(),
  createdAt: z.string().nullable(),
});
export type CouponType = z.infer<typeof couponType>;

export const couponTypeList = z.object({ items: z.array(couponType) });

export const coupon = z.object({
  id: z.string(),
  typeId: z.string(),
  label: z.string(),
  durationMinutes: z.number(),
  status: z.enum(["issued", "redeemed", "revoked"]),
  expired: z.boolean(),
  issuedAt: z.string().nullable(),
  expiresAt: z.string().nullable(),
  redeemedAt: z.string().nullable(),
  issuedByName: z.string().nullable(),
});
export type Coupon = z.infer<typeof coupon>;

export const couponList = z.object({ items: z.array(coupon) });
export const couponIssued = z.object({ coupon, code: z.string() });
export type CouponIssued = z.infer<typeof couponIssued>;
export const couponRevoked = z.object({ coupon });

export const appIdParams = z.object({ appId: id });
export const userIdParams = z.object({ userId: id });
export const couponIdParams = z.object({ couponId: id });

/** Bornes recopiées de l'API (`typeCreateSchema`, `issueSchema`). */
export const couponTypeCreateBody = z
  .object({
    label: z.string().trim().min(2, "Deux caractères minimum.").max(60),
    durationMinutes: z.number().int().min(1, "Au moins 1 minute.").max(525_600, "365 jours au plus."),
  })
  .strict();
export type CouponTypeCreate = z.infer<typeof couponTypeCreateBody>;

export const couponIssueBody = z
  .object({
    typeId: id,
    validDays: z.number().int().min(1).max(90).optional(),
  })
  .strict();
export type CouponIssue = z.infer<typeof couponIssueBody>;
