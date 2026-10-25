import Link from "next/link";
import { createSerializer } from "nuqs/server";
import { cache } from "react";
import { UpdatedAt } from "@/components/common/updated-at";
import { EmptyBlock, ForbiddenBlock } from "@/components/page/empty";
import { TableMessage, TableRows } from "@/components/page/table";
import { Button } from "@/components/ui/button";
import { can } from "@/lib/roles";
import { getMe, getSubscribers, withSession } from "@/server/context";
import { loadOrdersParams, ORDERS_PAGE_SIZE, ordersParsers, ordersUrlKeys } from "@/server/query/orders.params";
import { getServices } from "@/server/services";
import { ORDER_COLUMNS, orderCells } from "./orders-columns";

const serialize = createSerializer(ordersParsers, { urlKeys: ordersUrlKeys, clearOnDefault: true });

type Params = Promise<{ communityId: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;

/** Une seule lecture par requête, partagée par les lignes et la pagination. */
const readOrders = cache(async (communityId: string, status: string, cursor: string) => {
  const me = await getMe();
  if (!can(me, "orders.read", communityId)) return null;
  const [page, subscribers] = await Promise.all([
    withSession(() =>
      getServices().orders.listOrders({
        communityId,
        limit: ORDERS_PAGE_SIZE,
        ...(status ? { status } : {}),
        ...(cursor ? { cursor } : {}),
      }),
    ),
    can(me, "members.read", communityId) ? getSubscribers(communityId) : Promise.resolve([]),
  ]);
  return { page, subscribers };
});

async function read(params: Params, searchParams: Search) {
  const { communityId } = await params;
  const { status, cursor } = await loadOrdersParams(searchParams);
  return { communityId, status, cursor, data: await readOrders(communityId, status, cursor) };
}

/** Lignes du tableau : seule partie suspendue (D104). */
export async function OrdersRows({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { status, data } = await read(params, searchParams);
  if (!data) return <TableMessage columns={ORDER_COLUMNS}><ForbiddenBlock /></TableMessage>;
  if (data.page.items.length === 0) {
    return (
      <TableMessage columns={ORDER_COLUMNS}>
        <EmptyBlock
          icon="receipt"
          title="Aucune commande"
          description={status ? "Aucune commande avec ce statut." : "Aucune commande pour le moment."}
        />
      </TableMessage>
    );
  }
  const people = new Map(data.subscribers.map((s) => [s.id, { name: s.name || s.email, email: s.name ? s.email : undefined }]));
  return (
    <TableRows
      rows={data.page.items}
      columns={ORDER_COLUMNS}
      getKey={(o) => o.id}
      cells={(o) => orderCells(o, people.get(o.userId) ?? { name: `${o.userId.slice(0, 8)}…` })}
    />
  );
}

/** Pied : fraîcheur + pagination par curseur (liens serveur, aucun état client). */
export async function OrdersPager({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { communityId, status, cursor, data } = await read(params, searchParams);
  const base = `/${communityId}/orders`;
  return (
    <>
      <UpdatedAt />
      <div className="flex gap-2">
        {cursor ? (
          <Button asChild variant="outline" size="sm">
            <Link href={`${base}${serialize({ status, cursor: null })}`} replace>
              Revenir au début
            </Link>
          </Button>
        ) : null}
        {data?.page.nextCursor ? (
          <Button asChild size="sm">
            <Link href={`${base}${serialize({ status, cursor: data.page.nextCursor })}`} replace>
              Page suivante
            </Link>
          </Button>
        ) : null}
      </div>
    </>
  );
}
