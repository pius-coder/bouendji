import { StatusBadge } from "@/components/common/status-badge";
import { CellStack, type TableColumn } from "@/components/page/table";
import { Badge } from "@/components/ui/badge";
import { formatXaf } from "@/lib/format";
import { ENDPOINT_TIER_LABEL, type Plan } from "@/server/services/plans/plans.schema";
import { PlanSheet } from "./plan-sheet";

export const PLAN_COLUMNS = [
  { id: "name", header: "Forfait", mobile: "primary" },
  { id: "price", header: "Prix", align: "right", mobile: "secondary" },
  { id: "duration", header: "Durée", align: "right" },
  { id: "devices", header: "Appareils", align: "right" },
  { id: "tier", header: "Serveurs" },
  { id: "status", header: "Statut", mobile: "trailing" },
  { id: "actions", header: "", align: "right" },
] as const satisfies readonly TableColumn[];

/** `canManage` vient du rôle (owner, community_admin) ; l'API refuse les autres (403). */
export function planCells(p: Plan, { canManage }: { canManage: boolean }) {
  return {
    name: (
      <span className="flex min-w-0 flex-wrap items-center gap-2">
        <CellStack title={p.name} subtitle={p.code} />
        {p.badge ? <Badge variant="secondary">{p.badge}</Badge> : null}
        {p.featured ? <Badge variant="outline">Mis en avant</Badge> : null}
      </span>
    ),
    price: formatXaf(p.priceXaf),
    duration: `${p.durationDays} j`,
    devices: String(p.deviceLimit),
    tier: ENDPOINT_TIER_LABEL[p.endpointTier],
    status: <StatusBadge status={p.active ? "active" : "inactive"} />,
    actions: canManage ? <PlanSheet mode="edit" plan={p} /> : null,
  };
}
