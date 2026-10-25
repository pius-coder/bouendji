"use server";

import { redirect } from "next/navigation";
import { ApiError } from "@/server/api/api-error";
import { clearSession, setSession } from "@/server/api/session";
import { getServices } from "@/server/services";
import { safeNextPath, text } from "./action-result";
import type { ActionFailure } from "@/server/api/api-error";

/**
 * Connexion. Le JWT reçu va dans le cookie httpOnly et nulle part ailleurs :
 * la valeur de retour n'en contient aucune trace. CSRF : Next compare Origin et
 * Host pour toute Server Action (POST uniquement), voir README.
 */
export async function loginAction(_prev: ActionFailure | null, form: FormData): Promise<ActionFailure | null> {
  const email = text(form, "email");
  const password = String(form.get("password") ?? "");
  try {
    const session = await getServices().auth.login({ email, password });
    await setSession(session.accessToken, new Date(session.accessExpiresAt));
  } catch (err) {
    if (err instanceof ApiError) return err.toResult();
    throw err;
  }
  redirect(safeNextPath(form.get("next")));
}

export async function logoutAction(): Promise<void> {
  await clearSession();
  redirect("/login");
}
