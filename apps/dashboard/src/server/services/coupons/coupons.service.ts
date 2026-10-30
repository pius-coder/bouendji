import "server-only";
import { BaseService, type BaseServiceDeps } from "@/server/api/base-service";
import { endpoint } from "@/server/api/endpoint";
import {
  type CouponIssue,
  type CouponTypeCreate,
  appIdParams,
  couponIdParams,
  couponIssueBody,
  couponIssued,
  couponList,
  couponRevoked,
  couponType,
  couponTypeCreateBody,
  couponTypeList,
  userIdParams,
} from "./coupons.schema";

/**
 * Dossier API : `/v1/admin` (104). Types : owner seul (`/apps/:appId/coupon-types`).
 * Coupons : depuis la fiche abonné (`/users/:userId/...`), `coupon.issue` côté API.
 */
export class CouponsService extends BaseService {
  private static readonly endpoints = {
    listTypes: endpoint({
      method: "GET",
      path: "/apps/:appId/coupon-types",
      params: appIdParams,
      response: couponTypeList,
    }),
    createType: endpoint({
      method: "POST",
      path: "/apps/:appId/coupon-types",
      params: appIdParams,
      body: couponTypeCreateBody,
      response: couponType,
      idempotent: true,
      refreshAfter: true,
    }),
    listUserTypes: endpoint({
      method: "GET",
      path: "/users/:userId/coupon-types",
      params: userIdParams,
      response: couponTypeList,
    }),
    listUserCoupons: endpoint({
      method: "GET",
      path: "/users/:userId/coupons",
      params: userIdParams,
      response: couponList,
    }),
    issue: endpoint({
      method: "POST",
      path: "/users/:userId/coupons",
      params: userIdParams,
      body: couponIssueBody,
      response: couponIssued,
      idempotent: true,
    }),
    revoke: endpoint({
      method: "POST",
      path: "/coupons/:couponId/revoke",
      params: couponIdParams,
      response: couponRevoked,
      idempotent: true,
    }),
  } as const;

  constructor(deps: BaseServiceDeps) {
    super(deps, { basePath: "/v1/admin" });
  }

  async listTypes(appId: string) {
    return (await this.call(CouponsService.endpoints.listTypes, { params: { appId } })).items;
  }

  createType(appId: string, body: CouponTypeCreate) {
    return this.call(CouponsService.endpoints.createType, { params: { appId }, body });
  }

  async listUserTypes(userId: string) {
    return (await this.call(CouponsService.endpoints.listUserTypes, { params: { userId } })).items;
  }

  async listUserCoupons(userId: string) {
    return (await this.call(CouponsService.endpoints.listUserCoupons, { params: { userId } })).items;
  }

  /** Le code renvoyé n'est affiché qu'une fois par l'écran ; il n'est conservé nulle part. */
  issue(userId: string, body: CouponIssue) {
    return this.call(CouponsService.endpoints.issue, { params: { userId }, body });
  }

  revoke(couponId: string) {
    return this.call(CouponsService.endpoints.revoke, { params: { couponId } });
  }
}
