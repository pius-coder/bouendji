"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

/** Données admin : une page revisitée s'affiche depuis le cache pendant 30 s, puis se met à jour en arrière-plan. */
export const ADMIN_STALE_TIME_MS = 30_000;
/** Cache gardé 5 min après le dernier usage ; vidé à la déconnexion (`queryClient.clear()`). */
export const ADMIN_GC_TIME_MS = 5 * 60_000;

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: ADMIN_STALE_TIME_MS,
        gcTime: ADMIN_GC_TIME_MS,
        // Retour sur l'onglet = rafraîchissement ; aucun sondage périodique (plan 5).
        refetchOnWindowFocus: true,
        retry: 1,
      },
    },
  });
}

/** Fournisseurs du dashboard côté client. Le cache n'est jamais persisté (pas de localStorage). */
export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(createQueryClient);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
