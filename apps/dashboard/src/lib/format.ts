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

/** Octets -> Go / Mo / Ko lisible. */
export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || Number.isNaN(bytes) || bytes < 0) return NO_VALUE;
  if (bytes === 0) return "0 o";
  const gb = bytes / 1024 ** 3;
  if (gb >= 1) return `${gb.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} Go`;
  const mb = bytes / 1024 ** 2;
  if (mb >= 1) return `${mb.toLocaleString("fr-FR", { maximumFractionDigits: 0 })} Mo`;
  const kb = bytes / 1024;
  return `${kb.toLocaleString("fr-FR", { maximumFractionDigits: 0 })} Ko`;
}
