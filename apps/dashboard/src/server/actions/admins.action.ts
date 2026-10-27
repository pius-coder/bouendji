"use server";

import { getServices } from "@/server/services";
import { adminCreateBody } from "@/server/services/admins/admins.schema";
import { runAction, type ActionResult } from "./action-result";
import type { AdminResetResult } from "@/server/services/admins/admins.schema";

/** Créer un compte d'administration (owner). Le mot de passe n'est ni renvoyé ni journalisé. */
export async function createAdminAction(input: unknown): Promise<ActionResult<{ adminId: string }>> {
  return runAction(async () => {
    const body = adminCreateBody.parse(input);
    const created = await getServices().admins.createAdmin(body);
    return { adminId: created.adminId };
  });
}

/**
 * Réinitialiser le mot de passe d'un admin (owner). Le provisoire est renvoyé à
 * l'écran qui l'a demandé, une seule fois ; il n'est jamais journalisé.
 */
export async function resetAdminPasswordAction(adminId: string): Promise<ActionResult<AdminResetResult>> {
  return runAction(async () => {
    return getServices().admins.resetPassword(adminId);
  });
}
