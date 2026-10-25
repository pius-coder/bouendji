"use client";

import { useQueryStates } from "nuqs";
import { ChipFilter } from "@/components/page/chip-filter";
import { ordersParsers, ordersUrlKeys } from "@/server/query/orders.params";
import { ORDER_STATUS_OPTIONS } from "./orders-columns";

/**
 * Écrit l'URL, rien d'autre : le serveur relit `searchParams` et rend les lignes.
 * `shallow: false` relance le rendu serveur ; changer de filtre repart de la page 1.
 */
export function OrdersFilters() {
  const [{ status }, setParams] = useQueryStates(ordersParsers, {
    urlKeys: ordersUrlKeys,
    shallow: false,
    history: "replace",
    clearOnDefault: true,
  });
  return (
    <ChipFilter
      label="Filtrer par statut"
      options={ORDER_STATUS_OPTIONS}
      value={status}
      onChange={(next) => setParams({ status: next, cursor: null })}
    />
  );
}
