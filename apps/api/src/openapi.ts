import scalar from "@scalar/fastify-api-reference";
import swagger from "@fastify/swagger";
import type { FastifyInstance, FastifySchema } from "fastify";
import { env } from "./config.js";
import { docFor, ROUTE_DOCS } from "./http/contracts.js";

/**
 * Dynamic Swagger transform enriches only the generated OpenAPI document.
 * The RouteDoc table is deliberately not installed on Fastify routes, so its
 * request/response schemas never become runtime validators or serializers.
 */
function documentationTransform({ schema, url, route }: { schema: FastifySchema; url: string; route: { method: string | string[] } }) {
  const methods = Array.isArray(route.method) ? route.method : route.method.split(",");
  const doc = methods.map((method) => docFor(method.trim(), url) ?? docFor(method.trim(), url.replace(/\{([^}]+)\}/g, ":$1"))).find(Boolean);
  if (!doc) return { schema, url };

  const { summary, description, tags, security, body, params, querystring, headers, response } = doc;
  const enriched: FastifySchema = {
    ...schema,
    summary,
    ...(description ? { description } : {}),
    ...(tags ? { tags } : {}),
    ...(security ? { security } : {}),
    ...(body ? { body } : {}),
    ...(params ? { params } : {}),
    ...(querystring ? { querystring } : {}),
    ...(headers ? { headers } : {}),
    ...(response ? { response } : {}),
  };
  return { schema: enriched, url };
}

/** Apply non-JSON media types after Swagger has assembled the OpenAPI document. */
export function finalizeOpenApi(document: unknown): unknown {
  const spec = document as { paths?: Record<string, Record<string, { responses?: Record<string, unknown> }>> };
  for (const [key, contract] of Object.entries(ROUTE_DOCS)) {
    const [method, route] = key.split(" ", 2);
    if (!method || !route) continue;
    const path = route.replace(/:([^/]+)/g, "{$1}");
    const operation = spec.paths?.[path]?.[method.toLowerCase()];
    if (!operation?.responses || !contract.response) continue;
    for (const [status, definition] of Object.entries(contract.response)) {
      const mediaType = definition.contentType;
      if (typeof mediaType !== "string") continue;
      operation.responses[status] = {
        description: definition.description ?? "Réponse HTML.",
        content: { [mediaType]: { schema: { type: "string", description: definition.description } } },
      };
    }
  }
  return document;
}

export async function registerOpenApi(app: FastifyInstance): Promise<void> {
  await app.register(swagger, {
    mode: "dynamic",
    transform: documentationTransform,
    openapi: {
      openapi: "3.1.0",
      info: {
        title: "VPN Platform API",
        description:
          "API de la plateforme VPN en marque blanche : appareils, comptes, commandes, paiements, abonnements, bundles chiffrés, ingestion d'endpoints et console d'administration.\n\n" +
          "Transport HTTP avec corps JSON UTF-8 ; utilisez HTTPS hors environnement local. Les dates sont au format ISO 8601/RFC 3339, les montants en XAF. Les réponses utilisent les codes HTTP standards.\n\n" +
          "Les appels mobiles utilisent une preuve d'appareil signée (`X-Device-*`) ou un jeton de session selon la route. La console exige un jeton Bearer d'audience `vpn-admin` et la clé `X-Access-Key`.",
        version: "1.0.0",
      },
      servers: [{ url: env.publicBaseUrl }],
      tags: [
        { name: "sondes", description: "Liveness et readiness du service." },
        { name: "appareils", description: "Challenges, enrôlement et preuve cryptographique des installations." },
        { name: "comptes", description: "Création de compte, authentification et gestion des sessions." },
        { name: "catalogue", description: "Forfaits publics et offres disponibles par marque." },
        { name: "commandes", description: "Création et consultation des commandes de forfaits." },
        { name: "paiements", description: "Checkout, notifications fournisseur et réconciliation des paiements." },
        { name: "abonnement", description: "Profil, droits, appareils et consommation du compte connecté." },
        { name: "bundle", description: "Distribution et consommation de configurations chiffrées." },
        { name: "télémétrie", description: "Rapports agrégés de santé et de consommation." },
        { name: "ingestion", description: "Enregistrement, santé et callbacks des nœuds et de la CI." },
        { name: "administration", description: "Console de gestion des marques, forfaits, paiements et nœuds." },
      ],
      components: {
        securitySchemes: {
          deviceProof: {
            type: "apiKey", in: "header", name: "X-Device-Token",
            description: "Jeton d'appareil accompagné de `X-Device-Timestamp`, `X-Device-Nonce` et `X-Device-Signature`. La signature ECDSA P-256 couvre METHOD, PATH, SHA-256 du corps brut, timestamp et nonce, séparés par des retours à la ligne.",
          },
          enrollmentProof: {
            type: "apiKey", in: "header", name: "X-Device-Signature",
            description: "Signature ECDSA P-256 de l'enrôlement, avec `X-Device-Timestamp` et `X-Device-Nonce`. Aucun jeton appareil n'existe avant l'enrôlement.",
          },
          bearer: { type: "http", scheme: "bearer", bearerFormat: "JWT", description: "Jeton de session mobile (`vpn-mobile`) ou d'administration (`vpn-admin`), selon la route." },
          accessKey: { type: "apiKey", in: "header", name: "X-Access-Key", description: "Clé d'accès de la console, exigée sur les routes `/v1/admin/*`." },
          healthCheck: { type: "apiKey", in: "header", name: "X-Health-Check-Key", description: "Secret `HEALTHCHECK_KEY`, réservé aux sondes d'exploitation `/healthz` et `/readyz`. Ne pas intégrer dans un client public." },
          webhookSecret: { type: "apiKey", in: "header", name: "X-Webhook-Secret", description: "Secret `FAPSHI_WEBHOOK_SECRET` partagé avec le fournisseur ; obligatoire en production." },
          ingest: { type: "http", scheme: "bearer", description: "Secret `ENDPOINT_INGEST_SECRET` pour l'ingestion interne." },
          buildCallback: { type: "http", scheme: "bearer", description: "Secret `BUILD_CALLBACK_SECRET`, distinct du secret d'ingestion, pour les callbacks CI." },
        },
      },
    },
  });

  // Document brut consommé par Scalar, la CI et les générateurs de SDK.
  app.get("/openapi.json", { schema: { hide: true } }, async () => finalizeOpenApi(app.swagger()));
}

/** Register Scalar after the API routes have been registered. */
export async function registerOpenApiReference(app: FastifyInstance): Promise<void> {
  await app.register(scalar, {
    routePrefix: "/reference",
    configuration: { title: "VPN Platform API — référence", url: "/openapi.json" },
  });
}
