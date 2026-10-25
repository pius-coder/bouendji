"use client";

import { useQueryStates } from "nuqs";
import { ChipFilter } from "@/components/page/chip-filter";
import { AUDIT_LIMITS, auditParsers, auditUrlKeys } from "@/server/query/audit.params";
import { AUDIT_LIMIT_OPTIONS } from "./audit-options";

export function AuditFilters() {
  const [{ limit }, setParams] = useQueryStates(auditParsers, {
    urlKeys: auditUrlKeys,
    shallow: false,
    history: "replace",
    clearOnDefault: true,
  });
  return (
    <ChipFilter
      label="Nombre d'entrées affichées"
      options={AUDIT_LIMIT_OPTIONS}
      value={String(limit)}
      onChange={(next) => {
        const n = AUDIT_LIMITS.find((l) => String(l) === next);
        if (n) setParams({ limit: n });
      }}
    />
  );
}
