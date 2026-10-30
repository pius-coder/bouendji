import { StatusBadge } from "@/components/common/status-badge";
import { IconTile } from "@/components/page/icon-tile";
import { CellStack, type TableColumn } from "@/components/page/table";
import { formatDateTime, NO_VALUE } from "@/lib/format";
import { downReasonLabel, type PoolEndpoint } from "@/server/services/network/network.schema";
import { ENDPOINT_TIER_LABEL, type EndpointTier } from "@/server/services/plans/plans.schema";
import { EndpointDrawer } from "./endpoint-drawer";

/**
 * Colonnes optimisées :
 * L'action « Gérer » est placée en colonne prioritaire pour ne JAMAIS être masquée
 * ou tronquée par un débordement horizontal d'écran.
 */
export const NETWORK_COLUMNS = [
  { id: "label", header: "Nœud", mobile: "primary" },
  { id: "health", header: "Santé", mobile: "trailing" },
  { id: "status", header: "Statut", mobile: "secondary" },
  { id: "manage", header: "Action", align: "right", mobile: "trailing" },
  { id: "usage", header: "Occupation", align: "right" },
  { id: "latency", header: "Latence", align: "right" },
  { id: "expires", header: "Expire", wide: true },
] as const satisfies readonly TableColumn[];

export function networkCells(e: PoolEndpoint, { canWrite }: { canWrite: boolean }) {
  const isExpired = e.status === "expired";
  const isDown = e.health === "down";
  /** La sonde serveur (D147) met `latency_ms` à jour quand elle réussit ; sinon on montre la mesure des téléphones. */
  const latency = e.probeLatencyMs ?? e.latencyMs;
  return {
    label: (
      <div className="flex min-w-0 items-center gap-3">
        <IconTile
          name="server"
          size="sm"
          tone={isExpired ? "neutral" : isDown ? "danger" : "neutral"}
        />
        <CellStack
          title={e.label}
          subtitle={`${e.region.toUpperCase()} · ${ENDPOINT_TIER_LABEL[e.tier as EndpointTier] ?? e.tier}`}
        />
      </div>
    ),
    health: (
      <span title={downReasonLabel(e.downReason) || undefined}>
        <StatusBadge status={e.health} />
      </span>
    ),
    status: <StatusBadge status={e.status} />,
    manage: <EndpointDrawer endpoint={e} canWrite={canWrite} />,
    usage: `${e.inUse} / ${e.capacity}`,
    latency: latency === null ? NO_VALUE : `${latency} ms`,
    expires: formatDateTime(e.expiresAt),
  };
}
