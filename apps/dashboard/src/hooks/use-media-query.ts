"use client";

import { useSyncExternalStore } from "react";

/** Point de rupture du shell : sidebar et panneau latéral au-dessus, barre basse et feuilles en dessous. */
export const DESKTOP_QUERY = "(min-width: 1024px)";
export const WIDE_QUERY = "(min-width: 768px)";
/** Panneau de détail à côté de la liste (rail + sous-menu + liste + panneau tiennent). */
export const PANEL_QUERY = "(min-width: 1280px)";

/**
 * Lecture d'une media query sans `useEffect` + `setState`. Côté serveur : `serverValue`
 * (le rendu serveur suppose le desktop ; le client corrige à l'hydratation).
 */
export function useMediaQuery(query: string, serverValue = true): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => serverValue,
  );
}

export function useIsDesktop(): boolean {
  return useMediaQuery(DESKTOP_QUERY);
}
