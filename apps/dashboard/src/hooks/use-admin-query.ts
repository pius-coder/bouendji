"use client";

import { useQuery, type QueryClient, type QueryKey } from "@tanstack/react-query";
import type { ZodType } from "zod";

/**
 * Lecture client d'une ressource admin, via le BFF `/api/bff/...` (GET seulement, liste
 * blanche côté serveur). Les secrets et le jeton restent côté serveur : ce hook ne voit
 * que la réponse JSON. Une page revisitée lit le cache (`staleTime` du provider).
 */
export type AdminQueryParams = Record<string, string | number | boolean | null | undefined>;

export class AdminQueryError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "AdminQueryError";
    this.status = status;
    this.code = code;
  }
}

/** Préfixe de toutes les requêtes admin : `invalidateAdmin(qc, "/v1/admin/payouts")` les couvre. */
export const ADMIN_KEY = "admin";

export function adminQueryKey(path: string, query: AdminQueryParams = {}): QueryKey {
  return [ADMIN_KEY, path, query];
}

/** Invalide une ressource (et toutes ses variantes de requête) après une mutation. */
export function invalidateAdmin(client: QueryClient, path: string): Promise<void> {
  return client.invalidateQueries({ queryKey: [ADMIN_KEY, path] });
}

function bffUrl(path: string, query: AdminQueryParams): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") search.set(key, String(value));
  }
  const qs = search.toString();
  return `/api/bff${path}${qs ? `?${qs}` : ""}`;
}

export async function fetchAdmin(path: string, query: AdminQueryParams = {}, signal?: AbortSignal): Promise<unknown> {
  const response = await fetch(bffUrl(path, query), {
    headers: { Accept: "application/json" },
    cache: "no-store",
    credentials: "same-origin",
    signal,
  });
  const json: unknown = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    const envelope = (json as { error?: { code?: string; message?: string } } | null)?.error;
    throw new AdminQueryError(response.status, envelope?.code ?? "HTTP_ERROR", envelope?.message ?? "Lecture impossible.");
  }
  return json;
}

export interface UseAdminQueryOptions<T> {
  query?: AdminQueryParams;
  /** Validation de la réponse (zod). Une réponse inattendue lève une erreur au lieu d'un affichage faux. */
  schema?: ZodType<T>;
  enabled?: boolean;
}

export function useAdminQuery<T>(path: string, options: UseAdminQueryOptions<T> = {}) {
  const query = options.query ?? {};
  const schema = options.schema;
  return useQuery<T, AdminQueryError>({
    queryKey: adminQueryKey(path, query),
    enabled: options.enabled ?? true,
    queryFn: async ({ signal }) => {
      const json = await fetchAdmin(path, query, signal);
      if (!schema) return json as T;
      const parsed = schema.safeParse(json);
      if (!parsed.success) throw new AdminQueryError(502, "BAD_RESPONSE", "Réponse de l'API inattendue.");
      return parsed.data;
    },
  });
}
