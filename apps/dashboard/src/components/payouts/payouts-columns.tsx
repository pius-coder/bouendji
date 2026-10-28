import { StatusBadge } from "@/components/common/status-badge";
import { EntityLink } from "@/components/drawers/entity-link";
import { CellStack, type TableColumn } from "@/components/page/table";
import { Button } from "@/components/ui/button";
import { formatDateTime, formatXaf } from "@/lib/format";
import type { Payout } from "@/server/services/payouts/payouts.schema";
import type { PayoutCaps } from "./payout-drawer";

export const PAYOUT_COLUMNS = [
  { id: "community", header: "Communauté", mobile: "primary" },
  { id: "amount", header: "Montant", align: "right", mobile: "secondary" },
  { id: "status", header: "Statut", mobile: "trailing" },
  { id: "createdAt", header: "Créé" },
  { id: "paidAt", header: "Payé", wide: true },
  { id: "open", header: "", align: "right" },
] as const satisfies readonly TableColumn[];

export function payoutCells(p: Payout, _caps?: PayoutCaps) {
  void _caps;
  const community = p.communityName ?? p.communityId.slice(0, 8);
  return {
    community: (
      <EntityLink kind="versement" id={p.id} className="no-underline hover:underline">
        <CellStack title={community} subtitle={p.note ?? `Réf. ${p.id.slice(0, 8)}`} />
      </EntityLink>
    ),
    amount: formatXaf(p.amountXaf),
    status: <StatusBadge status={p.status} />,
    createdAt: formatDateTime(p.createdAt),
    paidAt: formatDateTime(p.paidAt),
    open: (
      <Button asChild variant="outline" size="sm">
        <EntityLink kind="versement" id={p.id} className="no-underline">
          Fiche
        </EntityLink>
      </Button>
    ),
  };
}
