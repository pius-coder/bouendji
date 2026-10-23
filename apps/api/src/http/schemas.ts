/**
 * Fragments JSON Schema partagés par les routes.
 *
 * Fastify ne documente que ce qu'une route déclare dans `schema`. Sans lui,
 * Scalar affiche « No Body » et « Default Response » : le chemin existe, le
 * contrat est absent. Ces fragments donnent la même enveloppe d'erreur et les
 * mêmes réponses à toutes les routes, sans dupliquer trente fois le même objet.
 *
 * Ils sont volontairement en JSON Schema brut, pas en zod : `@fastify/swagger`
 * les publie tels quels, et la validation d'exécution reste celle des schémas
 * zod des handlers. Ce fichier ne valide rien — il documente.
 */

/** Enveloppe d'erreur réelle de l'API (`app.ts`, `setErrorHandler`). */
export const ERROR_ENVELOPE = {
  type: "object",
  /*
   * IMPORTANT : Fastify sérialise à travers ce schéma et **supprime** toute
   * propriété non déclarée. `additionalProperties: true` garantit qu'une
   * réponse ne perd jamais un champ parce que la documentation a pris du retard
   * sur le code. La règle vaut pour tous les schémas de réponse de ce dossier.
   */
  additionalProperties: true,
  required: ["error"],
  properties: {
    error: {
      type: "object",
      additionalProperties: true,
      required: ["code", "message"],
      properties: {
        code: {
          type: "string",
          description:
            "Code stable du contrat (`VALIDATION_FAILED`, `UNAUTHENTICATED`, `DEVICE_PROOF_INVALID`, " +
            "`DEVICE_REVOKED`, `SUBSCRIPTION_REQUIRED`, `CONFLICT`, `RATE_LIMITED`, `INTERNAL`…).",
        },
        message: { type: "string", description: "Message lisible, déjà localisé côté serveur." },
        details: {
          type: "object",
          additionalProperties: { type: "string" },
          description: "Champ fautif → message. Présent sur les erreurs de validation.",
        },
        retryAfter: { type: "integer", description: "Secondes avant nouvelle tentative (429)." },
        requestId: { type: "string", description: "Identifiant de requête, à citer dans un rapport." },
      },
    },
  },
} as const;

/** Réponse d'erreur prête à poser dans `schema.response`. */
export function errorResponse(description: string) {
  return { description, ...ERROR_ENVELOPE };
}

/** Réponse JSON simple : `jsonResponse({ description, ... })`. */
export function jsonResponse(description: string, schema: Record<string, unknown> = {}) {
  return { description, type: "object", additionalProperties: true, ...schema };
}

/** Corps absent (204) : Fastify n'envoie rien. */
export const NO_CONTENT = { description: "Aucun contenu.", type: "null" } as const;

/**
 * Les quatre erreurs qu'une route authentifiée peut renvoyer sans cas
 * particulier. Les routes ajoutent les leurs (402, 409, 422…).
 */
export const COMMON_ERRORS = {
  400: errorResponse("Requête invalide : le champ fautif est nommé dans `details`."),
  401: errorResponse("Preuve d'appareil, jeton ou clé d'accès absent ou invalide."),
  403: errorResponse("Identité valide, droit insuffisant (autre compte, autre communauté, appareil révoqué)."),
  429: errorResponse("Trop de tentatives. `retryAfter` donne le délai en secondes."),
  500: errorResponse("Erreur interne. Citer `requestId` dans un rapport."),
} as const;

/**
 * Sécurité d'une route mobile : jeton **et** preuve d'appareil, pas l'un ou
 * l'autre. En OpenAPI, plusieurs schémas dans le **même** objet = ET logique ;
 * plusieurs objets dans le tableau = OU. Le tableau contient donc un seul objet.
 */
export const DEVICE_SECURITY = [{ bearer: [], deviceProof: [] }] as const;

/** Sécurité de la console : jeton d'administration **et** clé d'accès. */
export const ADMIN_SECURITY = [{ bearer: [], accessKey: [] }] as const;

/** Sécurité de l'ingestion : jeton de conteneur. */
export const INGEST_SECURITY = [{ ingest: [] }] as const;

/** Réponse d'erreur métier fréquente, pour ne pas la réécrire à chaque route. */
export const CONFLICT = errorResponse("Conflit d'état : la ressource a déjà changé (rejeu, doublon, transition invalide).");
export const VALIDATION_422 = errorResponse("Le corps est bien formé mais une règle métier le refuse ; le champ fautif est nommé.");
