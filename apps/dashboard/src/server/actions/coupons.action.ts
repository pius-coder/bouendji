"use server";

import { getServices } from "@/server/services";
import {
  couponIssueBody,
  couponTypeCreateBody,
  type Coupon,
  type CouponIssued,
  type CouponType,
} from "@/server/services/coupons/coupons.schema";
import { runAction, type ActionResult } from "./action-result";

/** Owner seul (Fastify revérifie `coupon_type.manage`). */
export async function createCouponTypeAction(appId: string, input: unknown): Promise<ActionResult<CouponType>> {
  return runAction(async () => getServices().coupons.createType(String(appId), couponTypeCreateBody.parse(input)));
}

/**
 * Émet un coupon pour un abonné. Le code part une fois vers le navigateur qui
 * l'affiche ; il n'est ni journalisé ni mis en cache ici.
 */
export async function issueCouponAction(userId: string, input: unknown): Promise<ActionResult<CouponIssued>> {
  return runAction(async () => getServices().coupons.issue(String(userId), couponIssueBody.parse(input)));
}

export async function revokeCouponAction(couponId: string): Promise<ActionResult<Coupon>> {
  return runAction(async () => (await getServices().coupons.revoke(String(couponId))).coupon);
}
