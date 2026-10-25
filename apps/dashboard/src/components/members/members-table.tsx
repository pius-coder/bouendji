import { UpdatedAt } from "@/components/common/updated-at";
import { EmptyBlock, ForbiddenBlock } from "@/components/page/empty";
import { TableMessage, TableRows } from "@/components/page/table";
import { can } from "@/lib/roles";
import { getMe, withSession } from "@/server/context";
import { loadMembersParams } from "@/server/query/members.params";
import { getServices } from "@/server/services";
import { MEMBER_COLUMNS, memberCells } from "./members-columns";

type Params = Promise<{ communityId: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;

/** Lignes (membership.read : owner ou community_admin de la communauté). */
export async function MembersRows({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { communityId } = await params;
  const { disabled } = await loadMembersParams(searchParams);
  const me = await getMe();
  if (!can(me, "staff.manage", communityId)) return <TableMessage columns={MEMBER_COLUMNS}><ForbiddenBlock /></TableMessage>;

  const all = await withSession(() => getServices().communities.listMembers({ communityId }));
  const rows = disabled ? all : all.filter((m) => m.status === "active");
  if (rows.length === 0) {
    return (
      <TableMessage columns={MEMBER_COLUMNS}>
        <EmptyBlock icon="shield" title="Aucun membre" description="Ajoutez un compte d'administration à cette communauté." />
      </TableMessage>
    );
  }
  const opts = { canEdit: can(me, "staff.manage", communityId), selfId: me.adminId, isOwner: me.platformRole === "owner" };
  return <TableRows rows={rows} columns={MEMBER_COLUMNS} getKey={(m) => m.id} cells={(m) => memberCells(m, opts)} />;
}

export async function MembersFooter({ params }: { params: Params }) {
  await params;
  return <UpdatedAt />;
}
