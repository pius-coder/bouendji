import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { timingSafeEqual } from "node:crypto";
import Fastify, { type FastifyInstance, type FastifyServerOptions } from "fastify";
import { env } from "./config.js";
import type { Database } from "./db.js";
import { rateLimitError } from "./lib/attempts.js";
import { registerDecoyGuard } from "./lib/decoy.js";
import { ApiFailure } from "./lib/errors.js";
import { passwordChangeExempt, passwordChangeRequired, requireAdmin } from "./lib/auth.js";
import { registerOpenApi, registerOpenApiReference } from "./openapi.js";
import { registerAdminRoutes } from "./routes/admin.js";
import { registerAdminAccountRoutes } from "./routes/adminAccount.js";
import { registerAdminAuthRoutes } from "./routes/adminAuth.js";
import { registerAdminOnboardingRoutes } from "./routes/adminOnboarding.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerBuildRoutes } from "./routes/builds.js";
import { registerBundleRoutes } from "./routes/bundle.js";
import { registerCatalogRoutes } from "./routes/catalog.js";
import { registerDeviceRoutes } from "./routes/devices.js";
import { registerInternalRoutes } from "./routes/internal.js";
import { registerMeRoutes } from "./routes/me.js";
import { registerAccountRoutes } from "./routes/account.js";
import { registerOfflineRoutes } from "./routes/offline.js";
import { registerOrderRoutes } from "./routes/orders.js";
import { registerPaymentRoutes } from "./routes/payments.js";
import { registerTelemetryRoutes } from "./routes/telemetry.js";
import { registerPricingRoutes } from "./routes/pricing.js";

declare module "fastify" {
  interface FastifyRequest {
    /**
     * Exact bytes received for a JSON body. Device request signatures cover the
     * raw payload (see lib/auth.ts `verifyDeviceProof`), so they cannot be
     * recomputed from a re-serialised object: key order and whitespace differ.
     */
    rawBody?: string;
  }
}

export interface AppOptions {
  db: Database;
  /** `true`/`false`, or a pino options object. Off by default so tests stay quiet. */
  logger?: FastifyServerOptions["logger"];
  bodyLimit?: number;
}

