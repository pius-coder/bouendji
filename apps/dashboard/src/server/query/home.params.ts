import { createLoader, createSerializer, parseAsString, parseAsStringLiteral } from "nuqs/server";

/**
 * Paramètres de l'accueil. Préfixe `h_`. `period` : fenêtre des indicateurs ;
 * `open` : élément de la file « À traiter » ouvert dans le panneau (`payout:<id>` ou
 * `endpoint:<id>`).
 */
export const HOME_PERIODS = ["7j", "30j", "90j"] as const;
export type HomePeriod = (typeof HOME_PERIODS)[number];

export const PERIOD_DAYS: Record<HomePeriod, number> = { "7j": 7, "30j": 30, "90j": 90 };
export const PERIOD_LABEL: Record<HomePeriod, string> = {
  "7j": "7 derniers jours",
  "30j": "30 derniers jours",
  "90j": "90 derniers jours",
};

export const homeParsers = {
  period: parseAsStringLiteral(HOME_PERIODS).withDefault("30j"),
  open: parseAsString.withDefault(""),
};

export const homeUrlKeys = { period: "h_period", open: "h_open" } as const;

export const loadHomeParams = createLoader(homeParsers, { urlKeys: homeUrlKeys });
export const serializeHome = createSerializer(homeParsers, { urlKeys: homeUrlKeys, clearOnDefault: true });

export type HomeOpen = { kind: "payout" | "endpoint"; id: string } | null;

export function parseHomeOpen(value: string): HomeOpen {
  const [kind, ...rest] = value.split(":");
  const id = rest.join(":");
  if ((kind === "payout" || kind === "endpoint") && id) return { kind, id };
  return null;
}
