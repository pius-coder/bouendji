import "server-only";
import { BaseService, type BaseServiceDeps } from "@/server/api/base-service";
import { endpoint } from "@/server/api/endpoint";
import { type PricingUpdate, pricingSettings, pricingUpdateBody } from "./pricing.schema";

/** Dossier API : `/v1/admin/pricing` (R6, D121, D125). */
export class PricingService extends BaseService {
  private static readonly endpoints = {
    get: endpoint({ method: "GET", path: "/", response: pricingSettings }),
    update: endpoint({
      method: "PUT",
      path: "/",
      body: pricingUpdateBody,
      response: pricingSettings,
      refreshAfter: true,
    }),
  } as const;

  constructor(deps: BaseServiceDeps) {
    super(deps, { basePath: "/v1/admin/pricing" });
  }

  getPricing() {
    return this.call(PricingService.endpoints.get);
  }

  updatePricing(body: PricingUpdate) {
    return this.call(PricingService.endpoints.update, { body });
  }
}
