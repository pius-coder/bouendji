import { createLoader, parseAsString } from "nuqs/server";

/** Filtre local sur les 100 derniers appareils (aucune pagination ni recherche côté API). */
export const devicesParsers = {
  q: parseAsString.withDefault(""),
  status: parseAsString.withDefault(""),
};

export const devicesUrlKeys = { q: "d_q", status: "d_status" } as const;

export const loadDevicesParams = createLoader(devicesParsers, { urlKeys: devicesUrlKeys });
