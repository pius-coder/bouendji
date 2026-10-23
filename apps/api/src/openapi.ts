import scalar from "@scalar/fastify-api-reference";
import swagger from "@fastify/swagger";
import type { FastifyInstance } from "fastify";
import { env } from "./config.js";

/**
 * Documentation OpenAPI (code-first) + interface de lecture.
 *
 * Choix issu de la comparaison des plugins Fastify : `@fastify/swagger` en mode
 * dynamique lit les schémas déjà attachés aux routes par Fastify, et Scalar
 * remplace Swagger UI pour le rendu. `fastify-openapi-glue` a été écarté : il
 * impose des « service handlers » non standard et remplacerait les routes
 * Fastify existantes ; un middleware OpenAPI en `preHandler` aurait dupliqué la
 * validation zod déjà en place.
 *
 * Le document est aussi servi en JSON sur `/openapi.json` : c'est ce que les
 * générateurs de SDK et la CI peuvent consommer sans navigateur.
 *
 * Rien ici ne décrit une route qui n'existe pas : Fastify n'expose que les
 * routes réellement enregistrées. Une route sans schéma apparaît avec un
 * résumé vide — c'est le signal qu'il reste du travail, pas un mensonge.
 */
export async function registerOpenApi(app: FastifyInstance): Promise<void> {
  await app.register(swagger, {
    openapi: {
      openapi: "3.1.0",
      info: {
        title: "VPN Platform API",
        description:
          "API de la plateforme VPN en marque blanche : appareils, comptes, commandes, " +
          "paiements, abonnements, bundles chiffrés, ingestion d'endpoints, console d'administration.\n\n" +
          "Deux preuves distinctes : la preuve d'appareil signée (`X-Device-*`) pour le mobile, " +
          "et le jeton d'administration (`Authorization: Bearer`, audience `vpn-admin`) plus la clé " +
          "d'accès (`X-Access-Key`) pour la console.",
        version: "1.0.0",
      },
      servers: [{ url: env.publicBaseUrl }],
      tags: [
        { name: "sondes", description: "Liveness et readiness." },
        { name: "appareils", description: "Enrôlement et preuve d'appareil." },
        { name: "comptes", description: "Inscription, connexion, sessions." },
        { name: "catalogue", description: "Forfaits publics par marque." },
        { name: "commandes", description: "Création et suivi des commandes." },
        { name: "paiements", description: "Webhooks fournisseur (revérifiés)." },
        { name: "abonnement", description: "Droits et appareils du compte." },
        { name: "bundle", description: "Liste de configurations scellée." },
        { name: "télémétrie", description: "Rapports de santé et consommation." },
        { name: "ingestion", description: "Enregistrement des nœuds et callbacks CI." },
        { name: "administration", description: "Console : marques, forfaits, argent, nœuds." },
      ],
      components: {
        securitySchemes: {
          deviceProof: {
            type: "apiKey",
            in: "header",
            name: "X-Device-Token",
            description:
              "Jeton d'appareil. À accompagner de `X-Device-Timestamp`, `X-Device-Nonce` et " +
              "`X-Device-Signature` (signature ECDSA sur METHOD\\nPATH\\nsha256(body)\\ntimestamp\\nnonce).",
          },
          bearer: {
            type: "http",
            scheme: "bearer",
            bearerFormat: "JWT",
            description: "Jeton de session (audience `vpn-mobile`) ou d'administration (`vpn-admin`).",
          },
          accessKey: {
            type: "apiKey",
            in: "header",
            name: "X-Access-Key",
            description: "Clé d'accès de la console (D54), exigée sur tout `/v1/admin/*`.",
          },
          ingest: {
            type: "http",
            scheme: "bearer",
            description: "`ENDPOINT_INGEST_SECRET` pour `/v1/internal/*` (hors callback de build).",
          },
        },
      },
    },
  });

  // Document brut, sans interface : consommé par la CI et les générateurs.
  app.get("/openapi.json", { schema: { hide: true } }, async () => app.swagger());

  await app.register(scalar, {
    routePrefix: "/reference",
    configuration: {
      title: "VPN Platform API — référence",
    },
  });
}
