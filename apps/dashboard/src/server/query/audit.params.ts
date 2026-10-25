import { createLoader, parseAsNumberLiteral } from "nuqs/server";

/** Journal : `limit` 1 à 200 côté API, pas de curseur. Trois tailles proposées. */
export const AUDIT_LIMITS = [50, 100, 200] as const;

export const auditParsers = {
  limit: parseAsNumberLiteral(AUDIT_LIMITS).withDefault(50),
};

export const auditUrlKeys = { limit: "a_limit" } as const;

export const loadAuditParams = createLoader(auditParsers, { urlKeys: auditUrlKeys });
