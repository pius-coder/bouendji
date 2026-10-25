import { connection } from "next/server";
import { DetailFacts, DetailPanel } from "@/components/common/detail-panel";
import { StatusBadge } from "@/components/common/status-badge";
import { formatDateTime } from "@/lib/format";
import { applyTableQuery } from "@/server/query/table";
import { KIT_DEVICES, kitTable } from "@/server/query/kit.params";
import { KitDevicesTable } from "./kit-devices-table";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * Modèle d'un bloc serveur de table : lit l'URL (`load`), obtient les données (ici
 * des fixtures ; ailleurs un service), applique recherche/filtres/tri/pagination sur
 * le serveur, passe le résultat au module client.
 */
export async function KitDevicesSection({ searchParams }: { searchParams: SearchParams }) {
  await connection();
  const state = await kitTable.load(searchParams);
  const result = applyTableQuery(KIT_DEVICES, kitTable, state, {
    search: (d) => `${d.name} ${d.owner} ${d.id}`,
    sort: {
      name: (d) => d.name,
      platform: (d) => d.platform,
      status: (d) => d.status,
      lastSeen: (d) => d.lastSeenAt,
      sessions: (d) => d.sessions,
    },
    filters: {
      status: (d, v) => d.status === v,
      platform: (d, v) => d.platform === v,
    },
  });
  return <KitDevicesTable rows={result.rows} total={result.total} exportRows={[...result.filtered]} />;
}

/** Panneau de détail de la ligne ouverte (`k_open`). */
export async function KitDeviceDetail({ searchParams }: { searchParams: SearchParams }) {
  const state = await kitTable.load(searchParams);
  if (!state.open) return null;
  const device = KIT_DEVICES.find((d) => d.id === state.open);
  const closeHref = `/kit${kitTable.serialize({ ...state, open: null })}`;
  if (!device) return null;
  return (
    <DetailPanel title={device.name} subtitle={device.owner} closeHref={closeHref}>
      <DetailFacts
        items={[
          { label: "Statut", value: <StatusBadge status={device.status} /> },
          { label: "Plateforme", value: device.platform },
          { label: "Sessions", value: device.sessions },
          { label: "Dernier signal", value: formatDateTime(device.lastSeenAt) },
          { label: "Identifiant", value: device.id, mono: true },
        ]}
      />
    </DetailPanel>
  );
}
