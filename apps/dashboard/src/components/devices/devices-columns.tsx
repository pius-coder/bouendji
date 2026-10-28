import { StatusBadge } from "@/components/common/status-badge";
import { EntityLink } from "@/components/drawers/entity-link";
import { shortId } from "@/components/offline/offline-status";
import type { ChipOption } from "@/components/page/chip-filter";
import { IconTile } from "@/components/page/icon-tile";
import { CellStack, type TableColumn } from "@/components/page/table";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format";
import type { Device, OfflineBundleState } from "@/server/services/devices/devices.schema";
import type { DeviceCaps } from "./device-drawer";

export const DEVICE_COLUMNS = [
  { id: "name", header: "Appareil", mobile: "primary" },
  { id: "user", header: "Abonné", mobile: "secondary" },
  { id: "status", header: "Statut", mobile: "trailing" },
  { id: "lastSeen", header: "Dernière activité" },
  { id: "actions", header: "", align: "right", mobile: "secondary" },
] as const satisfies readonly TableColumn[];

export const DEVICES_SEARCH_LABEL = "Filtrer les 100 derniers appareils";
export const DEVICE_STATUS_OPTIONS: readonly ChipOption[] = [
  { value: "", label: "Tous" },
  { value: "enrolled", label: "Enregistrés", dot: "success" },
  { value: "revoked", label: "Révoqués", dot: "danger" },
];

export interface DeviceCellOptions {
  caps: DeviceCaps;
  subscriberLabel: (userId: string) => string;
  bundlesOf: (deviceId: string) => readonly OfflineBundleState[];
}

export function deviceCells(d: Device, { subscriberLabel }: DeviceCellOptions) {
  const name = d.name || shortId(d.deviceId);
  const live = !d.revokedAt && d.status !== "revoked";
  const subscriber = subscriberLabel(d.userId);
  return {
    name: (
      <EntityLink kind="appareil" id={d.deviceId} className="flex min-w-0 items-center gap-3 no-underline hover:underline">
        <IconTile name="smartphone" size="sm" tone={live ? "accent" : "neutral"} />
        <CellStack title={name} subtitle={d.platform} />
      </EntityLink>
    ),
    user: (
      <EntityLink kind="abonne" id={d.userId}>
        {subscriber}
      </EntityLink>
    ),
    status: <StatusBadge status={d.status} />,
    lastSeen: formatDateTime(d.lastSeenAt),
    actions: (
      <Button asChild variant="outline" size="sm">
        <EntityLink kind="appareil" id={d.deviceId} className="no-underline">
          Fiche
        </EntityLink>
      </Button>
    ),
  };
}
