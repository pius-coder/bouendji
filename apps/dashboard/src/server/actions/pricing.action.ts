"use server";

import { getServices } from "@/server/services";
import { pricingFormSchema, pricingFormToBody, type PricingSettings } from "@/server/services/pricing/pricing.schema";
import { runAction, type ActionResult } from "./action-result";

export async function updatePricingAction(input: unknown): Promise<ActionResult<PricingSettings>> {
  return runAction(async () => {
    const values = pricingFormSchema.parse(input);
    return getServices().pricing.updatePricing(pricingFormToBody(values));
  });
}