export async function buildApp(options: AppOptions): Promise<FastifyInstance> {
  const { db, logger = false, bodyLimit = 512 * 1024 } = options;

  const app = Fastify({
    logger,
    bodyLimit,
    // Cloud Run terminates TLS and forwards X-Forwarded-*; logs and rate limits
    // are useless without the real client address.
    trustProxy: true,
  });

  /* -------------------------------------------------------------- parsing */

  app.addContentTypeParser("application/json", { parseAs: "buffer" }, (req, body, done) => {
    const raw = Buffer.isBuffer(body) ? body : Buffer.from(String(body ?? ""), "utf8");
    req.rawBody = raw.toString("utf8");
    if (req.rawBody.length === 0) {
      // Routes validate their own body; an empty body is `{}`, not a crash.
      done(null, {});
      return;
    }
    try {
      done(null, JSON.parse(req.rawBody));
    } catch {
      done(new ApiFailure(400, "VALIDATION_FAILED", "Corps JSON invalide."), undefined);
    }
  });

  /* --------------------------------------------------------------- errors */

  app.setErrorHandler((error: Error & { statusCode?: number }, req, reply) => {
    if (error instanceof ApiFailure) {
      if (error.retryAfter !== undefined) reply.header("retry-after", String(error.retryAfter));
      reply.code(error.status).send({
        error: {
          code: error.code,
          message: error.message,
          ...(error.details ? { details: error.details } : {}),
          ...(error.retryAfter !== undefined ? { retryAfter: error.retryAfter } : {}),
          requestId: req.id,
        },
      });
      return;
    }

    const status = typeof error.statusCode === "number" ? error.statusCode : 500;
    if (status >= 400 && status < 500) {
      // Fastify's own refusals (body too large, unsupported media type...).
      reply.code(status).send({
        error: { code: "VALIDATION_FAILED", message: error.message, requestId: req.id },
      });
      return;
    }

    req.log.error({ err: error }, "unhandled request error");
    reply.code(500).send({
      error: { code: "INTERNAL", message: "Erreur interne.", requestId: req.id },
    });
  });

  app.setNotFoundHandler((req, reply) => {
    reply.code(404).send({
      error: { code: "NOT_FOUND", message: "Route inconnue.", requestId: req.id },
    });
  });

  /* -------------------------------------------------------------- plugins */

  // Le dashboard vit sur Vercel (D32) : l'API est désormais appelée en
  // cross-origin par le navigateur. `ALLOWED_ORIGINS` doit donc lister l'origine
  // Vercel, sinon la console sera bloquée par le navigateur — pas par l'API.
  // `credentials: false` reste : les jetons voyagent en en-tête Authorization,
  // jamais en cookie, donc aucune origine n'a besoin d'être « de confiance »
  // pour lire une session.
  await app.register(cors, {
    origin: env.allowedOrigins,
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "content-type",
      "authorization",
      "if-none-match",
      // Console (D54) et ingestion (D56) : sans ces deux en-têtes dans la
      // liste, le navigateur bloque la requête avant que l'API la voie.
      "x-access-key",
      "x-health-check-key",
      "x-ingest-timestamp",
      "x-device-token",
      "x-device-timestamp",
      "x-device-nonce",
      "x-device-signature",
    ],
    maxAge: 600,
    credentials: false,
  });

  // A blunt ceiling, not a security control: it stops a broken client from
  // exhausting the database. Tight per-route budgets live where they belong
  // (routes/auth.ts for credentials, routes/bundle.ts for the sealed pull).
  //
  // One deliberate hole: the payment webhook has **no** limit. A provider that
  // replays a delivery must always get through — the handler is idempotent and
  // re-verifies the transaction with the provider API (D14), so throttling it
  // would only turn a retry into a lost payment. The existing webhook event log
  // (webhook_events) stays the record of what arrived.
  await app.register(rateLimit, {
    max: 300,
    timeWindow: "1 minute",
    allowList: (req: { url: string }) =>
      req.url === "/healthz" ||
      req.url === "/readyz" ||
      req.url.startsWith("/v1/payments/webhook/"),
    errorResponseBuilder: rateLimitError,
  });

  // Rideau anti-curieux (couche Fastify, doublon de middleware.ts Edge).
  // Navigateur sans X-App-Id → 302 vers DECOY_URL. Bypass : sondes + webhook.
  await registerDecoyGuard(app);

  // Doit précéder l'enregistrement des routes : en mode dynamique, @fastify/swagger
  // lit les schémas au moment où chaque route est déclarée.
  await registerOpenApi(app);

  /* --------------------------------------------------- frontières d'accès */

  /*
   * D54 — la clé de console protège **toutes** les routes `/v1/admin`, login et
   * inscription compris. Un export statique ne protège pas ses octets ; ce qui
   * doit être protégé, ce sont les données et la création de comptes.
   *
   * Une clé vide est tolérée en développement uniquement : le garde-fou de
   * `config.ts` refuse de démarrer en production sans elle.
   */
  const expectedAccessKey = env.admin.accessKey;
  app.addHook("preHandler", async (req) => {
    const routePath = req.routeOptions.url;
    if (routePath === "/healthz" || routePath === "/readyz") {
      const expected = env.health.checkKey;
      const provided = String(req.headers["x-health-check-key"] ?? "");
      if (!expected) {
        throw new ApiFailure(503, "INTERNAL", "Clé de sonde non configurée.");
      }
      const a = Buffer.from(provided, "utf8");
      const b = Buffer.from(expected, "utf8");
      if (a.length !== b.length || !timingSafeEqual(a, b)) {
        throw new ApiFailure(401, "UNAUTHENTICATED", "Clé de sonde requise.");
      }
    }

    if (req.url.startsWith("/v1/admin") && expectedAccessKey.length > 0) {
      const provided = String(req.headers["x-access-key"] ?? "");
      const a = Buffer.from(provided, "utf8");
      const b = Buffer.from(expectedAccessKey, "utf8");
      if (a.length !== b.length || !timingSafeEqual(a, b)) {
        throw new ApiFailure(401, "UNAUTHENTICATED", "Clé d'accès requise.");
      }
    }

    /*
     * Changement de mot de passe obligatoire : tant que `must_change_password`
     * est vrai, toute route d'administration hors compte et authentification
     * répond 403 PASSWORD_CHANGE_REQUIRED. Une seule garde, pas une par route.
     */
    if (req.url.startsWith("/v1/admin")) {
      const path = req.url.split("?")[0] ?? req.url;
      if (!passwordChangeExempt(path)) {
        const admin = await requireAdmin(db, req);
        if (admin.mustChangePassword) throw passwordChangeRequired();
      }
    }

    /*
     * D56 — l'ingestion porte un horodatage pour qu'une requête capturée ne
     * reste pas éternellement rejouable. Le callback de build a son **propre**
     * secret (D66) et ne passe donc pas par cette vérification.
     *
     * Les tests ne l'envoient pas : leur jeton d'ingestion est déjà la
     * frontière, et exiger l'en-tête n'y prouverait rien de plus. En
     * développement et en production, il est exigé.
     */
    if (!env.isTest && req.url.startsWith("/v1/internal") && !req.url.startsWith("/v1/internal/builds/")) {
      const raw = String(req.headers["x-ingest-timestamp"] ?? "");
      const timestamp = Number(raw);
      const skew = Math.abs(Date.now() / 1000 - timestamp);
      if (!raw || !Number.isFinite(timestamp) || skew > env.ingest.maxSkewSeconds) {
        throw new ApiFailure(401, "UNAUTHENTICATED", "Horodatage d'ingestion absent ou périmé.");
      }
    }
  });

  /*
   * D51 — entretien paresseux. Vercel ne garde aucun processus : un hook borné
   * à une exécution par minute et par instance remplace le tick de 60 s.
   *
   * Les trois requêtes sont idempotentes. Une erreur est avalée : l'entretien ne
   * doit jamais transformer une requête métier en 500.
   */
  let lastMaintenanceAt = 0;
  app.addHook("onRequest", async (req) => {
    if (req.url === "/healthz" || req.url === "/readyz") return;
    const now = Date.now();
    if (now - lastMaintenanceAt < 60_000) return;
    lastMaintenanceAt = now;
    try {
      // Probation : un nœud « down » redevient candidat après 30 min (D50).
      await db.query(
        `UPDATE endpoints
            SET health = 'unknown', down_since = NULL, down_reason = NULL, updated_at = now()
          WHERE health = 'down' AND down_since < now() - interval '30 minutes'`,
      );
      // Expiration constatée : la lecture filtre déjà, ceci garde la console honnête.
      await db.query(
        `UPDATE endpoints
            SET status = 'expired', updated_at = now()
          WHERE status IN ('active', 'draining') AND expires_at <= now()`,
      );
      // Un versement ambigu ne reste pas ambigu (D65).
      await db.query(
        `UPDATE payouts
            SET status = 'needs_review'
          WHERE status = 'processing' AND provider_ref IS NULL
            AND claimed_at < now() - interval '10 minutes'`,
      );
    } catch {
      // Volontairement silencieux : voir le commentaire ci-dessus.
    }
  });

  // Le dashboard n'est plus servi par l'API : il vit sur Vercel (D32). Garder
  // ici une copie statique créait deux origines pour la même console, et deux
  // façons de la déployer. C'est un seul endroit : Vercel.
  //
  // L'API reste l'unique origine des données ; le navigateur l'appelle en
  // cross-origin, donc CORS est configuré plus haut à partir de
  // `env.allowedOrigins`.

  /* --------------------------------------------------------------- probes */

  // Liveness: answers without touching the database, so a DB blip does not
  // make Cloud Run restart healthy instances.
  app.get("/healthz", async () => ({ status: "ok", uptime: Math.round(process.uptime()) }));

  // Readiness: the instance can only serve if it can reach the database.
  app.get("/readyz", async (_req, reply) => {
    try {
      await db.scalar("SELECT 1");
      return { status: "ready" };
    } catch {
      return reply.code(503).send({ status: "unavailable", database: "down" });
    }
  });

  registerInternalRoutes(app, db);
  registerAuthRoutes(app, db);
  registerDeviceRoutes(app, db);
  registerBundleRoutes(app, db);
  registerCatalogRoutes(app, db);
  registerMeRoutes(app, db);
  registerAccountRoutes(app, db);
  registerTelemetryRoutes(app, db);
  registerOrderRoutes(app, db);
  registerPricingRoutes(app, db);
  registerPaymentRoutes(app, db);
  registerAdminRoutes(app, db);
  registerAdminAuthRoutes(app, db);
  registerAdminAccountRoutes(app, db);
  registerAdminOnboardingRoutes(app, db);
  registerBuildRoutes(app, db);
  registerOfflineRoutes(app, db);
  await registerOpenApiReference(app);

  return app;
}

