"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { type AdminQueryParams, seedAdminCache } from "@/hooks/use-admin-query";

/**
 * Pont d'amorçage du cache client React Query (`staleTime = 30s`) depuis un bloc serveur
 * atomique (D104). Permet aux composants clients et aux retours arrière de disposer
 * immédiatement de la donnée en cache sans refetch complet, jusqu'à un appel explicite
 * à `invalidateAdmin(queryClient, path)`.
 */
export function AdminCacheSeed<T>({
  path,
  query = {},
  data,
}: {
  path: string;
  query?: AdminQueryParams;
  data: T;
}) {
  const queryClient = useQueryClient();

  useEffect(() => {
    seedAdminCache(queryClient, path, query, data);
  }, [queryClient, path, query, data]);

  return null;
}
