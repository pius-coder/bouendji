import { StatusBadge } from "@/components/common/status-badge";
import { EntityLink } from "@/components/drawers/entity-link";
import { CellStack, Initials, type TableColumn } from "@/components/page/table";
import { Button } from "@/components/ui/button";
import { formatDateTime, formatXaf } from "@/lib/format";
import type { Device } from "@/server/services/devices/devices.schema";
import type { Order } from "@/server/services/orders/orders.schema";
import type { Subscriber } from "@/server/services/subscribers/subscribers.schema";

export const SUBSCRIBER_COLUMNS = [
  { id: "name", header: "Abonné & Contact", mobile: "primary" },
  { id: "plan", header: "Forfait / Dernier achat", mobile: "secondary" },
  { id: "devices", header: "Appareils", align: "right" },
  { id: "state", header: "État", mobile: "trailing" },
  { id: "createdAt", header: "Inscrit" },
  { id: "open", header: "", align: "right", mobile: "trailing" },
] as const satisfies readonly TableColumn[];

export const SUBSCRIBERS_SEARCH_LABEL = "Rechercher par nom, téléphone ou identifiant…";

export interface SubscriberDetail {
  devices?: readonly Device[];
  orders?: readonly Order[];
}

export function subscriberCells(s: Subscriber, detail: SubscriberDetail) {
  const devices = detail.devices ?? [];
  const activeDevices = devices.filter((d) => !d.revokedAt && d.status !== "revoked").length;
  const orders = detail.orders ?? [];
  const lastPaid = orders.find((o) => o.status === "paid") ?? orders[0] ?? null;

  return {
    name: (
      <EntityLink kind="abonne" id={s.id} className="flex min-w-0 items-center gap-3 no-underline hover:underline">
        <Initials name={s.name || s.email} />
        <CellStack title={s.name || s.email} subtitle={s.name ? s.email : undefined} />
      </EntityLink>
    ),
    plan: lastPaid ? (
      <EntityLink kind="commande" id={lastPaid.id} className="no-underline hover:underline">
        <CellStack
          title={lastPaid.amountXaf !== undefined ? formatXaf(lastPaid.amountXaf) : "Commande"}
          subtitle={`${orders.length} commande${orders.length > 1 ? "s" : ""} · ${lastPaid.status === "paid" ? "Payé" : lastPaid.status}`}
        />
      </EntityLink>
    ) : (
      <span className="text-footnote text-muted-foreground">Aucun achat</span>
    ),
    devices: (
      <span className="font-mono text-subhead tabular-nums text-foreground">
        {activeDevices}/{devices.length}
      </span>
    ),
    state: <StatusBadge status={s.deleted ? "deleted" : s.emailVerified ? "verified" : "unverified"} />,
    createdAt: formatDateTime(s.createdAt),
    open: (
      <Button asChild variant="outline" size="sm">
        <EntityLink kind="abonne" id={s.id} className="no-underline">
          Fiche
        </EntityLink>
      </Button>
    ),
  };
}
