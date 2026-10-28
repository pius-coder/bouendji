import { EntityLink } from "@/components/drawers/entity-link";
import { CellStack, type TableColumn } from "@/components/page/table";
import { formatDateTime } from "@/lib/format";
import type { OfflineBundleState } from "@/server/services/devices/devices.schema";
import { OfflineStatusBadge } from "./offline-status-badge";
import { offlineFileStatus, shortId } from "./offline-status";

export const OFFLINE_COLUMNS = [
  { id: "device", header: "Appareil", mobile: "primary" },
  { id: "subscriber", header: "Abonné", mobile: "secondary" },
  { id: "notAfter", header: "Valable jusqu'au" },
  { id: "usage", header: "Usage" },
  { id: "status", header: "Statut", mobile: "trailing" },
] as const satisfies readonly TableColumn[];

export interface OfflineCellOptions {
  deviceName: (deviceId: string) => string;
  subscriberName: (userId: string) => string;
}

export function offlineCells(b: OfflineBundleState, { deviceName, subscriberName }: OfflineCellOptions) {
  return {
    device: (
      <EntityLink kind="appareil" id={b.deviceId} className="no-underline hover:underline">
        <CellStack title={deviceName(b.deviceId)} subtitle={`Réf. ${shortId(b.id)}`} />
      </EntityLink>
    ),
    subscriber: (
      <EntityLink kind="abonne" id={b.userId}>
        {subscriberName(b.userId)}
      </EntityLink>
    ),
    notAfter: formatDateTime(b.notAfter),
    usage: "Unique",
    status: <OfflineStatusBadge state={offlineFileStatus(b)} />,
  };
}
