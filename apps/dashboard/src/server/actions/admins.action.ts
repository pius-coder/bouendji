"use server";

import { getServices } from "@/server/services";
import { adminCreateBody } from "@/server/services/admins/admins.schema";
import { runAction, type ActionResult } from "./action-result";

/** Créer un compte d'administration (owner). Le mot de passe n'est ni renvoyé ni journalisé. */
export async function createAdminAction(input: unknown): Promise<ActionResult<{ adminId: string }>> {
  return runAction(async () => {
    const body = adminCreateBody.parse(input);
    const created = await getServices().admins.createAdmin(body);
    return { adminId: created.adminId };
  });
}
