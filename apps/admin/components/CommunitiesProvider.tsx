"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { ApiError } from "@/lib/api";
import { list, normalizeCommunity } from "@/lib/normalize";
import type { Community } from "@/lib/types";
import { useSession } from "./SessionProvider";

interface CommunitiesValue {
  communities: Community[];
  loading: boolean;
  error: ApiError | null;
  reload: () => Promise<void>;
  /** Communauté courante : la sélection si elle existe encore, sinon la première. */
  selectedId: string | null;
  select: (communityId: string) => void;
  byId: (communityId: string | null) => Community | null;
}

const CommunitiesContext = createContext<CommunitiesValue | null>(null);

export function useCommunities(): CommunitiesValue {
  const value = useContext(CommunitiesContext);
  if (!value) throw new Error("useCommunities doit être utilisé dans <CommunitiesProvider>.");
  return value;
}

/**
 * Liste des communautés visibles par la session, chargée une fois et partagée.
 * `GET /v1/admin/communities` renvoie au plus 200 communautés, les plus
 * récentes : c'est une limite de l'API, pas un choix de l'interface.
 */
export function CommunitiesProvider({ children }: { children: ReactNode }) {
  const { request } = useSession();
  const [communities, setCommunities] = useState<Community[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [selection, setSelection] = useState<string | null>(null);
  const sequence = useRef(0);

  async function load(): Promise<void> {
    const run = ++sequence.current;
    setLoading(true);
    try {
      const payload = await request("/v1/admin/communities");
      if (run !== sequence.current) return;
      const rows = list(payload)
        .map(normalizeCommunity)
        .filter((community): community is Community => community !== null);
      setCommunities(rows);
      setError(null);
    } catch (caught) {
      if (run !== sequence.current) return;
      if (caught instanceof ApiError && caught.handled) return;
      setError(
        caught instanceof ApiError
          ? caught
          : new ApiError(0, "UNKNOWN", caught instanceof Error ? caught.message : "Chargement impossible."),
      );
    } finally {
      if (run === sequence.current) setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // Chargement unique à l'ouverture de la session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedId = communities.some((community) => community.id === selection)
    ? selection
    : (communities[0]?.id ?? null);

  const value: CommunitiesValue = {
    communities,
    loading,
    error,
    reload: load,
    selectedId,
    select: setSelection,
    byId: (communityId) => communities.find((community) => community.id === communityId) ?? null,
  };

  return <CommunitiesContext.Provider value={value}>{children}</CommunitiesContext.Provider>;
}
