"use client";

import { useCallback, useSyncExternalStore } from "react";

const EVENT = "vpn:preference";

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

/**
 * Préférence d'affichage PAR NAVIGATEUR (colonnes visibles, densité) : localStorage,
 * jamais l'URL ni l'API. Peut être vide (navigation privée) : le défaut s'applique.
 * Valeurs sérialisées en JSON. Rendu serveur = défaut ; le client corrige à l'hydratation.
 */
export function useLocalPreference<T>(key: string, fallback: T): [T, (next: T) => void] {
  const raw = useSyncExternalStore(
    (onChange) => {
      const handler = (event: Event) => {
        if (event instanceof StorageEvent ? event.key === key : (event as CustomEvent<string>).detail === key) onChange();
      };
      window.addEventListener("storage", handler);
      window.addEventListener(EVENT, handler);
      return () => {
        window.removeEventListener("storage", handler);
        window.removeEventListener(EVENT, handler);
      };
    },
    () => read(key),
    () => null,
  );

  let value = fallback;
  if (raw !== null) {
    try {
      value = JSON.parse(raw) as T;
    } catch {
      value = fallback;
    }
  }

  const set = useCallback(
    (next: T) => {
      try {
        window.localStorage.setItem(key, JSON.stringify(next));
      } catch {
        // Stockage indisponible : la préférence ne survit pas, l'écran fonctionne quand même.
      }
      window.dispatchEvent(new CustomEvent(EVENT, { detail: key }));
    },
    [key],
  );

  return [value, set];
}
