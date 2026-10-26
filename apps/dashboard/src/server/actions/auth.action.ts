"use server";

import { redirect } from "next/navigation";
import { PASSWORD_CHANGE_PATH } from "@/server/services/admin-auth/password-change-path";
import { ApiError } from "@/server/api/api-error";
import { clearSession, setSession } from "@/server/api/session";
import { getServices } from "@/server/services";
import { safeNextPath, text } from "./action-result";
import type { ActionFailure } from "@/server/api/api-error";

/** Messages français pour les échecs de connexion sans détail exploitable. */
const LOGIN_MESSAGES: Record<string, string> = {
  UNAUTHENTICATED: "Identifiant ou mot de passe incorrect.",
  UNREACHABLE: "Le serveur est injoignable. Réessayez dans un instant.",
  TIMEOUT: "Le serveur met trop de temps à répondre. Réessayez.",
};

/**
 * Connexion. Le JWT reçu va dans le cookie httpOnly et nulle part ailleurs : la
 * valeur de retour n'en contient aucune trace. `identifier` = email ou numéro
 * WhatsApp, normalisé par le schéma du service. Si l'API exige un changement de
 * mot de passe, on envoie sur `/mot-de-passe` avant toute autre page.
 * CSRF : Next compare Origin et Host pour toute Server Action (POST uniquement).
 */
export async function loginAction(_prev: ActionFailure | null, form: FormData): Promise<ActionFailure | null> {
  const identifier = text(form, "identifier");
  const password = String(form.get("password") ?? "");
  let session;
  try {
    session = await getServices().auth.login({ identifier, password });
  } catch (err) {
    if (err instanceof ApiError) {
      const result = err.toResult();
      const message = err.status === 401 ? LOGIN_MESSAGES.UNAUTHENTICATED : LOGIN_MESSAGES[err.code];
      return message ? { ...result, message } : result;
    }
    throw err;
  }
  await setSession(session.token, new Date(session.expiresAt));
  redirect(session.mustChangePassword ? PASSWORD_CHANGE_PATH : safeNextPath(form.get("next")));
}

/**
 * Déconnexion : l'API révoque la session courante, puis le cookie part dans tous
 * les cas (même si l'API est injoignable, la session locale doit disparaître).
 */
export async function logoutAction(): Promise<void> {
  try {
    await getServices().auth.logout();
  } catch {
    // Best effort : le cookie est effacé quoi qu'il arrive.
  }
  await clearSession();
  redirect("/login");
}
