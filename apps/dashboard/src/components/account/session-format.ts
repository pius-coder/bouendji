/*
 * Libellé lisible d'une session à partir de son User-Agent. Approximation volontaire :
 * l'objectif est de reconnaître « Chrome sur Android » ou « Safari sur iOS », pas
 * de dresser un profil de l'appareil.
 */

export function describeAgent(userAgent: string | null | undefined): string {
  if (!userAgent) return "Appareil inconnu";
  const ua = userAgent;
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\/|Opera/.test(ua)
      ? "Opera"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Chrome\//.test(ua)
          ? "Chrome"
          : /Safari\//.test(ua)
            ? "Safari"
            : "Navigateur";
  const os = /Android/.test(ua)
    ? "Android"
    : /iPhone|iPad|iPod/.test(ua)
      ? "iOS"
      : /Windows/.test(ua)
        ? "Windows"
        : /Mac OS X|Macintosh/.test(ua)
          ? "macOS"
          : /Linux/.test(ua)
            ? "Linux"
            : null;
  return os ? `${browser} sur ${os}` : browser;
}

const DATE_FORMAT = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Africa/Douala",
});

/** Date d'une session, heure de Douala. Une date invalide reste affichée telle quelle. */
export function formatSessionDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : DATE_FORMAT.format(date);
}
