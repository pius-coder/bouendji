import { StatusBadge } from "@/components/common/status-badge";
import { EntityLink } from "@/components/drawers/entity-link";
import type { ChipOption } from "@/components/page/chip-filter";
import { CellStack, Initials, type TableColumn } from "@/components/page/table";
import { Button } from "@/components/ui/button";
import { formatBps, formatDateTime, formatXaf, NO_VALUE } from "@/lib/format";
import type { Order } from "@/server/services/orders/orders.schema";

/** En-têtes STATIQUES : rendus avant toute donnée (D104). */
export const ORDER_COLUMNS = [
  { id: "user", header: "Abonné", mobile: "primary" },
  { id: "amount", header: "Montant", align: "right", mobile: "secondary" },
  { id: "commission", header: "Commission", align: "right", wide: true },
  { id: "status", header: "Statut", mobile: "trailing" },
  { id: "createdAt", header: "Créée" },
  { id: "paidAt", header: "Payée", wide: true },
  { id: "open", header: "", align: "right", mobile: "trailing" },
] as const satisfies readonly TableColumn[];

export const ORDER_STATUS_OPTIONS: readonly ChipOption[] = [
  { value: "", label: "Toutes" },
  { value: "paid", label: "Payées", dot: "success" },
  { value: "pending", label: "En attente", dot: "warning" },
  { value: "failed", label: "Échouées", dot: "danger" },
  { value: "refunded", label: "Remboursées", dot: "info" },
  { value: "canceled", label: "Annulées", dot: "neutral" },
];

/**
 * Cellules d'une commande : clic sur l'abonné → `?abonne=`, clic sur « Fiche » → `?commande=`.
 */
export function orderCells(o: Order, subscriber: { name: string; email?: string }) {
  return {
    user: (
      <EntityLink kind="abonne" id={o.userId} className="flex min-w-0 items-center gap-3 no-underline hover:underline">
        <Initials name={subscriber.name} />
        <CellStack title={subscriber.name} subtitle={subscriber.email} />
      </EntityLink>
    ),
    amount: o.amountXaf === undefined ? NO_VALUE : formatXaf(o.amountXaf),
    commission:
      o.commissionXaf === undefined
        ? NO_VALUE
        : `${formatXaf(o.commissionXaf)}${o.commissionBps === undefined ? "" : ` (${formatBps(o.commissionBps)})`}`,
    status: <StatusBadge status={o.status} />,
    createdAt: formatDateTime(o.createdAt),
    paidAt: formatDateTime(o.paidAt),
    open: (
      <Button asChild variant="outline" size="sm">
        <EntityLink kind="commande" id={o.id} className="no-underline">
          Fiche
        </EntityLink>
      </Button>
    ),
  };
}
