import { timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { env } from "../config.js";
import type { Database } from "../db.js";
import { ApiFailure, fail } from "../lib/errors.js";
import type { EndpointRow } from "../services/endpoints.js";
import { heartbeat, listPool, markReady, poolRevision, registerEndpoint } from "../services/endpoints.js";

/**
 * Ingestion surface. Only endpoint containers call these routes; they are never
 * reachable from the app. The bearer token is the whole trust boundary: a forged
 * endpoint is traffic redirection, so an empty secret refuses service (503)
 * instead of leaving the door open.
 */

const PREFIX = "/v1/internal";

/* ------------------------------------------------------------------- auth */

/**
 * Constant-time bearer check. Lengths are compared first because
 * timingSafeEqual throws on buffers of different sizes; the dummy comparison
 * keeps the rejecting branch as costly as the accepting one on length alone.
 */
function sameSecret(provided: string, expected: string): boolean {
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) {
    timingSafeEqual(b, b);
    return false;
  }
  return timingSafeEqual(a, b);
}

/**
 * MUST stay async: Fastify only continues the request lifecycle when a hook
 * returns a promise (or calls `done`). A sync hook returning void parks the
 * request forever (see fastify/lib/hooks.js, `hookRunner`).
 *
 * The secret is read at request time, not at boot, so an empty value turns the
 * ingestion off rather than leaving it open.
 */
async function requireIngestSecret(req: FastifyRequest): Promise<void> {
  const expected = env.ingest.secret;
  if (expected.length === 0) {
    throw new ApiFailure(503, "INTERNAL", "Ingestion des endpoints non configurée (ENDPOINT_INGEST_SECRET).");
  }
  const header = req.headers.authorization;
  const provided = header?.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!provided) throw fail.unauthenticated("Jeton d'ingestion manquant.");
  if (!sameSecret(provided, expected)) throw fail.unauthenticated("Jeton d'ingestion invalide.");
}

/* -------------------------------------------------------------- validation */

function parseBody<T extends z.ZodTypeAny>(schema: T, body: unknown): z.infer<T> {
  const result = schema.safeParse(body ?? {});
  if (result.success) return result.data;
  const details: Record<string, string> = {};
  for (const issue of result.error.issues) {
    details[issue.path.join(".") || "_"] = issue.message;
  }
  throw fail.validation(details);
}

/**
 * The WebSocket path is deliberately absent from the schema: it is generated
 * server-side, so a deployment cannot claim a path the front proxy would not
 * route (knowledge/20-backend/api-routes.md, "Pièges").
 */
const registerSchema = z.object({
  deployment_key: z.string().trim().min(3).max(190),
  public_host: z.string().trim().min(1).max(253),
  port: z.number().int().min(1).max(65_535).optional(),
  /** A hostname only: the service never accepts a scheme or a path here. */
  sni: z
    .string()
    .trim()
    .max(253)
    .refine((value) => /^[a-z0-9]([a-z0-9.-]{0,251}[a-z0-9])?$/i.test(value), "SNI invalide : nom d'hôte attendu.")
    .nullish(),
  region: z.string().trim().max(24).optional(),
  label: z.string().trim().min(2).max(64).optional(),
  capacity: z.number().int().min(1).max(10_000).optional(),
  /** Clamped server-side to ENDPOINT_MIN_TTL / ENDPOINT_MAX_TTL by the service. */
  ttl_seconds: z.number().int().min(1).optional(),
  agent_version: z.string().trim().max(64).nullish(),
});

const keySchema = z.object({
  deployment_key: z.string().trim().min(3).max(190),
});

const heartbeatSchema = keySchema.extend({
  latency_ms: z.number().int().min(0).max(600_000).nullish(),
  /** true -> healthy, false -> degraded, omitted -> no opinion. */
  healthy: z.boolean().nullish(),
  agent_version: z.string().trim().max(64).nullish(),
});

/* ---------------------------------------------------------------- handlers */

/** Diagnostic view: the sealed credential never leaves the database. */
function diagRow(row: EndpointRow) {
  return {
    endpoint_id: row.id,
    host: row.host,
    port: row.port,
    status: row.status,
    health: row.health,
    region: row.region,
    capacity: row.capacity,
    in_use: row.in_use,
    latency_ms: row.latency_ms,
    agent_version: row.agent_version,
    last_seen_at: row.last_seen_at,
    expires_at: row.expires_at,
    created_at: row.created_at,
  };
}

export function registerInternalRoutes(app: FastifyInstance, db: Database): void {
  app.post(`${PREFIX}/endpoints/register`, { preHandler: requireIngestSecret }, async (req) => {
    const input = parseBody(registerSchema, req.body);
    const endpoint = await registerEndpoint(db, {
      deploymentKey: input.deployment_key,
      label: input.label ?? input.public_host,
      host: input.public_host,
      port: input.port,
      sni: input.sni ?? input.public_host,
      region: input.region,
      capacity: input.capacity,
      ttlSeconds: input.ttl_seconds,
      agentVersion: input.agent_version ?? null,
    });

    // 200 on both paths: a restart reuses an existing resource, it is not a new one.
    return {
      endpoint_id: endpoint.id,
      uuid: endpoint.credential,
      ws_path: endpoint.wsPath,
      expires_at: endpoint.expiresAt,
      status: endpoint.status,
      pool_revision: endpoint.poolRevision,
    };
  });

  app.post(`${PREFIX}/endpoints/ready`, { preHandler: requireIngestSecret }, async (req) => {
    const input = parseBody(keySchema, req.body);
    const result = await markReady(db, input.deployment_key);
    return { status: result.status, pool_revision: result.poolRevision };
  });

  app.post(`${PREFIX}/endpoints/heartbeat`, { preHandler: requireIngestSecret }, async (req) => {
    const input = parseBody(heartbeatSchema, req.body);
    const result = await heartbeat(db, input.deployment_key, {
      latencyMs: input.latency_ms ?? null,
      health: input.healthy === true ? "healthy" : input.healthy === false ? "degraded" : null,
      agentVersion: input.agent_version ?? null,
    });
    return { status: result.status, expires_at: result.expiresAt };
  });

  app.get(`${PREFIX}/pool`, { preHandler: requireIngestSecret }, async () => {
    const rows = await listPool(db);
    return {
      pool_revision: await poolRevision(db),
      count: rows.length,
      endpoints: rows.map(diagRow),
    };
  });
}
