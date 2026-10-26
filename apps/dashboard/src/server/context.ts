import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { ApiError } from "@/server/api/api-error";
import { passwordChangeTarget } from "@/server/services/admin-auth/account-guard";
import { PASSWORD_CHANGE_PATH } from "@/server/services/admin-auth/password-change-path";
import { getServices } from "@/server/services";

/**
 * Lectures partagées par plusieurs blocs d'une même requête. `cache()` de React
 * dédoublonne dans le rendu en cours ; rien ne survit à la requête (pas de
 * cache public sur les données admin).
 *
 * `getMe` redirige vers `/mot-de-passe` tant que l'API exige un changement de mot
 * de passe : aucune page du shell ne s'affiche avant.
 */
export const getMe = cache(async () => {
  const me = await withSession(() => getServices().auth.getMe());
  if (me.mustChangePassword) redirect(PASSWORD_CHANGE_PATH);
  return me;
});
export const getCommunities = cache(() => withSession(() => getServices().communities.listCommunities()));

/**
 * 401 -> /login (session absente ou expirée). 403 `PASSWORD_CHANGE_REQUIRED` ->
 * /mot-de-passe. Les autres erreurs remontent : `error.tsx` les affiche, un 403
 * d'autre nature est évité en amont par `can()`.
 */
export async function withSession<T>(read: () => Promise<T>): Promise<T> {
  try {
    return await read();
  } catch (err) {
    if (err instanceof ApiError && err.isUnauthenticated) redirect("/login");
    const target = passwordChangeTarget(err);
    if (target) redirect(target);
    throw err;
  }
}

/** Abonnés d'une communauté (100 derniers), dédoublonnés dans la requête : sert aussi à nommer les commandes. */
export const getSubscribers = cache((communityId: string) =>
  withSession(() => getServices().subscribers.listSubscribers({ communityId })),
);
