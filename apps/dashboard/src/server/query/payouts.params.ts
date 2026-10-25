import { createLoader, parseAsStringLiteral } from "nuqs/server";

export const PAYOUT_FILTERS = ["pending", "approved", "processing", "paid", "failed", "needs_review"] as const;

export const payoutsParsers = {
  status: parseAsStringLiteral(PAYOUT_FILTERS),
};

export const payoutsUrlKeys = { status: "p_status" } as const;

export const loadPayoutsParams = createLoader(payoutsParsers, { urlKeys: payoutsUrlKeys });
