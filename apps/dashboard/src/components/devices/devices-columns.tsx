import { IconTile } from "@/components/page/icon-tile";
import { StatusBadge } from "@/components/common/status-badge";
import type { ChipOption } from "@/components/page/chip-filter";
import { shortId } from "@/components/offline/offline-status";
import { CellStack, type TableColumn } from "@/components/page/table";
import { formatDateTime } from "@/lib/format";
import type { Device, OfflineBundleState } from "@/server/services/devices/devices.schema";
import { DeviceDrawer, type DeviceCaps } from "./device-drawer";

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
  /** Droits affichés, venus du rôle ; l'API refuse de toute façon (403). */
  caps: DeviceCaps;
  subscriberLabel: (userId: string) => string;
  /** Fichiers de secours déjà lus côté serveur pour cet appareil. */
  bundlesOf: (deviceId: string) => readonly OfflineBundleState[];
}

/** Une seule action par ligne : « Détails » ouvre le tiroir de l'appareil. */
export function deviceCells(d: Device, { caps, subscriberLabel, bundlesOf }: DeviceCellOptions) {
  const name = d.name || shortId(d.deviceId);
  const live = !d.revokedAt && d.status !== "revoked";
  const subscriber = subscriberLabel(d.userId);
  return {
    name: (
      <span className="flex min-w-0 items-center gap-3">
        <IconTile name="smartphone" size="sm" tone={live ? "accent" : "neutral"} />
        <CellStack title={name} subtitle={d.platform} />
      </span>
    ),
    user: subscriber,
    status: <StatusBadge status={d.status} />,
    lastSeen: formatDateTime(d.lastSeenAt),
    actions: <DeviceDrawer device={d} subscriber={subscriber} bundles={bundlesOf(d.deviceId)} caps={caps} />,
  };
}
