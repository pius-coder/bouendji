"use client";

import { useQueryStates } from "nuqs";
import { ChipFilter } from "@/components/page/chip-filter";
import { SearchBox } from "@/components/page/search-box";
import { devicesParsers, devicesUrlKeys } from "@/server/query/devices.params";
import { DEVICE_STATUS_OPTIONS, DEVICES_SEARCH_LABEL } from "./devices-columns";

/** Écrit l'URL (recherche et statut) ; le serveur relit `searchParams`. */
export function DevicesFilters() {
  const [{ q, status }, setParams] = useQueryStates(devicesParsers, {
    urlKeys: devicesUrlKeys,
    shallow: false,
    history: "replace",
    clearOnDefault: true,
  });
  return (
    <>
      <SearchBox label={DEVICES_SEARCH_LABEL} placeholder={DEVICES_SEARCH_LABEL} value={q} onCommit={(next) => setParams({ q: next })} />
      <ChipFilter label="Filtrer par statut" options={DEVICE_STATUS_OPTIONS} value={status} onChange={(next) => setParams({ status: next })} />
    </>
  );
}
