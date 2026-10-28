import { UpdatedAt } from "@/components/common/updated-at";
import { EntityLink } from "@/components/drawers/entity-link";
import { EmptyBlock, ForbiddenBlock } from "@/components/page/empty";
import { IconTile } from "@/components/page/icon-tile";
import { CellStack, TableMessage, TableRows, type TableColumn } from "@/components/page/table";
import type { DrawerKind } from "@/lib/drawers";
import { formatDateTime, NO_VALUE } from "@/lib/format";
import { can } from "@/lib/roles";
import { getMe, withSession } from "@/server/context";
import { loadAuditParams } from "@/server/query/audit.params";
import { getServices } from "@/server/services";
import { AuditEntryDrawer } from "./audit-drawer";

export const AUDIT_COLUMNS = [
  { id: "action", header: "Action", mobile: "primary" },
  { id: "actor", header: "Acteur" },
  { id: "target", header: "Cible" },
  { id: "when", header: "Date", mobile: "secondary" },
  { id: "open", header: "", align: "right", mobile: "trailing" },
] as const satisfies readonly TableColumn[];

type Params = Promise<{ communityId: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;

function targetToDrawerKind(targetType?: string | null): DrawerKind | null {
  if (!targetType) return null;
  const t = targetType.toLowerCase();
  if (t.includes("user") || t.includes("subscri")) return "abonne";
  if (t.includes("device")) return "appareil";
  if (t.includes("order")) return "commande";
  if (t.includes("plan")) return "forfait";
  if (t.includes("payout")) return "versement";
  if (t.includes("build")) return "build";
  return null;
}

/** Lignes du journal : clic sur la cible ouvre directement sa fiche tiroir (`?abonne=`, `?appareil=`, etc.). */
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
      cells={(e) => {
        const drawerKind = targetToDrawerKind(e.targetType);
        const label = e.targetType ? `${e.targetType} ${e.targetId?.slice(0, 8) ?? ""}` : NO_VALUE;
        return {
          action: (
            <span className="flex min-w-0 items-center gap-3">
              <IconTile name="history" size="sm" tone="info" />
              <CellStack title={<code className="font-mono text-footnote">{e.action}</code>} />
            </span>
          ),
          actor: e.actorRole ?? NO_VALUE,
          target:
            drawerKind && e.targetId ? (
              <EntityLink kind={drawerKind} id={e.targetId}>
                {label}
              </EntityLink>
            ) : (
              label
            ),
          when: formatDateTime(e.createdAt),
          open: <AuditEntryDrawer entry={e} />,
        };
      }}
    />
  );
}

export async function AuditFooter({ params }: { params: Params }) {
  await params;
  return <UpdatedAt />;
}
