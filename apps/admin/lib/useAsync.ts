"use client";

import { useEffect, useRef, useState } from "react";
import { ApiError } from "./api";

export interface AsyncState<T> {
  loading: boolean;
  data: T | null;
  error: ApiError | null;
  reload: () => void;
}

/**
 * Chargement d'une ressource avec annulation logique : un écran démonté (ou une
 * requête remplacée) n'écrit jamais dans un état qui n'existe plus.
 *
 * `load` est stockée dans une ref : sa nouvelle identité à chaque rendu ne
 * relance pas la requête. Seules les valeurs listées dans `deps` le font.
 */
export function useAsync<T>(load: () => Promise<T>, deps: readonly unknown[]): AsyncState<T> {
  const loadRef = useRef(load);
  loadRef.current = load;

  const [state, setState] = useState<{ loading: boolean; data: T | null; error: ApiError | null }>({
    loading: true,
    data: null,
    error: null,
  });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let alive = true;
    setState((previous) => ({ loading: true, data: previous.data, error: null }));
    loadRef
      .current()
      .then((data) => {
        if (alive) setState({ loading: false, data, error: null });
      })
      .catch((error: unknown) => {
        // Une session expirée est déjà traitée par le fournisseur : l'écran va
        // être démonté, il ne doit pas peindre un panneau d'erreur au passage.
        if (error instanceof ApiError && error.handled) return;
        if (!alive) return;
        setState({
          loading: false,
          data: null,
          error:
            error instanceof ApiError
              ? error
              : new ApiError(0, "UNKNOWN", error instanceof Error ? error.message : "Erreur inconnue."),
        });
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  return { ...state, reload: () => setNonce((value) => value + 1) };
}
