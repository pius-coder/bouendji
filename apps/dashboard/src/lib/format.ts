/** Formats d'affichage. Fonctions pures, utilisables côté serveur et client. */

const XAF = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "XAF", maximumFractionDigits: 0 });
const DATE_TIME = new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: "UTC" });
const TIME = new Intl.DateTimeFormat("fr-FR", { timeStyle: "short", timeZone: "UTC" });

export const NO_VALUE = "—";

export function formatXaf(amount: number): string {
  return XAF.format(amount);
}

/** Date et heure en UTC, suffixées : le fuseau de l'exploitant n'est pas établi. */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return NO_VALUE;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? NO_VALUE : `${DATE_TIME.format(date)} UTC`;
}

export function formatTime(date: Date): string {
  return `${TIME.format(date)} UTC`;
}

/** Points de base -> pourcentage lisible (250 -> "2,5 %"). */
export function formatBps(bps: number): string {
  return `${(bps / 100).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} %`;
}
