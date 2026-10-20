/**
 * Unique point d'entrée réseau du dashboard.
 *
 * Deux invariants :
 *
 * 1. **Les chemins sont relatifs à l'origine.** `apiFetch` refuse tout chemin
 *    qui ne commence pas par `/v1/` : le `basePath` `/admin` ne doit jamais
 *    entrer dans une URL d'API, et aucun hôte ne doit être codé en dur.
 * 2. **Un seul endroit ajoute `Authorization: Bearer`.** La connexion est la
 *    seule requête qui passe `auth: false` ; toutes les autres exigent un jeton.
 */

export interface ApiFetchOptions {
  /** Jeton d'administration. Ignoré si `auth` vaut `false`. */
  token?: string | null;
  method?: string;
  body?: unknown;
  /** `false` uniquement pour `POST /v1/admin/auth/login`. */
  auth?: boolean;
}

interface ApiErrorPayload {
  code?: unknown;
  message?: unknown;
  details?: unknown;
  retryAfter?: unknown;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: Record<string, string> | null;
  readonly retryAfter: number | null;
  /** Vrai quand la session a déjà réagi (401) : l'écran ne doit rien afficher. */
  handled = false;

  constructor(
    status: number,
    code: string,
    message: string,
    details: Record<string, string> | null = null,
    retryAfter: number | null = null,
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
    this.retryAfter = retryAfter;
  }
}

function networkMessage(): string {
  return "Impossible de joindre l'API. Vérifiez la connexion réseau, puis réessayez.";
}

function readDetails(value: unknown): Record<string, string> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const details: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (typeof entry === "string") details[key] = entry;
    else if (typeof entry === "number" || typeof entry === "boolean") details[key] = String(entry);
  }
  return Object.keys(details).length > 0 ? details : null;
}

export async function apiFetch(path: string, options: ApiFetchOptions = {}): Promise<unknown> {
  if (!path.startsWith("/v1/")) {
    throw new ApiError(0, "BAD_PATH", "Chemin d'API invalide : seuls les chemins /v1/ relatifs sont autorisés.");
  }
  const authenticated = options.auth !== false;
  if (authenticated && !options.token) {
    throw new ApiError(401, "UNAUTHENTICATED", "Aucune session active.");
  }

  const headers: Record<string, string> = { accept: "application/json" };
  if (options.body !== undefined) headers["content-type"] = "application/json";
  if (authenticated && options.token) headers.authorization = `Bearer ${options.token}`;

  const init: RequestInit = {
    method: options.method ?? "GET",
    headers,
    credentials: "omit",
    cache: "no-store",
  };
  if (options.body !== undefined) init.body = JSON.stringify(options.body);

  let response: Response;
  try {
    response = await fetch(path, init);
  } catch {
    throw new ApiError(0, "NETWORK", networkMessage());
  }

  const raw = await response.text();
  let payload: unknown = null;
  if (raw) {
    try {
      payload = JSON.parse(raw) as unknown;
    } catch {
      throw new ApiError(response.status, "BAD_RESPONSE", "La réponse de l'API n'est pas du JSON lisible.");
    }
  }

  if (response.ok) return payload;

  const error =
    payload && typeof payload === "object" && !Array.isArray(payload)
      ? ((payload as { error?: unknown }).error as ApiErrorPayload | undefined)
      : undefined;
  const code = error && typeof error.code === "string" ? error.code : "";
  const message =
    error && typeof error.message === "string" && error.message
      ? error.message
      : `La requête a été refusée (HTTP ${response.status}).`;
  const retryAfter = error && typeof error.retryAfter === "number" ? error.retryAfter : null;

  throw new ApiError(response.status, code, message, readDetails(error?.details), retryAfter);
}
