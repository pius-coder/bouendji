import { UpdatedAt } from "@/components/common/updated-at";
import { EmptyBlock, ForbiddenBlock } from "@/components/page/empty";
import { TableMessage, TableRows } from "@/components/page/table";
import { can } from "@/lib/roles";
import { getMe, getSubscribers, withSession } from "@/server/context";
import { loadSubscribersParams } from "@/server/query/subscribers.params";
import { getServices } from "@/server/services";
import { SUBSCRIBER_COLUMNS, subscriberCells } from "./subscribers-columns";
import { groupByUser } from "./subscriber-groups";

type Params = Promise<{ communityId: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;

/**
 * Lignes (seule partie suspendue). Aucune recherche serveur : filtre sur les 100 derniers, côté Node.
 * Les tiroirs reçoivent leurs propres appareils et commandes, lus une fois par page
 * ici (serveur), jamais depuis le client.
 */
export async function SubscribersRows({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { communityId } = await params;
  const { q } = await loadSubscribersParams(searchParams);
  const me = await getMe();
  if (!can(me, "members.read", communityId)) {
    return <TableMessage columns={SUBSCRIBER_COLUMNS}><ForbiddenBlock /></TableMessage>;
  }
  const canDevices = can(me, "members.read", communityId);
  const canOrders = can(me, "orders.read", communityId);
  const [subscribers, devices, orderPage] = await Promise.all([
    getSubscribers(communityId),
    canDevices ? withSession(() => getServices().devices.listDevices({ communityId })) : Promise.resolve(null),
    canOrders ? withSession(() => getServices().orders.listOrders({ communityId, limit: 100 })) : Promise.resolve(null),
  ]);
  const devicesBy = devices ? groupByUser(devices) : null;
  const ordersBy = orderPage ? groupByUser(orderPage.items) : null;

  const needle = q.trim().toLowerCase();
  const rows = needle ? subscribers.filter((s) => `${s.name} ${s.email}`.toLowerCase().includes(needle)) : subscribers;
  if (rows.length === 0) {
    return (
      <TableMessage columns={SUBSCRIBER_COLUMNS}>
        <EmptyBlock icon="users" title="Aucun abonné" description={q ? "Aucun abonné ne correspond au filtre." : undefined} />
      </TableMessage>
    );
  }
  return (
    <TableRows
      rows={rows}
      columns={SUBSCRIBER_COLUMNS}
      getKey={(s) => s.id}
      cells={(s) =>
        subscriberCells(s, {
          devices: devicesBy ? (devicesBy.get(s.id) ?? []) : undefined,
          orders: ordersBy ? (ordersBy.get(s.id) ?? []) : undefined,
        })
      }
    />
  );
}

export async function SubscribersFooter({ params }: { params: Params }) {
  await params;
  return <UpdatedAt scope="100 derniers abonnés" />;
}
