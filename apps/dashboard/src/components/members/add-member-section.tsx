import { can } from "@/lib/roles";
import { getMe, withSession } from "@/server/context";
import { getServices } from "@/server/services";
import { AddMemberSheet } from "./add-member-sheet";

/**
 * Bouton d'ajout. Le propriétaire reçoit l'annuaire des comptes actifs en props ;
 * un community_admin n'y a pas accès (API : owner seulement) et saisit l'identifiant.
 */
export async function AddMemberSection({ params }: { params: Promise<{ communityId: string }> }) {
  const { communityId } = await params;
  const me = await getMe();
  if (!can(me, "staff.manage", communityId)) return null;

  const accounts =
    me.platformRole === "owner"
      ? (await withSession(() => getServices().admins.listAdmins()))
          .filter((a) => a.active)
          .map((a) => ({ id: a.id, label: `${a.name} · ${a.email}` }))
      : null;
  return <AddMemberSheet communityId={communityId} accounts={accounts} />;
}
