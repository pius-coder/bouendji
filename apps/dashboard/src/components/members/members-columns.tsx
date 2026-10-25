import { StatusBadge } from "@/components/common/status-badge";
import { CellStack, Initials, type TableColumn } from "@/components/page/table";
import { formatDateTime } from "@/lib/format";
import { ROLE_LABEL, type Role } from "@/lib/roles";
import type { Membership } from "@/server/services/communities/communities.schema";
import { MemberRoleSelect, ReactivateMemberButton, RemoveMemberButton } from "./member-actions";

export const MEMBER_COLUMNS = [
  { id: "name", header: "Membre", mobile: "primary" },
  { id: "role", header: "Rôle", mobile: "secondary" },
  { id: "status", header: "Statut", mobile: "trailing" },
  { id: "createdAt", header: "Depuis", wide: true },
  { id: "actions", header: "", align: "right" },
] as const satisfies readonly TableColumn[];

/**
 * `canEdit` vient du rôle ; `selfId` = compte connecté. Hors owner, l'API refuse de
 * modifier sa propre appartenance (403) : aucune action sur sa propre ligne.
 */
export function memberCells(m: Membership, { canEdit, selfId, isOwner }: { canEdit: boolean; selfId: string; isOwner: boolean }) {
  const label = m.name || m.email || m.adminUserId.slice(0, 8);
  const mine = !isOwner && m.adminUserId === selfId;
  const editable = canEdit && m.status === "active" && !mine;
  return {
    name: (
      <span className="flex min-w-0 items-center gap-3">
        <Initials name={label} />
        <CellStack title={label} subtitle={m.email && m.name ? m.email : undefined} />
      </span>
    ),
    role: editable ? <MemberRoleSelect membershipId={m.id} name={label} role={m.role} /> : (ROLE_LABEL[m.role as Role] ?? m.role),
    status: <StatusBadge status={m.status} />,
    createdAt: formatDateTime(m.createdAt),
    actions:
      canEdit && !mine ? (
        m.status === "active" ? (
          <RemoveMemberButton membershipId={m.id} name={label} />
        ) : (
          <ReactivateMemberButton membershipId={m.id} name={label} />
        )
      ) : null,
  };
}
