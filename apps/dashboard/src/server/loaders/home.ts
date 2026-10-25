import "server-only";
import { connection } from "next/server";
import { cache } from "react";
import { can } from "@/lib/roles";
import { getCommunities, getMe, withSession } from "@/server/context";
import { getServices } from "@/server/services";

/**
 * Lectures de l'accueil, dédoublonnées dans la requête (`cache()` de React) :
 * plusieurs blocs lisent les mêmes listes sans multiplier les appels.
 * Le rôle décide de ce qu'on DEMANDE (évite des 403 attendus) ; l'API reste l'autorité.
 */

/** Communautés prises en compte (une requête de commandes chacune). */
export const HOME_COMMUNITY_CAP = 25;
/** Taille de page demandée à l'API (maximum accepté : 100). */
export const HOME_ORDERS_LIMIT = 100;
export const SUBSCRIBERS_CAP = 100;

export const getHomeScope = cache(async () => {
  const [me, communities] = await Promise.all([getMe(), getCommunities()]);
  const scoped = communities.slice(0, HOME_COMMUNITY_CAP);
  return { me, communities: scoped, cappedFrom: communities.length > HOME_COMMUNITY_CAP ? communities.length : null };
});

export const getCommunityOrders = cache((communityId: string) =>
  withSession(() => getServices().orders.listOrders({ communityId, limit: HOME_ORDERS_LIMIT })),
);

export const getCommunitySubscribers = cache((communityId: string) =>
  withSession(() => getServices().subscribers.listSubscribers({ communityId })),
);

export const getPayouts = cache(() => withSession(() => getServices().payouts.listPayouts({})));

export const getPool = cache(() => withSession(() => getServices().network.getPool()));

/** Capacités de l'accueil, calculées une fois. */
export const getHomeAccess = cache(async () => {
  const { me, communities } = await getHomeScope();
  const orders = communities.filter((c) => can(me, "orders.read", c.id));
  return {
    me,
    communities,
    ordersCommunities: orders,
    moneyVisible: orders.some((c) => can(me, "money.read", c.id)),
    subscribersCommunities: communities.filter((c) => can(me, "members.read", c.id)),
    payouts: can(me, "payouts.read", null),
    network: can(me, "network.read", null),
    payoutsApprove: can(me, "payouts.approve", null),
  };
});

/**
 * Instant de la requête, lu UNE fois par rendu (tous les blocs calculent la même
 * fenêtre). `connection()` : Cache Components exige une source dynamique avant `Date.now()`.
 */
export const getRequestNow = cache(async () => {
  await connection();
  return Date.now();
});
