import "server-only";
import type { ZodError, ZodTypeAny } from "zod";
import { ApiError, parseErrorEnvelope } from "./api-error";
import type { CallInput, CallResult, Endpoint } from "./endpoint";

/* -------------------------------------------------------------------------
 * BaseService : seul endroit du dashboard qui appelle l'API.
 *
 * Un service déclare un `basePath` et des endpoints (chemin relatif + options,
 * voir endpoint.ts). Tout passe par `call(endpoint, input)` :
 *
 *   1. valide params / query / body avec les schémas zod déclarés -> si invalide,
 *      ApiError VALIDATION_FAILED, AUCUN appel réseau ;
 *   2. construit l'URL (basePath + chemin relatif + params + query) ;
 *   3. pose les en-têtes selon les options (jamais écrits par les services) :
 *        admin true  -> X-Access-Key + Authorization: Bearer <JWT de session>
 *        admin "key" -> X-Access-Key seul (connexion)
 *        idempotent  -> Idempotency-Key
 *   4. fetch avec timeout ; no-store, sauf `revalidate` (interdit avec admin) ;
 *   5. enveloppe d'erreur -> ApiError ; réponse validée par le schéma `response` ;
 *   6. `refreshAfter` : appelle `deps.afterMutation` (refresh() de Next).
 * ------------------------------------------------------------------------- */

export interface Page<T> {
  items: T[];
  nextCursor?: string;
}

export interface BaseServiceDeps {
  /** Racine de l'API, sans slash final. Serveur uniquement. */
  baseUrl: string;
  /** `DASHBOARD_ACCESS_KEY`. Serveur uniquement. */
  accessKey: string;
  /** JWT `vpn-admin` de la session, ou `undefined`. Lu dans le cookie httpOnly. */
  getToken: () => Promise<string | undefined>;
  /** Appelé après une mutation réussie portant `refreshAfter` (en prod : `refresh()` de next/cache). */
  afterMutation?: () => void;
  fetch?: typeof fetch;
  defaultTimeoutMs?: number;
}

export const DEFAULT_TIMEOUT_MS = 10_000;

export interface BaseServiceConfig {
  /** Dossier de l'API couvert par le service, ex. `/v1/admin/communities`. */
  basePath: string;
  /** Authentification par défaut des endpoints du service (défaut : `true`). */
  admin?: boolean | "key";
}

export abstract class BaseService {
  constructor(
    protected readonly deps: BaseServiceDeps,
    protected readonly config: BaseServiceConfig,
  ) {}

  /** Le process générique. Chaque méthode de service se réduit à un appel à `call`. */
  protected async call<E extends Endpoint>(ep: E, input?: CallInput<E>): Promise<CallResult<E>> {
    const raw = (input ?? {}) as {
      params?: unknown;
      query?: unknown;
      body?: unknown;
      idempotencyKey?: string;
      signal?: AbortSignal;
    };
    const admin = ep.admin ?? this.config.admin ?? true;
    if (admin && ep.revalidate !== undefined) {
      throw new Error(`BaseService: "revalidate" est interdit avec "admin" (${ep.method} ${ep.path}).`);
    }

    // 1. Validation locale.
    const params = parseWith(ep.params, raw.params ?? {}) as Record<string, unknown>;
    const query = parseWith(ep.query, raw.query ?? {}) as Record<string, unknown>;
    const body = ep.body ? parseWith(ep.body, raw.body ?? {}) : undefined;

    // 2. URL.
    const path = ep.path.replace(/:([A-Za-z][A-Za-z0-9_]*)/g, (_, name: string) => {
      const value = params[name];
      if (value === undefined || value === null || value === "") {
        throw new ApiError({
          status: 400,
          code: "VALIDATION_FAILED",
          message: "Paramètre de chemin manquant.",
          details: { [name]: "Requis." },
        });
      }
      return encodeURIComponent(String(value));
    });
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== "") search.set(key, String(value));
    }
    const qs = search.toString();
    const url = `${this.deps.baseUrl}${ep.basePath ?? this.config.basePath}${path === "/" ? "" : path}${qs ? `?${qs}` : ""}`;

    // 3. En-têtes.
    const headers = new Headers({ Accept: "application/json" });
    if (body !== undefined) headers.set("Content-Type", "application/json");
    if (admin) {
      headers.set("X-Access-Key", this.deps.accessKey);
      if (admin === true) {
        const token = await this.deps.getToken();
        if (!token) {
          throw new ApiError({ status: 401, code: "UNAUTHENTICATED", message: "Session absente ou expirée." });
        }
        headers.set("Authorization", `Bearer ${token}`);
      }
    }
    if (ep.idempotent) headers.set("Idempotency-Key", raw.idempotencyKey ?? crypto.randomUUID());

    // 4. Envoi.
    const timeoutMs = ep.timeout ?? this.deps.defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS;
    const signal = raw.signal
      ? AbortSignal.any([raw.signal, AbortSignal.timeout(timeoutMs)])
      : AbortSignal.timeout(timeoutMs);
    const init: RequestInit & { next?: { revalidate: number; tags?: string[] } } = {
      method: ep.method,
      headers,
      signal,
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: "error",
    };
    if (ep.revalidate !== undefined) {
      init.next = { revalidate: ep.revalidate, ...(ep.cacheTags ? { tags: ep.cacheTags } : {}) };
    } else {
      init.cache = "no-store";
    }

    let response: Response;
    try {
      response = await (this.deps.fetch ?? fetch)(url, init);
    } catch (err) {
      const timedOut = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
      throw new ApiError({
        status: 0,
        code: timedOut ? "TIMEOUT" : "UNREACHABLE",
        message: timedOut ? "L'API n'a pas répondu à temps." : "API injoignable.",
      });
    }

    // 5. Réponse.
    const text = response.status === 204 ? "" : await response.text();
    let json: unknown;
    if (text) {
      try {
        json = JSON.parse(text);
      } catch {
        if (response.ok) {
          throw new ApiError({ status: response.status, code: "BAD_RESPONSE", message: "Réponse de l'API illisible." });
        }
      }
    }
    if (!response.ok) throw parseErrorEnvelope(response.status, json, response.headers.get("retry-after"));

    if (ep.paginate === "cursor") json = normalizePage(json);
    let result: unknown = undefined;
    if (ep.response) {
      const parsed = ep.response.safeParse(json);
      if (!parsed.success) {
        throw new ApiError({
          status: response.status,
          code: "BAD_RESPONSE",
          message: "Réponse de l'API inattendue.",
          details: issues(parsed.error),
        });
      }
      result = parsed.data;
    }

    // 6. Relecture des données après mutation.
    if (ep.refreshAfter) this.deps.afterMutation?.();
    return result as CallResult<E>;
  }
}

function parseWith(schema: ZodTypeAny | undefined, value: unknown): unknown {
  if (!schema) return value;
  const parsed = schema.safeParse(value);
  if (parsed.success) return parsed.data;
  throw new ApiError({
    status: 400,
    code: "VALIDATION_FAILED",
    message: "Données invalides.",
    details: issues(parsed.error),
  });
}

function issues(error: ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    if (!(key in out)) out[key] = issue.message;
  }
  return out;
}

function normalizePage(json: unknown): Page<unknown> {
  const root = (typeof json === "object" && json !== null ? json : {}) as Record<string, unknown>;
  const items = Array.isArray(root.items) ? root.items : [];
  const nextCursor = typeof root.nextCursor === "string" && root.nextCursor ? root.nextCursor : undefined;
  return nextCursor ? { items, nextCursor } : { items };
}
