import { createLoader, parseAsString } from "nuqs/server";

/**
 * Paramètres d'URL de la table des commandes. Défini UNE fois : importé par la
 * page serveur (`loadOrdersParams`) et par les blocs client (`useQueryStates`).
 * Préfixe `o_` : deux tables ne partagent jamais une clé.
 */
export const ORDERS_PAGE_SIZE = 20;

export const ordersParsers = {
  status: parseAsString.withDefault(""),
  cursor: parseAsString.withDefault(""),
};

export const ordersUrlKeys = { status: "o_status", cursor: "o_cursor" } as const;

export const loadOrdersParams = createLoader(ordersParsers, { urlKeys: ordersUrlKeys });
