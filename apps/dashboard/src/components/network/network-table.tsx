import { cache } from "react";
import { UpdatedAt } from "@/components/common/updated-at";
import { EmptyBlock, ForbiddenBlock } from "@/components/page/empty";
import { TableMessage, TableRows } from "@/components/page/table";
import { can } from "@/lib/roles";
import { getMe, withSession } from "@/server/context";
import { getServices } from "@/server/services";
import { NETWORK_COLUMNS, networkCells } from "./network-columns";

const readPool = cache(async () => {
  const me = await getMe();
  if (!can(me, "network.read", null)) return null;
  return { me, pool: await withSession(() => getServices().network.getPool()) };
});

/** Lignes du pool (seule partie suspendue). */
export async function NetworkRows() {
  const data = await readPool();
  if (!data) return <TableMessage columns={NETWORK_COLUMNS}><ForbiddenBlock /></TableMessage>;
  if (data.pool.endpoints.length === 0) {
    return <TableMessage columns={NETWORK_COLUMNS}><EmptyBlock icon="server" title="Aucun nœud" description="Le pool est vide." /></TableMessage>;
  }
  const opts = { canWrite: can(data.me, "network.write", null) };
  return <TableRows rows={data.pool.endpoints} columns={NETWORK_COLUMNS} getKey={(e) => e.endpointId} cells={(e) => networkCells(e, opts)} />;
}

export async function NetworkFooter() {
  const data = await readPool();
  return <UpdatedAt scope={data ? `Pool, révision ${data.pool.poolRevision}` : undefined} />;
}
