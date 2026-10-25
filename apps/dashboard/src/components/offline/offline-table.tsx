import { UpdatedAt } from "@/components/common/updated-at";
import { shortId } from "@/components/offline/offline-status";
import { EmptyBlock, ForbiddenBlock } from "@/components/page/empty";
import { TableMessage, TableRows } from "@/components/page/table";
import { can } from "@/lib/roles";
import { getMe, getSubscribers, withSession } from "@/server/context";
import { getServices } from "@/server/services";
import { OFFLINE_COLUMNS, offlineCells } from "./offline-columns";

type Params = Promise<{ communityId: string }>;

/**
 * Lignes (seule partie suspendue). L'API filtre au périmètre du rôle : on n'ajoute
 * aucun filtre de communauté côté client. Noms d'appareil et d'abonné lus sur la
 * communauté de l'URL ; à défaut, l'identifiant court.
 */
export async function OfflineRows({ params }: { params: Params }) {
  const { communityId } = await params;
  const me = await getMe();
  if (!can(me, "devices.offline", communityId)) {
    return (
      <TableMessage columns={OFFLINE_COLUMNS}>
        <ForbiddenBlock />
      </TableMessage>
    );
  }

  const [bundles, devices, subscribers] = await Promise.all([
    withSession(() => getServices().devices.listOfflineBundles({})),
    withSession(() => getServices().devices.listDevices({ communityId })),
    getSubscribers(communityId),
  ]);
  if (bundles.length === 0) {
    return (
      <TableMessage columns={OFFLINE_COLUMNS}>
        <EmptyBlock
          icon="file-download"
          title="Aucun fichier de secours"
          description="Les fichiers émis depuis la fiche d'un appareil apparaissent ici."
        />
      </TableMessage>
    );
  }

  const deviceNames = new Map(devices.map((d) => [d.deviceId, d.name || shortId(d.deviceId)]));
  const subscriberNames = new Map(subscribers.map((s) => [s.id, s.name || s.email]));
  const options = {
    deviceName: (deviceId: string) => deviceNames.get(deviceId) ?? shortId(deviceId),
    subscriberName: (userId: string) => subscriberNames.get(userId) ?? shortId(userId),
  };
  return (
    <TableRows rows={bundles} columns={OFFLINE_COLUMNS} getKey={(b) => b.id} cells={(b) => offlineCells(b, options)} />
  );
}

export async function OfflineFooter({ params }: { params: Params }) {
  await params;
  return <UpdatedAt scope="50 derniers fichiers" />;
}
