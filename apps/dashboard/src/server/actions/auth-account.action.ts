"use server";

import { redirect } from "next/navigation";
import { setSession } from "@/server/api/session";
import { getServices } from "@/server/services";
import { PASSWORD_CHANGE_REQUIRED } from "@/server/services/admin-auth/admin-auth.schema";
import { PASSWORD_CHANGE_PATH } from "@/server/services/admin-auth/password-change-path";
import type { UpdateMeInput } from "@/server/services/admin-auth/admin-auth.service";
import { runAction, text, type ActionResult } from "./action-result";

/*
 * Actions du compte (profil, mot de passe, sessions). Elles prennent un FormData,
 * pour servir directement de `action` de formulaire. Chaque résultat passe par
 * `passwordGuard` : un 403 PASSWORD_CHANGE_REQUIRED envoie sur /mot-de-passe.
 */

type AccountResult = ActionResult<void>;

function passwordGuard(result: AccountResult): AccountResult {
  if (!result.ok && result.code === PASSWORD_CHANGE_REQUIRED) redirect(PASSWORD_CHANGE_PATH);
  return result;
}

/** Profil : nom, numéro WhatsApp, ID Telegram (champ présent seulement pour le rôle plateforme). */
export async function updateProfileAction(form: FormData): Promise<AccountResult> {
  const body: UpdateMeInput = {};
  if (form.has("name")) body.name = text(form, "name");
  if (form.has("whatsappNumber")) body.whatsappNumber = text(form, "whatsappNumber");
  if (form.has("telegramChatId")) body.telegramChatId = text(form, "telegramChatId");
  return passwordGuard(await runAction(() => getServices().auth.updateMe(body)));
}

/**
 * Changement de mot de passe. L'API révoque les autres sessions et renvoie un
 * nouveau JWT : il remplace le cookie, sinon la session courante serait morte.
 */
export async function changePasswordAction(form: FormData): Promise<AccountResult> {
  const currentPassword = String(form.get("currentPassword") ?? "");
  const newPassword = String(form.get("newPassword") ?? "");
  const confirmPassword = String(form.get("confirmPassword") ?? "");
  if (newPassword !== confirmPassword) {
    return {
      ok: false,
      code: "VALIDATION_FAILED",
      message: "Données invalides.",
      details: { confirmPassword: "Les deux mots de passe ne correspondent pas." },
    };
  }
  const result = await runAction(() => getServices().auth.changePassword({ currentPassword, newPassword }));
  if (!result.ok) return passwordGuard(result);
  const session = result.data;
  await setSession(session.token, new Date(session.expiresAt));
  return { ok: true };
}

/** Révoque une session listée (identifiant dans le champ `id`). */
export async function revokeSessionAction(form: FormData): Promise<AccountResult> {
  const id = text(form, "id");
  return passwordGuard(await runAction(() => getServices().auth.revokeSession(id)));
}

/** Déconnecte toutes les autres sessions du compte. */
export async function revokeOtherSessionsAction(): Promise<AccountResult> {
  return passwordGuard(await runAction(() => getServices().auth.revokeOtherSessions()));
}
