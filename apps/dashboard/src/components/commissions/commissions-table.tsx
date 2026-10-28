import { StatusBadge } from "@/components/common/status-badge";
import { UpdatedAt } from "@/components/common/updated-at";
import { EntityLink } from "@/components/drawers/entity-link";
import { EmptyBlock, ForbiddenBlock } from "@/components/page/empty";
import { TableMessage, TableRows, type TableColumn } from "@/components/page/table";
import { formatBps, formatDateTime, formatXaf } from "@/lib/format";
import { can } from "@/lib/roles";
import { getMe, withSession } from "@/server/context";
import { getServices } from "@/server/services";

export const COMMISSION_COLUMNS = [
  { id: "order", header: "Commande", mobile: "primary" },
  { id: "amount", header: "Montant", align: "right", mobile: "secondary" },
  { id: "rate", header: "Taux", align: "right" },
  { id: "status", header: "Statut", mobile: "trailing" },
  { id: "availableAt", header: "Disponible le" },
  { id: "createdAt", header: "Créée", wide: true },
] as const satisfies readonly TableColumn[];

type Params = Promise<{ communityId: string }>;

/** Lignes (100 dernières) : chaque commande et chaque versement sont cliquables et ouvrent leur tiroir. */
export async function CommissionsRows({ params }: { params: Params }) {
  const { communityId } = await params;
  const me = await getMe();
  if (!can(me, "money.read", communityId)) return <TableMessage columns={COMMISSION_COLUMNS}><ForbiddenBlock /></TableMessage>;
  const items = await withSession(() => getServices().orders.listCommissions({ communityId, limit: 100 }));
  if (items.length === 0) {
    return (
      <TableMessage columns={COMMISSION_COLUMNS}>
        <EmptyBlock icon="receipt" title="Aucune commission" description="Elles apparaissent à chaque vente payée." />
      </TableMessage>
    );
  }
  return (
    <TableRows
      rows={items}
      columns={COMMISSION_COLUMNS}
      getKey={(c) => c.id}
      cells={(c) => ({
        order: (
          <div className="flex flex-col">
            <EntityLink kind="commande" id={c.orderId} className="text-subhead">
              Commande {c.orderId.slice(0, 8)}
            </EntityLink>
            {c.payoutId ? (
              <EntityLink kind="versement" id={c.payoutId} className="text-caption text-muted-foreground">
                Versement {c.payoutId.slice(0, 8)}
              </EntityLink>
            ) : null}
          </div>
        ),
        amount: formatXaf(c.amountXaf),
        rate: formatBps(c.bps),
        status: <StatusBadge status={c.status} />,
        availableAt: formatDateTime(c.availableAt),
        createdAt: formatDateTime(c.createdAt),
      })}
    />
  );
}

export async function CommissionsFooter({ params }: { params: Params }) {
  await params;
  return <UpdatedAt scope="100 dernières" />;
}
