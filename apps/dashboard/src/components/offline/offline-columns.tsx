import { CellStack, type TableColumn } from "@/components/page/table";
import { formatDateTime } from "@/lib/format";
import type { OfflineBundleState } from "@/server/services/devices/devices.schema";
import { OfflineStatusBadge } from "./offline-status-badge";
import { offlineFileStatus, shortId } from "./offline-status";

/**
 * Colonnes de « Fichiers de secours ». Pas de colonne « émis le » : la vue admin
 * de l'API (`bundleState`) ne renvoie pas la date d'émission (voir la proposition
 * dans knowledge/agents/dash-devices-haiku/notes/proposition.md).
 */
export const OFFLINE_COLUMNS = [
  { id: "device", header: "Appareil", mobile: "primary" },
  { id: "subscriber", header: "Abonné", mobile: "secondary" },
  { id: "notAfter", header: "Valable jusqu'au" },
  { id: "usage", header: "Usage" },
  { id: "status", header: "Statut", mobile: "trailing" },
] as const satisfies readonly TableColumn[];

export interface OfflineCellOptions {
  /** Nom de l'appareil, ou identifiant court s'il n'est pas connu. */
  deviceName: (deviceId: string) => string;
  /** Nom de l'abonné, ou identifiant court s'il n'est pas connu. */
  subscriberName: (userId: string) => string;
}

export function offlineCells(b: OfflineBundleState, { deviceName, subscriberName }: OfflineCellOptions) {
  return {
    device: <CellStack title={deviceName(b.deviceId)} subtitle={`Réf. ${shortId(b.id)}`} />,
    subscriber: subscriberName(b.userId),
    notAfter: formatDateTime(b.notAfter),
    // Constant par conception : chaque fichier est à usage unique (`services/offlineBundles.ts`,
    // `markConsumed`). Ce n'est pas un champ renvoyé par la liste.
    usage: "Unique",
    status: <OfflineStatusBadge state={offlineFileStatus(b)} />,
  };
}
