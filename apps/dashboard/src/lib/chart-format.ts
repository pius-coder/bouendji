/**
 * Formats des graphiques, SANS "use client" : utilisables par un composant serveur
 * (ex. `InsightBand`) comme par les graphiques client. Vérifié le 2026-10-24 : une
 * fonction exportée d'un module "use client" ne peut pas être appelée côté serveur.
 */
export type ChartFormat = "number" | "xaf";

const COMPACT = new Intl.NumberFormat("fr-FR", { notation: "compact", maximumFractionDigits: 1 });
const XAF_FULL = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "XAF", maximumFractionDigits: 0 });

export function formatChartValue(value: number, format: ChartFormat, compact = false): string {
  if (format === "xaf") return compact ? COMPACT.format(value) : XAF_FULL.format(value);
  return compact ? COMPACT.format(value) : value.toLocaleString("fr-FR");
}
