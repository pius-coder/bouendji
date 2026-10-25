import { createLoader, parseAsString } from "nuqs/server";

/** Aucune recherche serveur n'existe : `q` filtre les 100 derniers abonnés, côté Node. */
export const subscribersParsers = {
  q: parseAsString.withDefault(""),
};

export const subscribersUrlKeys = { q: "s_q" } as const;

export const loadSubscribersParams = createLoader(subscribersParsers, { urlKeys: subscribersUrlKeys });
