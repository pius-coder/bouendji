import { StatusBadge } from "@/components/common/status-badge";
import { CellStack, type TableColumn } from "@/components/page/table";
import { formatDateTime, formatXaf } from "@/lib/format";
import type { Payout } from "@/server/services/payouts/payouts.schema";
import { PayoutDrawer, type PayoutCaps } from "./payout-drawer";

export const PAYOUT_COLUMNS = [
  { id: "community", header: "Communauté", mobile: "primary" },
  { id: "amount", header: "Montant", align: "right", mobile: "secondary" },
  { id: "status", header: "Statut", mobile: "trailing" },
  { id: "createdAt", header: "Créé" },
  { id: "paidAt", header: "Payé", wide: true },
  { id: "open", header: "", align: "right" },
] as const satisfies readonly TableColumn[];

export function payoutCells(p: Payout, caps: PayoutCaps) {
  const community = p.communityName ?? p.communityId.slice(0, 8);
  return {
    community: <CellStack title={community} subtitle={p.note ?? undefined} />,
    amount: formatXaf(p.amountXaf),
    status: <StatusBadge status={p.status} />,
    createdAt: formatDateTime(p.createdAt),
    paidAt: formatDateTime(p.paidAt),
    open: <PayoutDrawer payout={p} communityName={community} caps={caps} />,
  };
}
