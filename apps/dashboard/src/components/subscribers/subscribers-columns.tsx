import { StatusBadge } from "@/components/common/status-badge";
import { CellStack, Initials, type TableColumn } from "@/components/page/table";
import { formatDateTime } from "@/lib/format";
import type { Device } from "@/server/services/devices/devices.schema";
import type { Order } from "@/server/services/orders/orders.schema";
import type { Subscriber } from "@/server/services/subscribers/subscribers.schema";
import { SubscriberDrawer } from "./subscriber-drawer";

export const SUBSCRIBER_COLUMNS = [
  { id: "name", header: "Abonné", mobile: "primary" },
  { id: "state", header: "État", mobile: "trailing" },
  { id: "locale", header: "Langue" },
  { id: "createdAt", header: "Inscrit", mobile: "secondary" },
  // Mobile « trailing » : sinon le bouton Détails serait masqué sur téléphone.
  { id: "open", header: "", align: "right", mobile: "trailing" },
] as const satisfies readonly TableColumn[];

export const SUBSCRIBERS_SEARCH_LABEL = "Filtrer les 100 derniers abonnés";

/**
 * Données du tiroir, lues côté serveur et déjà filtrées sur cet abonné.
 * `undefined` = droit absent : la section correspondante n'est pas affichée.
 */
export interface SubscriberDetail {
  devices?: readonly Device[];
  orders?: readonly Order[];
}

export function subscriberCells(s: Subscriber, detail: SubscriberDetail) {
  return {
    name: (
      <span className="flex min-w-0 items-center gap-3">
        <Initials name={s.name || s.email} />
        <CellStack title={s.name || s.email} subtitle={s.name ? s.email : undefined} />
      </span>
    ),
    state: <StatusBadge status={s.deleted ? "deleted" : s.emailVerified ? "verified" : "unverified"} />,
    locale: s.locale.toUpperCase(),
    createdAt: formatDateTime(s.createdAt),
    open: <SubscriberDrawer subscriber={s} devices={detail.devices} orders={detail.orders} />,
  };
}
