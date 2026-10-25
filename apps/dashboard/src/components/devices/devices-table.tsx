import { UpdatedAt } from "@/components/common/updated-at";
import { EmptyBlock, ForbiddenBlock } from "@/components/page/empty";
import { TableMessage, TableRows } from "@/components/page/table";
import { can } from "@/lib/roles";
import { getMe, getSubscribers, withSession } from "@/server/context";
import { loadDevicesParams } from "@/server/query/devices.params";
import { getServices } from "@/server/services";
import { DEVICE_COLUMNS, deviceCells } from "./devices-columns";

type Params = Promise<{ communityId: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;

/** Lignes (seule partie suspendue). Filtre local sur les 100 derniers appareils. */
export async function DevicesRows({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { communityId } = await params;
  const { q, status } = await loadDevicesParams(searchParams);
  const me = await getMe();
  if (!can(me, "members.read", communityId)) {
    return <TableMessage columns={DEVICE_COLUMNS}><ForbiddenBlock /></TableMessage>;
  }

  const [devices, subscribers] = await Promise.all([
    withSession(() => getServices().devices.listDevices({ communityId })),
    getSubscribers(communityId),
  ]);
  const names = new Map(subscribers.map((s) => [s.id, s.name || s.email]));
  const label = (userId: string) => names.get(userId) ?? `${userId.slice(0, 8)}…`;
  const needle = q.trim().toLowerCase();
  const rows = devices.filter(
    (d) => (!status || d.status === status) && (!needle || `${d.name} ${d.platform} ${label(d.userId)}`.toLowerCase().includes(needle)),
  );
  if (rows.length === 0) {
    return (
      <TableMessage columns={DEVICE_COLUMNS}>
        <EmptyBlock icon="smartphone" title="Aucun appareil" description={q || status ? "Aucun appareil ne correspond au filtre." : undefined} />
      </TableMessage>
    );
  }
  // Fichiers de secours des seules lignes affichées : une lecture par appareil (50 au plus chacune).
  const bundles = await withSession(() =>
    Promise.all(rows.map((d) => getServices().devices.listOfflineBundles({ deviceId: d.deviceId }))),
  );
  const bundlesByDevice = new Map(rows.map((d, i) => [d.deviceId, bundles[i]]));
  const options = {
    caps: {
      revoke: can(me, "devices.revoke", communityId),
      offline: can(me, "devices.offline", communityId),
    },
    subscriberLabel: label,
    bundlesOf: (deviceId: string) => bundlesByDevice.get(deviceId) ?? [],
  };
  return <TableRows rows={rows} columns={DEVICE_COLUMNS} getKey={(d) => d.deviceId} cells={(d) => deviceCells(d, options)} />;
}

export async function DevicesFooter({ params }: { params: Params }) {
  await params;
  return <UpdatedAt scope="100 derniers appareils" />;
}
