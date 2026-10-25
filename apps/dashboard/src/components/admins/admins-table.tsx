import { StatusBadge } from "@/components/common/status-badge";
import { UpdatedAt } from "@/components/common/updated-at";
import { EmptyBlock, ForbiddenBlock } from "@/components/page/empty";
import { CellStack, Initials, TableMessage, TableRows, type TableColumn } from "@/components/page/table";
import { getMe, withSession } from "@/server/context";
import { getServices } from "@/server/services";
import { CreateAdminSheet } from "./create-admin-sheet";

export const ADMIN_COLUMNS = [
  { id: "name", header: "Compte", mobile: "primary" },
  { id: "scope", header: "Portée", mobile: "secondary" },
  { id: "status", header: "Statut", mobile: "trailing" },
] as const satisfies readonly TableColumn[];

/** Lignes (owner seulement). */
export async function AdminsRows() {
  const me = await getMe();
  if (me.platformRole !== "owner") return <TableMessage columns={ADMIN_COLUMNS}><ForbiddenBlock /></TableMessage>;
  const admins = await withSession(() => getServices().admins.listAdmins());
  if (admins.length === 0) {
    return <TableMessage columns={ADMIN_COLUMNS}><EmptyBlock icon="shield" title="Aucun compte" /></TableMessage>;
  }
  return (
    <TableRows
      rows={admins}
      columns={ADMIN_COLUMNS}
      getKey={(a) => a.id}
      cells={(a) => ({
        name: (
          <span className="flex min-w-0 items-center gap-3">
            <Initials name={a.name || a.email} />
            <CellStack title={a.name || a.email} subtitle={a.name ? a.email : undefined} />
          </span>
        ),
        scope: a.platformRole === "owner" ? "Propriétaire" : "Personnel",
        status: <StatusBadge status={a.active ? "active" : "disabled"} />,
      })}
    />
  );
}

export async function AdminsFooter() {
  await getMe();
  return <UpdatedAt />;
}

/** Bouton d'en-tête : owner seulement. */
export async function CreateAdminAction() {
  const me = await getMe();
  return me.platformRole === "owner" ? <CreateAdminSheet /> : null;
}
