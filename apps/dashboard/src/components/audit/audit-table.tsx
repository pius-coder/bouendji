import { UpdatedAt } from "@/components/common/updated-at";
import { EmptyBlock, ForbiddenBlock } from "@/components/page/empty";
import { IconTile } from "@/components/page/icon-tile";
import { CellStack, TableMessage, TableRows, type TableColumn } from "@/components/page/table";
import { AuditEntryDrawer } from "./audit-drawer";
import { formatDateTime, NO_VALUE } from "@/lib/format";
import { can } from "@/lib/roles";
import { getMe, withSession } from "@/server/context";
import { loadAuditParams } from "@/server/query/audit.params";
import { getServices } from "@/server/services";

export const AUDIT_COLUMNS = [
  { id: "action", header: "Action", mobile: "primary" },
  { id: "actor", header: "Acteur" },
  { id: "target", header: "Cible" },
  { id: "when", header: "Date", mobile: "secondary" },
  { id: "open", header: "", align: "right", mobile: "trailing" },
] as const satisfies readonly TableColumn[];

type Params = Promise<{ communityId: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;

/** Lignes du journal (seule partie suspendue). */
export async function AuditRows({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { communityId } = await params;
  const { limit } = await loadAuditParams(searchParams);
  const me = await getMe();
  if (!can(me, "audit.read", communityId)) return <TableMessage columns={AUDIT_COLUMNS}><ForbiddenBlock /></TableMessage>;

  const entries = await withSession(() => getServices().audit.listAuditEntries({ communityId, limit }));
  if (entries.length === 0) {
    return <TableMessage columns={AUDIT_COLUMNS}><EmptyBlock icon="history" title="Journal vide" /></TableMessage>;
  }
  return (
    <TableRows
      rows={entries}
      columns={AUDIT_COLUMNS}
      getKey={(e) => e.id}
      cells={(e) => ({
        action: (
          <span className="flex min-w-0 items-center gap-3">
            <IconTile name="history" size="sm" tone="info" />
            <CellStack title={<code className="font-mono text-footnote">{e.action}</code>} />
          </span>
        ),
        actor: e.actorRole ?? NO_VALUE,
        target: e.targetType ? `${e.targetType} ${e.targetId?.slice(0, 8) ?? ""}` : NO_VALUE,
        when: formatDateTime(e.createdAt),
        open: <AuditEntryDrawer entry={e} />,
      })}
    />
  );
}

export async function AuditFooter({ params }: { params: Params }) {
  await params;
  return <UpdatedAt />;
}
