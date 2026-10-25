import { StatusBadge } from "@/components/common/status-badge";
import { IconTile } from "@/components/page/icon-tile";
import { CellStack, type TableColumn } from "@/components/page/table";
import { formatDateTime, NO_VALUE } from "@/lib/format";
import type { PoolEndpoint } from "@/server/services/network/network.schema";
import { ENDPOINT_TIER_LABEL, type EndpointTier } from "@/server/services/plans/plans.schema";
import { EndpointDrawer } from "./endpoint-drawer";

/** `host` et `port` volontairement absents : inutiles pour l'exploitation courante. */
export const NETWORK_COLUMNS = [
  { id: "label", header: "Nœud", mobile: "primary" },
  { id: "health", header: "Santé", mobile: "trailing" },
  { id: "usage", header: "Occupation", align: "right" },
  { id: "latency", header: "Latence", align: "right", mobile: "secondary" },
  { id: "expires", header: "Expire", wide: true },
  { id: "lastSeen", header: "Vu", wide: true },
  { id: "open", header: "", align: "right", mobile: "trailing" },
] as const satisfies readonly TableColumn[];

export function networkCells(e: PoolEndpoint, { canWrite }: { canWrite: boolean }) {
  return {
    label: (
      <span className="flex min-w-0 items-center gap-3">
        <IconTile name="server" size="sm" tone={e.health === "down" ? "danger" : "neutral"} />
        <CellStack title={e.label} subtitle={`${e.region} · ${ENDPOINT_TIER_LABEL[e.tier as EndpointTier] ?? e.tier}`} />
      </span>
    ),
    health: <StatusBadge status={e.health} />,
    usage: `${e.inUse} / ${e.capacity}`,
    latency: e.latencyMs === null ? NO_VALUE : `${e.latencyMs} ms`,
    expires: formatDateTime(e.expiresAt),
    lastSeen: formatDateTime(e.lastSeenAt),
    open: <EndpointDrawer endpoint={e} canWrite={canWrite} />,
  };
}
