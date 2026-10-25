import "server-only";

/**
 * Erreur typée de l'API. Les codes de l'API (`VALIDATION_FAILED`,
 * `UNAUTHENTICATED`, `CONFLICT`, `RATE_LIMITED`, `INTERNAL`...) sont conservés
 * tels quels ; trois codes sont ajoutés côté dashboard quand il n'y a pas de
 * réponse exploitable : `UNREACHABLE`, `TIMEOUT`, `BAD_RESPONSE`.
 */
export interface ApiErrorInit {
  status: number;
  code: string;
  message: string;
  details?: Record<string, string>;
  retryAfter?: number;
  requestId?: string;
}

/** Forme sérialisable d'un échec : seule forme qui franchit la frontière client. */
export interface ActionFailure {
  ok: false;
  code: string;
  message: string;
  details?: Record<string, string>;
  retryAfter?: number;
  requestId?: string;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: Record<string, string>;
  readonly retryAfter?: number;
  readonly requestId?: string;

  constructor(init: ApiErrorInit) {
    super(init.message);
    this.name = "ApiError";
    this.status = init.status;
    this.code = init.code;
    this.details = init.details;
    this.retryAfter = init.retryAfter;
    this.requestId = init.requestId;
  }

  get isUnauthenticated(): boolean {
    return this.status === 401;
  }
  get isForbidden(): boolean {
    return this.status === 403;
  }
  get isRateLimited(): boolean {
    return this.status === 429;
  }

  toResult(): ActionFailure {
    return {
      ok: false,
      code: this.code,
      message: this.message,
      ...(this.details ? { details: this.details } : {}),
      ...(this.retryAfter !== undefined ? { retryAfter: this.retryAfter } : {}),
      ...(this.requestId ? { requestId: this.requestId } : {}),
    };
  }
}

export function isApiError(value: unknown): value is ApiError {
  return value instanceof ApiError;
}

/**
 * Lit l'enveloppe d'erreur. Forme réelle de l'API : `{ error: { code, message,
 * details?, retryAfter?, requestId? } }` (`apps/api/src/http/schemas.ts`). La
 * forme plate `{ code, message }` est aussi acceptée.
 */
export function parseErrorEnvelope(status: number, body: unknown, retryAfterHeader: string | null): ApiError {
  const root = isRecord(body) ? body : {};
  const inner = isRecord(root.error) ? root.error : root;
  const code = typeof inner.code === "string" ? inner.code : status >= 500 ? "INTERNAL" : "HTTP_ERROR";
  const message =
    typeof inner.message === "string" && inner.message
      ? inner.message
      : `Réponse inattendue de l'API (${status}).`;

  const details = isRecord(inner.details) ? stringRecord(inner.details) : undefined;
  const headerRetry = retryAfterHeader && /^\d+$/.test(retryAfterHeader) ? Number(retryAfterHeader) : undefined;
  const retryAfter = typeof inner.retryAfter === "number" ? inner.retryAfter : headerRetry;

  return new ApiError({
    status,
    code,
    message,
    details,
    retryAfter,
    requestId: typeof inner.requestId === "string" ? inner.requestId : undefined,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringRecord(value: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) out[key] = String(entry);
  return out;
}
