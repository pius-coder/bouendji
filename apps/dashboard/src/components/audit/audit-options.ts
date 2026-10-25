import type { ChipOption } from "@/components/page/chip-filter";
import { AUDIT_LIMITS } from "@/server/query/audit.params";

export const AUDIT_LIMIT_OPTIONS: readonly ChipOption[] = AUDIT_LIMITS.map((n) => ({ value: String(n), label: `${n} dernières` }));
