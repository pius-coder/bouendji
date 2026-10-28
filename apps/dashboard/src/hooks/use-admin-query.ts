"use client";

import { useQuery, useQueryClient, type QueryClient, type QueryKey } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useCallback } from "react";
import type { ZodType } from "zod";

/**
 * Lecture client d'une ressource admin, via le BFF `/api/bff/...` (GET seulement, liste
 * blanche côté serveur). Les secrets et le jeton restent côté serveur : ce hook ne voit
 * que la réponse JSON. Une page revisitée lit le cache (`staleTime` du provider = 30 s).
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

/** Invalide plusieurs ressources ciblées en parallèle après une mutation. */
export async function invalidateAdminMany(client: QueryClient, paths: readonly string[]): Promise<void> {
  await Promise.all(paths.map((path) => invalidateAdmin(client, path)));
}

/** Amorçage du cache client depuis une lecture serveur atomique. */
export function seedAdminCache<T>(
  client: QueryClient,
  path: string,
  query: AdminQueryParams,
  data: T,
): void {
  client.setQueryData(adminQueryKey(path, query), data);
}

/**
 * Hook d'invalidation ciblée après une Server Action de mutation :
 * invalide uniquement les clés React Query impactées puis rafraîchit les feuilles serveur.
 */
export function useInvalidateAdmin() {
  const queryClient = useQueryClient();
  const router = useRouter();

  return useCallback(
    async (paths: string | readonly string[]) => {
      const list = typeof paths === "string" ? [paths] : paths;
      await invalidateAdminMany(queryClient, list);
      router.refresh();
    },
    [queryClient, router],
  );
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
  /** Données initiales issues du rendu serveur atomique (évite un refetch pendant `staleTime`). */
  initialData?: T;
  initialDataUpdatedAt?: number;
}

export function useAdminQuery<T>(path: string, options: UseAdminQueryOptions<T> = {}) {
  const query = options.query ?? {};
  const schema = options.schema;
  return useQuery<T, AdminQueryError>({
    queryKey: adminQueryKey(path, query),
    enabled: options.enabled ?? true,
    initialData: options.initialData,
    initialDataUpdatedAt: options.initialDataUpdatedAt,
    queryFn: async ({ signal }) => {
      const json = await fetchAdmin(path, query, signal);
      if (!schema) return json as T;
      const parsed = schema.safeParse(json);
      if (!parsed.success) throw new AdminQueryError(502, "BAD_RESPONSE", "Réponse de l'API inattendue.");
      return parsed.data;
    },
  });
}
