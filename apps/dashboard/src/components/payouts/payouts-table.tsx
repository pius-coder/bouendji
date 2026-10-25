import { UpdatedAt } from "@/components/common/updated-at";
import { EmptyBlock, ForbiddenBlock } from "@/components/page/empty";
import { TableMessage, TableRows } from "@/components/page/table";
import { can } from "@/lib/roles";
import { getMe, withSession } from "@/server/context";
import { loadPayoutsParams } from "@/server/query/payouts.params";
import { getServices } from "@/server/services";
import { PAYOUT_COLUMNS, payoutCells } from "./payouts-columns";

type Search = Promise<Record<string, string | string[] | undefined>>;

/** Lignes de la file des versements (seule partie suspendue). L'API restreint au périmètre du rôle. */
export async function PayoutsRows({ searchParams }: { searchParams: Search }) {
  const { status } = await loadPayoutsParams(searchParams);
  const me = await getMe();
  if (!can(me, "payouts.read", null)) return <TableMessage columns={PAYOUT_COLUMNS}><ForbiddenBlock /></TableMessage>;

  const payouts = await withSession(() => getServices().payouts.listPayouts(status ? { status } : {}));
  if (payouts.length === 0) {
    return (
      <TableMessage columns={PAYOUT_COLUMNS}>
        <EmptyBlock icon="wallet" title="Aucun versement" description={status ? "Aucun versement avec ce statut." : undefined} />
      </TableMessage>
    );
  }
  const caps = { approve: can(me, "payouts.approve", null), operate: can(me, "payouts.operate", null) };
  return <TableRows rows={payouts} columns={PAYOUT_COLUMNS} getKey={(p) => p.id} cells={(p) => payoutCells(p, caps)} />;
}

export async function PayoutsFooter({ searchParams }: { searchParams: Search }) {
  await searchParams;
  return <UpdatedAt scope="« À vérifier » d'abord" />;
}
