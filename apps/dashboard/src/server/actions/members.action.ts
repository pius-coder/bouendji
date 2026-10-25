"use server";

import { id } from "@/server/api/schema-kit";
import { getServices } from "@/server/services";
import { staffRole } from "@/server/services/admin-auth/admin-auth.schema";
import { memberFormSchema } from "@/server/services/communities/communities.schema";
import { runAction, type ActionResult } from "./action-result";

/** Ajout : Fastify refuse l'auto-ajout hors owner (403), un compte déjà membre (409) ou inactif (409). */
export async function addMemberAction(communityId: string, input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const values = memberFormSchema.parse(input);
    const created = await getServices().communities.addMember({ communityId: id.parse(communityId), ...values });
    return { id: created.id };
  });
}

export async function updateMemberRoleAction(membershipId: string, role: unknown): Promise<ActionResult<{ role: string }>> {
  return runAction(async () => {
    const updated = await getServices().communities.updateMember({
      membershipId: id.parse(membershipId),
      role: staffRole.parse(role),
    });
    return { role: updated.role };
  });
}

/** Réactiver un membre désactivé. */
export async function reactivateMemberAction(membershipId: string): Promise<ActionResult<{ status: string }>> {
  return runAction(async () => {
    const updated = await getServices().communities.updateMember({ membershipId: id.parse(membershipId), status: "active" });
    return { status: updated.status };
  });
}

/** Retrait = désactivation logique côté API ; refusé (409) pour le dernier community_admin. */
export async function removeMemberAction(membershipId: string): Promise<ActionResult> {
  return runAction(async () => {
    await getServices().communities.removeMember({ membershipId: id.parse(membershipId) });
  });
}
