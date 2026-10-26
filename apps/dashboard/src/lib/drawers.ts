/**
 * Tiroirs pilotés par l'URL : un paramètre par type d'élément. Un seul tiroir est ouvert
 * à la fois ; la fermeture retire le paramètre et garde les autres filtres de la page.
 */
export const DRAWER_KEYS = ["abonne", "appareil", "commande", "forfait", "versement", "build"] as const;
export type DrawerKind = (typeof DRAWER_KEYS)[number];

export interface OpenDrawer {
  kind: DrawerKind;
  id: string;
}

export type SearchParamsLike = Record<string, string | string[] | undefined>;

const ID = /^[A-Za-z0-9_-]{1,80}$/;

/** Premier tiroir demandé dans l'URL, s'il est bien formé. */
export function parseDrawer(params: SearchParamsLike): OpenDrawer | null {
  for (const kind of DRAWER_KEYS) {
    const raw = params[kind];
    const id = Array.isArray(raw) ? raw[0] : raw;
    if (id && ID.test(id)) return { kind, id };
  }
  return null;
}

/** URL de la page sans aucun paramètre de tiroir, avec les autres filtres conservés. */
export function drawerCloseHref(pathname: string, params: SearchParamsLike): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if ((DRAWER_KEYS as readonly string[]).includes(key)) continue;
    for (const item of Array.isArray(value) ? value : value ? [value] : []) search.append(key, item);
  }
  const qs = search.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}
