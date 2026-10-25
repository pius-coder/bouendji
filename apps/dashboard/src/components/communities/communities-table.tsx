import Link from "next/link";
import { StatusBadge } from "@/components/common/status-badge";
import { UpdatedAt } from "@/components/common/updated-at";
import { EmptyBlock, ForbiddenBlock } from "@/components/page/empty";
import { CellStack, Initials, TableMessage, TableRows, type TableColumn } from "@/components/page/table";
import { formatBps, formatDateTime } from "@/lib/format";
import { getCommunities, getMe } from "@/server/context";
import { CommunityDrawer } from "./community-drawer";

export const COMMUNITY_COLUMNS = [
  { id: "name", header: "Communauté", mobile: "primary" },
  { id: "commission", header: "Commission", align: "right", mobile: "secondary" },
  { id: "status", header: "Statut", mobile: "trailing" },
  { id: "createdAt", header: "Créée", wide: true },
  { id: "actions", header: "", align: "right" },
] as const satisfies readonly TableColumn[];

/** Lignes (owner seulement : les autres rôles ont leurs communautés dans le sélecteur). */
export async function CommunitiesRows() {
  const me = await getMe();
  if (me.platformRole !== "owner") return <TableMessage columns={COMMUNITY_COLUMNS}><ForbiddenBlock /></TableMessage>;
  const communities = await getCommunities();
  if (communities.length === 0) {
    return (
      <TableMessage columns={COMMUNITY_COLUMNS}>
        <EmptyBlock icon="building" title="Aucune communauté" description="Créez la première pour commencer." />
      </TableMessage>
    );
  }
  return (
    <TableRows
      rows={communities}
      columns={COMMUNITY_COLUMNS}
      getKey={(c) => c.id}
      cells={(c) => ({
        name: (
          <Link href={`/${c.id}/orders`} className="flex min-w-0 items-center gap-3 outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <Initials name={c.name} />
            <CellStack title={c.name} subtitle={c.slug} />
          </Link>
        ),
        commission: formatBps(c.commissionBps),
        status: <StatusBadge status={c.suspended ? "suspended" : c.status} />,
        createdAt: formatDateTime(c.createdAt),
        actions: <CommunityDrawer community={c} />,
      })}
    />
  );
}

export async function CommunitiesFooter() {
  await getMe();
  return <UpdatedAt />;
}
