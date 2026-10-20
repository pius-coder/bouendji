import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import Fastify, { type FastifyInstance } from "fastify";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { env } from "./config.js";
import type { Database } from "./db.js";
import { rateLimitError } from "./lib/attempts.js";
import { ApiFailure } from "./lib/errors.js";
import { registerAdminRoutes } from "./routes/admin.js";
import { registerAdminAuthRoutes } from "./routes/adminAuth.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerBundleRoutes } from "./routes/bundle.js";
import { registerDeviceRoutes } from "./routes/devices.js";
import { registerInternalRoutes } from "./routes/internal.js";
import { registerMeRoutes } from "./routes/me.js";
import { registerOfflineRoutes } from "./routes/offline.js";
import { registerOrderRoutes } from "./routes/orders.js";
import { registerPaymentRoutes } from "./routes/payments.js";

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
  logger?: boolean;
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

  // The admin SPA is served from this same origin, so CORS only matters for
  // local tooling and the separate dev server.
  await app.register(cors, {
    origin: env.allowedOrigins,
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["content-type", "authorization", "x-device-token", "x-device-timestamp", "x-device-nonce", "x-device-signature"],
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

  // Served here so the dashboard is one URL, no separate hosting, no CORS.
  // The dashboard is a Next.js static export: `out/` is produced by
  // `pnpm --filter @vpn/admin build`, not committed. Without it, `/admin` says
  // so in plain words instead of returning a 404 that looks like a bug.
  const adminRoot = fileURLToPath(new URL("../../admin/out", import.meta.url));
  const adminBuilt = existsSync(join(adminRoot, "index.html"));

  if (adminBuilt) {
    await app.register(fastifyStatic, {
      root: adminRoot,
      prefix: "/admin/",
      index: ["index.html"],
      decorateReply: false,
    });
  } else {
    app.log.warn({ adminRoot }, "dashboard non compilé : lancez pnpm --filter @vpn/admin build");
  }

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
  registerMeRoutes(app, db);
  registerOrderRoutes(app, db);
  registerPaymentRoutes(app, db);
  registerAdminRoutes(app, db);
  registerAdminAuthRoutes(app, db);
  registerOfflineRoutes(app, db);

  if (!adminBuilt) {
    // Sans export Next, `/admin/` ne doit pas ressembler à une route oubliée :
    // c'est une étape de build manquante, et le message le dit.
    app.get("/admin/", async (_req, reply) =>
      reply
        .code(503)
        .type("text/html; charset=utf-8")
        .send(
          "<!doctype html><meta charset=utf-8><title>Dashboard non compilé</title>" +
            "<body style=\"font:16px/1.6 system-ui;max-width:40rem;margin:10vh auto;padding:0 1.5rem\">" +
            "<h1>Dashboard non compilé</h1>" +
            "<p>L'API tourne, mais l'export statique du dashboard est absent.</p>" +
            "<pre>pnpm --filter @vpn/admin build</pre>" +
            "<p>Le résultat est écrit dans <code>apps/admin/out</code>, servi ici sous <code>/admin/</code>.</p>",
        ),
    );
  }

  // `/admin` without the trailing slash would 404 on a static prefix.
  app.get("/admin", async (_req, reply) => reply.redirect("/admin/", 302));

  return app;
}

