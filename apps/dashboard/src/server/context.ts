import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { ApiError } from "@/server/api/api-error";
import { getServices } from "@/server/services";

/**
 * Lectures partagées par plusieurs blocs d'une même requête. `cache()` de React
 * dédoublonne dans le rendu en cours ; rien ne survit à la requête (pas de
 * cache public sur les données admin).
 */
export const getMe = cache(() => withSession(() => getServices().auth.getMe()));
export const getCommunities = cache(() => withSession(() => getServices().communities.listCommunities()));

/**
 * 401 -> /login (session absente ou expirée). Les autres erreurs remontent :
 * `error.tsx` les affiche, un 403 est évité en amont par `can()`.
 */
export async function withSession<T>(read: () => Promise<T>): Promise<T> {
  try {
    return await read();
  } catch (err) {
    if (err instanceof ApiError && err.isUnauthenticated) redirect("/login");
    throw err;
  }
}

/** Abonnés d'une communauté (100 derniers), dédoublonnés dans la requête : sert aussi à nommer les commandes. */
export const getSubscribers = cache((communityId: string) =>
  withSession(() => getServices().subscribers.listSubscribers({ communityId })),
);
