"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import { normalizeAdmin, str } from "@/lib/normalize";
import type { AdminIdentity } from "@/lib/types";

export type BannerTone = "info" | "ok" | "error";

export interface BannerState {
  id: number;
  tone: BannerTone;
  message: string;
}

export interface RequestOptions {
  method?: string;
  body?: unknown;
  /** `false` uniquement pour la connexion. */
  auth?: boolean;
}

export type RequestFn = (path: string, options?: RequestOptions) => Promise<unknown>;

interface SessionValue {
  token: string | null;
  admin: AdminIdentity | null;
  expiresAt: number | null;
  banner: BannerState | null;
  showBanner: (message: string, tone?: BannerTone) => void;
  dismissBanner: () => void;
  request: RequestFn;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const SessionContext = createContext<SessionValue | null>(null);

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession doit être utilisé dans <SessionProvider>.");
  return value;
}

let bannerSeq = 0;

/**
 * Le jeton vit dans l'état React du fournisseur — donc en mémoire de l'onglet.
 * Il n'est jamais écrit dans `localStorage`, `sessionStorage`, un cookie,
 * `indexedDB` ni dans l'URL. Un rechargement de la page impose une reconnexion.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [admin, setAdmin] = useState<AdminIdentity | null>(null);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [banner, setBanner] = useState<BannerState | null>(null);

  // Ref synchronisée : une requête lancée juste après la connexion voit le
  // jeton sans attendre le rendu suivant.
  const tokenRef = useRef<string | null>(null);

  const showBanner = useCallback((message: string, tone: BannerTone = "info") => {
    bannerSeq += 1;
    setBanner({ id: bannerSeq, tone, message });
  }, []);

  const dismissBanner = useCallback(() => setBanner(null), []);

  const endSession = useCallback(
    (reason: "expired" | "logout") => {
      tokenRef.current = null;
      setToken(null);
      setAdmin(null);
      setExpiresAt(null);
      if (reason === "expired") {
        showBanner("Session expirée. Reconnectez-vous pour continuer.", "error");
      } else {
        showBanner("Session fermée.", "ok");
      }
    },
    [showBanner],
  );

  const logout = useCallback(() => endSession("logout"), [endSession]);

  const request: RequestFn = async (path, options = {}) => {
    const authenticated = options.auth !== false;
    try {
      return await apiFetch(path, {
        token: authenticated ? tokenRef.current : null,
        method: options.method,
        body: options.body,
        auth: options.auth,
      });
    } catch (error) {
      if (authenticated && error instanceof ApiError) {
        if (error.status === 401) {
          error.handled = true;
          endSession("expired");
        } else if (error.status === 403) {
          showBanner("Accès refusé : votre rôle ne permet pas cette opération.", "error");
        } else if (error.status === 429) {
          const delay = error.retryAfter;
          showBanner(
            delay
              ? `Trop de requêtes. Réessayez dans ${delay} seconde${delay > 1 ? "s" : ""}.`
              : "Trop de requêtes. Attendez avant de réessayer.",
            "error",
          );
        }
      }
      throw error;
    }
  };

  const login = useCallback(
    async (email: string, password: string) => {
      const payload = await apiFetch("/v1/admin/auth/login", {
        method: "POST",
        auth: false,
        body: { email, password },
      });
      const record = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
      const accessToken = str(record.accessToken) || str(record.token);
      if (!accessToken) {
        throw new ApiError(200, "BAD_RESPONSE", "La connexion a répondu sans jeton de session.");
      }
      const rawExpiry = str(record.accessExpiresAt) || str(record.expiresAt);
      const parsedExpiry = Date.parse(rawExpiry);

      // L'identité et les rôles viennent de /me, jamais du corps de connexion.
      const me = await apiFetch("/v1/admin/me", { token: accessToken });
      const identity = normalizeAdmin(me);

      tokenRef.current = accessToken;
      setToken(accessToken);
      setAdmin(identity);
      setExpiresAt(Number.isFinite(parsedExpiry) ? parsedExpiry : null);
      showBanner("Session ouverte.", "ok");
    },
    [showBanner],
  );

  // Fin de session à l'échéance annoncée par l'API (8 h), sans attendre un 401.
  useEffect(() => {
    if (!expiresAt) return;
    const delay = expiresAt - Date.now();
    if (delay <= 0) {
      endSession("expired");
      return;
    }
    const timer = window.setTimeout(() => endSession("expired"), delay);
    return () => window.clearTimeout(timer);
  }, [expiresAt, endSession]);

  // Un bandeau de succès s'efface seul ; une erreur reste jusqu'à fermeture.
  useEffect(() => {
    if (!banner || banner.tone !== "ok") return;
    const timer = window.setTimeout(() => setBanner(null), 7000);
    return () => window.clearTimeout(timer);
  }, [banner]);

  const value: SessionValue = {
    token,
    admin,
    expiresAt,
    banner,
    showBanner,
    dismissBanner,
    request,
    login,
    logout,
  };

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
