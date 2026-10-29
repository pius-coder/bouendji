"use server";

import { getServices } from "@/server/services";
import { adminCreateBody, type AdminAccount, type AdminCreated, type AdminResetResult } from "@/server/services/admins/admins.schema";
import { runAction, type ActionResult } from "./action-result";

/**
 * Créer un compte d'administration (owner, R4).
 * Le mot de passe temporaire est généré côté serveur et renvoyé une seule fois
 * à l'écran qui l'a demandé (plus un lien `wa.me` si WhatsApp fourni).
 */
export async function createAdminAction(input: unknown): Promise<ActionResult<AdminCreated>> {
  return runAction(async () => {
    const raw = (typeof input === "object" && input !== null ? input : {}) as Record<string, unknown>;
    const normalized = {
      name: typeof raw.name === "string" ? raw.name : "",
      ...(typeof raw.email === "string" && raw.email.trim() !== "" ? { email: raw.email.trim() } : {}),
      ...(typeof raw.whatsappNumber === "string" && raw.whatsappNumber.trim() !== ""
        ? { whatsappNumber: raw.whatsappNumber.trim() }
        : {}),
      ...(raw.platformRole === "owner" || raw.platformRole === "none" ? { platformRole: raw.platformRole } : {}),
    };
    const body = adminCreateBody.parse(normalized);
    return getServices().admins.createAdmin(body);
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

export async function setAdminStatusAction(adminId: string, active: boolean): Promise<ActionResult<AdminAccount>> {
  return runAction(() => getServices().admins.setStatus(String(adminId), active === true));
}
