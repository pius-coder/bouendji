"use client";

import { useQueryStates } from "nuqs";
import { ChipFilter } from "@/components/page/chip-filter";
import { PAYOUT_FILTERS, payoutsParsers, payoutsUrlKeys } from "@/server/query/payouts.params";
import { PAYOUT_STATUS_OPTIONS } from "./payouts-options";

export function PayoutsFilters() {
  const [{ status }, setParams] = useQueryStates(payoutsParsers, {
    urlKeys: payoutsUrlKeys,
    shallow: false,
    history: "replace",
    clearOnDefault: true,
  });
  return (
    <ChipFilter
      label="Filtrer par statut"
      options={PAYOUT_STATUS_OPTIONS}
      value={status ?? ""}
      onChange={(next) => setParams({ status: PAYOUT_FILTERS.find((s) => s === next) ?? null })}
    />
  );
}
