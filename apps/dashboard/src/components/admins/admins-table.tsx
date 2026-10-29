import { StatusBadge } from "@/components/common/status-badge";
import { UpdatedAt } from "@/components/common/updated-at";
import { EmptyBlock, ForbiddenBlock } from "@/components/page/empty";
import { CellStack, Initials, TableMessage, TableRows, type TableColumn } from "@/components/page/table";
import { getMe, withSession } from "@/server/context";
import { getServices } from "@/server/services";
import { CreateAdminSheet } from "./create-admin-sheet";
import { ResetPasswordButton } from "./reset-password-button";
import { AdminStatusButton } from "./admin-status-button";

export const ADMIN_COLUMNS = [
  { id: "name", header: "Administrateur", mobile: "primary" },
  { id: "presence", header: "Présence", mobile: "secondary" },
  { id: "scope", header: "Rôle plateforme" },
  { id: "status", header: "Statut", mobile: "trailing" },
  { id: "actions", header: "", align: "right", mobile: "trailing" },
] as const satisfies readonly TableColumn[];

/** Lignes (owner seulement). */
export async function AdminsRows() {
  const me = await getMe();
  if (me.platformRole !== "owner") return <TableMessage columns={ADMIN_COLUMNS}><ForbiddenBlock /></TableMessage>;
  const selfId = me.adminId;
  const admins = await withSession(() => getServices().admins.listAdmins());
  if (admins.length === 0) {
    return <TableMessage columns={ADMIN_COLUMNS}><EmptyBlock icon="shield" title="Aucun compte" /></TableMessage>;
  }
  return (
    <TableRows
      rows={admins}
      columns={ADMIN_COLUMNS}
      getKey={(a) => a.id}
      cells={(a) => {
        const displayName = a.name || a.email || a.id;
        const isSelf = a.id === selfId;
        return {
          name: (
            <span className="flex min-w-0 items-center gap-3">
              <Initials name={displayName} />
              <CellStack title={displayName} subtitle={a.name ? (a.email ?? "Connexion WhatsApp") : undefined} />
            </span>
          ),
          presence: (
            <span className="inline-flex items-center gap-1.5 text-footnote font-medium">
              <span
                className={
                  isSelf
                    ? "size-2 rounded-full bg-positive"
                    : "size-2 rounded-full bg-muted-foreground/45"
                }
              />
              <span className={isSelf ? "text-foreground" : "text-muted-foreground"}>
                {isSelf ? "En ligne (vous)" : "Hors ligne"}
              </span>
            </span>
          ),
          scope: a.platformRole === "owner" ? "Propriétaire" : "Admin de communauté / Staff",
          status: <StatusBadge status={a.active ? "active" : "disabled"} />,
          actions: isSelf ? null : (
            <span className="flex flex-wrap justify-end gap-2">
              <ResetPasswordButton adminId={a.id} name={displayName} />
              <AdminStatusButton adminId={a.id} name={displayName} active={a.active} />
            </span>
          ),
        };
      }}
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
