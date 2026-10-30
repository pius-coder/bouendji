/**
 * Liste blanche du BFF de lecture (`/api/bff/...`). Seuls ces préfixes de l'API admin
 * sont relayés, et seulement en GET. Ajouter une ligne = ouvrir une lecture de plus :
 * vérifier qu'elle ne renvoie ni secret ni jeton (la clé d'accès et le JWT restent côté serveur).
 */
export const BFF_API_ROOT = "/v1/admin";

export const BFF_READ_PREFIXES: readonly string[] = [
  "/v1/admin/me",
  "/v1/admin/communities",
  "/v1/admin/memberships",
  "/v1/admin/admins",
  "/v1/admin/audit-log",
  "/v1/admin/apps",
  "/v1/admin/plans",
  "/v1/admin/payouts",
  "/v1/admin/devices",
  "/v1/admin/offline-bundles",
  "/v1/admin/pool",
  "/v1/admin/users",
  "/v1/admin/orders",
  "/v1/admin/search",
  "/v1/admin/onboarding",
  "/v1/admin/pricing",
  "/v1/admin/night-slots",
  "/v1/admin/xui",
];

const MAX_SEGMENTS = 8;
const SEGMENT = /^[A-Za-z0-9_-]{1,120}$/;
const QUERY_KEY = /^[A-Za-z0-9_]{1,40}$/;
const MAX_QUERY_KEYS = 20;
const MAX_QUERY_VALUE = 200;

/**
 * Chemin de l'API pour des segments d'URL, ou `null` si la requête sort de la liste
 * blanche. Pas de `:` (pas de paramètre de chemin), pas de `.` ni de `..`, pas de segment vide.
 */
export function bffTargetPath(segments: readonly string[]): string | null {
  // Le navigateur appelle `/api/bff/v1/admin/...` : le préfixe est déjà dans l'URL.
  // Sans ce retrait, la liste blanche ne voit jamais `/v1/admin/...` et renvoie « Ressource inconnue ».
  const rest = segments[0] === "v1" && segments[1] === "admin" ? segments.slice(2) : segments;
  if (rest.length === 0 || rest.length > MAX_SEGMENTS) return null;
  if (!rest.every((segment) => SEGMENT.test(segment))) return null;
  const path = `${BFF_API_ROOT}/${rest.join("/")}`;
  const allowed = BFF_READ_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
  return allowed ? path : null;
}

/** Query string relayée : clés simples, valeurs courtes, nombre borné. */
export function bffQuery(params: URLSearchParams): Record<string, string> {
  const out: Record<string, string> = {};
  let count = 0;
  for (const [key, value] of params) {
    if (!QUERY_KEY.test(key) || value.length > MAX_QUERY_VALUE) continue;
    if (count >= MAX_QUERY_KEYS) break;
    out[key] = value;
    count += 1;
  }
  return out;
}
