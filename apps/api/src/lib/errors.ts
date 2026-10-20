import type { ApiErrorCode } from "@vpn/contract";

export class ApiFailure extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly details?: Record<string, string>;
  readonly retryAfter?: number;

  constructor(status: number, code: ApiErrorCode, message: string, details?: Record<string, string>, retryAfter?: number) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
    this.retryAfter = retryAfter;
  }
}

export const fail = {
  validation: (details?: Record<string, string>) =>
    new ApiFailure(400, "VALIDATION_FAILED", "La requête est invalide.", details),
  unauthenticated: (message = "Authentification requise.") => new ApiFailure(401, "UNAUTHENTICATED", message),
  invalidCredentials: () => new ApiFailure(401, "INVALID_CREDENTIALS", "Email ou mot de passe incorrect."),
  deviceProof: (message = "Preuve de l'appareil invalide.") => new ApiFailure(401, "DEVICE_PROOF_INVALID", message),
  deviceRevoked: () => new ApiFailure(403, "DEVICE_REVOKED", "Cet appareil a été révoqué."),
  forbidden: (message = "Accès refusé.") => new ApiFailure(403, "FORBIDDEN", message),
  notFound: (message = "Introuvable.") => new ApiFailure(404, "NOT_FOUND", message),
  conflict: (message: string) => new ApiFailure(409, "CONFLICT", message),
  deviceLimit: (message = "Limite d'appareils atteinte.") => new ApiFailure(409, "DEVICE_LIMIT_REACHED", message),
  subscriptionRequired: () => new ApiFailure(402, "SUBSCRIPTION_REQUIRED", "Un abonnement actif est requis."),
  orderNotPayable: (message: string) => new ApiFailure(409, "ORDER_NOT_PAYABLE", message),
  emailNotVerified: () => new ApiFailure(403, "EMAIL_NOT_VERIFIED", "Confirmez votre adresse email."),
  paymentProvider: (message = "Le paiement est momentanément indisponible.") =>
    new ApiFailure(502, "PAYMENT_PROVIDER_ERROR", message),
  /**
   * 429. `retryAfter` is in seconds and is copied both into the body and into
   * the `retry-after` header by app.ts's error handler.
   */
  rateLimited: (retryAfterSeconds: number, message = "Trop de tentatives. Réessayez plus tard.") =>
    new ApiFailure(429, "RATE_LIMITED", message, undefined, Math.max(1, Math.ceil(retryAfterSeconds))),
};
