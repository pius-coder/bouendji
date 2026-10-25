"use client";

import { useParams } from "next/navigation";

/**
 * Communauté active = segment d'URL `/[communityId]/…` ; à défaut, la première
 * communauté accessible. Lecture de l'URL seulement, aucun chargement.
 */
export function useActiveCommunityId(accessibleIds: readonly string[]): string | null {
  const params = useParams<{ communityId?: string }>();
  const fromUrl = params.communityId;
  if (fromUrl && accessibleIds.includes(fromUrl)) return fromUrl;
  return accessibleIds[0] ?? null;
}
