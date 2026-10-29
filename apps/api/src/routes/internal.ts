import { timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { env } from "../config.js";
import type { Database } from "../db.js";
import { ApiFailure, fail } from "../lib/errors.js";
import type { EndpointRow, EndpointTier } from "../services/endpoints.js";
import { bumpPoolRevision, CLIENT_POOL_SIZE, heartbeat, listPool, markReady, poolRevision, registerEndpoint, syncFrontSiblings } from "../services/endpoints.js";
import { attachNodeToSlot, bindNightSlot, nightSlotForKey } from "../services/poolWatch.js";
import { nodeNameFor } from "../lib/names.js";

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
/**
 * Créneau de nuit dont la clé a authentifié la requête (D124). `null` : le
 * secret global a servi (nœuds jour, tests, opérations).
 */
export interface IngestSlot {
  id: string;
  bound_deployment_key: string | null;
}

declare module "fastify" {
  interface FastifyRequest {
    ingestSlot?: IngestSlot | null;
  }
}

/**
 * Deux façons de s'authentifier, sur le même en-tête Bearer :
 *  1. une clé de créneau de nuit, à usage unique (D124), valable jusqu'à la fin
 *     du créneau. Le membre Réseau ne voit jamais le secret global ;
 *  2. le secret global `ENDPOINT_INGEST_SECRET`, toujours accepté.
 *
 * `globalOnly` ferme la première voie (lecture du pool). Le secret global vide
 * éteint la seconde, comme avant : 503, jamais une porte ouverte.
 *
 * MUST stay async: Fastify continues the lifecycle only when the hook returns a
 * promise (a sync hook returning void parks the request forever).
 */
function ingestAuth(db: Database, options: { globalOnly?: boolean } = {}) {
  return async (req: FastifyRequest): Promise<void> => {
    const header = req.headers.authorization;
    const provided = header?.startsWith("Bearer ") ? header.slice(7).trim() : "";

    if (!options.globalOnly && provided) {
      let slot: IngestSlot | null = null;
      try {
        slot = await nightSlotForKey(db, provided, new Date());
      } catch (err) {
        // Base sans la migration 080 (ex. jeux de tests du socle) : pas de créneaux,
        // donc seul le secret global peut authentifier. Toute autre erreur remonte.
        if (!(typeof err === "object" && err !== null && (err as { code?: string }).code === "42P01")) throw err;
      }
      if (slot) {
        req.ingestSlot = slot;
        return;
      }
    }

    const expected = env.ingest.secret;
    if (expected.length === 0) {
      throw new ApiFailure(503, "INTERNAL", "Ingestion des endpoints non configurée (ENDPOINT_INGEST_SECRET).");
    }
    if (!provided) throw fail.unauthenticated("Jeton d'ingestion manquant.");
    if (!sameSecret(provided, expected)) throw fail.unauthenticated("Jeton d'ingestion invalide.");
    req.ingestSlot = null;
  };
}

/**
 * Une clé de créneau n'authentifie que le déploiement qui l'a liée. Un nœud
 * qui présente une autre `deployment_key` est refusé sur `ready` et `heartbeat`.
 */
function assertSlotBinding(req: FastifyRequest, deploymentKey: string): void {
  const slot = req.ingestSlot;
  if (slot && slot.bound_deployment_key !== deploymentKey) {
    throw fail.unauthenticated("Clé de créneau non liée à ce déploiement.");
  }
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
 *
 * `tier` et `identity_mode` sont ici, et pas seulement dans le service (D68) :
 * `z.object` supprime les clés inconnues, donc un `tier` absent du schéma est
 * jeté avant `registerEndpoint`, qui retombe sur `free-labs`. C'est exactement
 * le défaut que D45 devait fermer.
 */
const tierSchema = z.enum(["free-labs", "paid-gcp"]);
const identityModeSchema = z.enum(["shared", "per_device"]);

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
  /** D45/D68 : nature du nœud. Absent = `free-labs`, jamais autre chose. */
  tier: tierSchema.optional(),
  /** D68/D69 : `per_device` fait renvoyer un pool de 200 UUID à l'enregistrement. */
  identity_mode: identityModeSchema.optional(),
  /**
   * D93 : sorties de domain fronting du même nœud (IP du frontal + SNI). Le
   * Host reste `public_host`. Absent = aucune sœur (les anciennes sont retirées).
   */
  front: z
    .object({
      address: z
        .string()
        .trim()
        .max(253)
        .refine((value) => /^[a-z0-9]([a-z0-9.-]{0,251}[a-z0-9])?$/i.test(value), "Adresse de frontal invalide."),
      snis: z
        .array(z.string().trim().refine((value) => /^[a-z0-9]([a-z0-9.-]{0,251}[a-z0-9])?$/i.test(value), "SNI invalide."))
        .min(1)
        .max(12),
    })
    .optional(),
});

const keySchema = z.object({
  deployment_key: z.string().trim().min(3).max(190),
  /**
   * Accepté par `ready` et `heartbeat` pour que le conteneur puisse envoyer la
   * même enveloppe partout ; il est **ignoré** s'il ne correspond pas à la
   * ligne : un redémarrage sans `ENDPOINT_TIER` ne retière pas un nœud (D68).
   */
  tier: tierSchema.optional(),
  identity_mode: identityModeSchema.optional(),
});

/** Une ligne de consommation mesurée par le nœud payant (D69). */
const nodeUsageSchema = z.object({
  uuid: z.string().trim().min(1).max(64),
  bytesUp: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  bytesDown: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
});

const heartbeatSchema = keySchema.extend({
  latency_ms: z.number().int().min(0).max(600_000).nullish(),
  /** true -> healthy, false -> degraded, omitted -> no opinion. Never lifts a `down` (D47). */
  healthy: z.boolean().nullish(),
  agent_version: z.string().trim().max(64).nullish(),
  /**
   * Compteurs lus dans Xray (`xray api statsquery --pattern "user>>>"`), un
   * `uuid` par client du pool. Optionnel : un nœud `shared` n'a rien à mesurer.
   */
  usage: z.array(nodeUsageSchema).max(CLIENT_POOL_SIZE * 2).optional(),
});

/* ---------------------------------------------------------------- handlers */

/** Diagnostic view: the sealed credential never leaves the database. */
function diagRow(row: EndpointRow) {
  return {
    endpoint_id: row.id,
    host: row.host,
    port: row.port,
    /** D45 : le tier est la seule chose qui dit quelle nature de nœud on regarde. */
    tier: row.tier,
    status: row.status,
    health: row.health,
    down_since: row.down_since,
    down_reason: row.down_reason,
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

type NodeUsageEntry = { uuid: string; bytesUp: number; bytesDown: number };

/**
 * Consommation mesurée par le nœud payant (D52/D69) : `source='node'`, jamais
 * mélangée avec ce que l'appareil déclare. L'identité du pool est jointe à
 * `config_grants` pour retrouver l'appareil ; sans grant, la ligne est ignorée
 * en silence — un nœud qui redémarre peut renvoyer des UUID qu'aucun appareil
 * vivant ne détient, ce n'est pas une erreur de contrat.
 *
 * Une seule instruction pour tout le lot (`jsonb_to_recordset`) : un heartbeat
 * toutes les 30 s ne doit pas coûter 200 allers-retours. `DISTINCT ON` parce
 * qu'une ligne `usage_daily` est par appareil, pas par UUID.
 *
 * `GREATEST` : les compteurs Xray sont cumulatifs depuis le démarrage du
 * process, une requête rejouée ne doit jamais faire reculer un compteur.
 */
async function recordNodeUsage(
  db: Database,
  deploymentKey: string,
  usage: NodeUsageEntry[],
): Promise<number> {
  const rows = await db.query<{ device_id: string }>(
    `INSERT INTO usage_daily (device_id, day, source, bytes_up, bytes_down)
     SELECT DISTINCT ON (g.device_id)
            g.device_id,
            (now() AT TIME ZONE 'utc')::date,
            'node',
            u.bytes_up,
            u.bytes_down
       FROM jsonb_to_recordset($2::jsonb) AS u(uuid text, bytes_up bigint, bytes_down bigint)
       JOIN config_grants g
         ON g.endpoint_id = (SELECT id FROM endpoints WHERE deployment_key = $1)
        AND g.identity = u.uuid
      ORDER BY g.device_id, (g.revoked_at IS NULL) DESC, g.issued_at DESC
     ON CONFLICT (device_id, day, source) DO UPDATE
        SET bytes_up   = GREATEST(usage_daily.bytes_up,   EXCLUDED.bytes_up),
            bytes_down = GREATEST(usage_daily.bytes_down, EXCLUDED.bytes_down),
            updated_at = now()
     RETURNING device_id`,
    [
      deploymentKey,
      JSON.stringify(usage.map((entry) => ({ uuid: entry.uuid, bytes_up: entry.bytesUp, bytes_down: entry.bytesDown }))),
    ],
  );
  return rows.length;
}

const TIERS: readonly EndpointTier[] = ["free-labs", "paid-gcp"];

export function registerInternalRoutes(app: FastifyInstance, db: Database): void {
  const auth = ingestAuth(db);
  const globalAuth = ingestAuth(db, { globalOnly: true });

  app.post(`${PREFIX}/endpoints/register`, { preHandler: auth }, async (req) => {
    const input = parseBody(registerSchema, req.body);
    const slot = req.ingestSlot ?? null;
    const now = new Date();
    if (slot) {
      // Clé de créneau : une seule liaison par déploiement (usage unique, D124).
      await bindNightSlot(db, slot.id, input.deployment_key, now);
    }
    const endpoint = await registerEndpoint(db, {
      deploymentKey: input.deployment_key,
      // Pas de libellé fourni : un nom générique stable, dérivé de la clé de déploiement.
      label: input.label ?? nodeNameFor(input.deployment_key),
      host: input.public_host,
      port: input.port,
      sni: input.sni ?? input.public_host,
      region: input.region,
      capacity: input.capacity,
      // Un nœud de nuit vit exactement un créneau (4 h), quel que soit le TTL demandé.
      ttlSeconds: slot ? env.ingest.nightTtlSeconds : input.ttl_seconds,
      agentVersion: input.agent_version ?? null,
      tier: input.tier,
      identityMode: input.identity_mode,
    });
    if (slot) await attachNodeToSlot(db, slot.id, endpoint.id);
    const fronts = await syncFrontSiblings(db, input.deployment_key, input.front ?? null);
    const revision = fronts > 0 ? await bumpPoolRevision(db) : endpoint.poolRevision;

    // 200 on both paths: a restart reuses an existing resource, it is not a new one.
    return {
      endpoint_id: endpoint.id,
      uuid: endpoint.credential,
      ws_path: endpoint.wsPath,
      expires_at: endpoint.expiresAt,
      status: endpoint.status,
      tier: endpoint.tier,
      identity_mode: endpoint.identityMode,
      // Le pool fixe n'est renvoyé qu'au mode qui l'utilise (D69) : un nœud
      // `shared` n'a aucun client pré-provisionné à écrire dans Xray.
      ...(endpoint.clientPool ? { client_pool: endpoint.clientPool } : {}),
      front_outputs: fronts,
      pool_revision: revision,
    };
  });

  app.post(`${PREFIX}/endpoints/ready`, { preHandler: auth }, async (req) => {
    // `tier` est parsé mais volontairement pas propagé : un `ready` ne retière
    // pas un nœud (D68), il ne fait que constater que le conteneur est prêt.
    const input = parseBody(keySchema, req.body);
    assertSlotBinding(req, input.deployment_key);
    const result = await markReady(db, input.deployment_key);
    return { status: result.status, pool_revision: result.poolRevision };
  });

  app.post(`${PREFIX}/endpoints/heartbeat`, { preHandler: auth }, async (req) => {
    const input = parseBody(heartbeatSchema, req.body);
    assertSlotBinding(req, input.deployment_key);
    const result = await heartbeat(db, input.deployment_key, {
      latencyMs: input.latency_ms ?? null,
      // D47 : `healthy:true` ne lève pas un `down` (voir services/endpoints.ts).
      health: input.healthy === true ? "healthy" : input.healthy === false ? "degraded" : null,
      agentVersion: input.agent_version ?? null,
    });
    const usageWritten = input.usage && input.usage.length > 0
      ? await recordNodeUsage(db, input.deployment_key, input.usage)
      : 0;
    return {
      status: result.status,
      tier: result.tier,
      expires_at: result.expiresAt,
      usage_written: usageWritten,
    };
  });

  app.get(`${PREFIX}/pool`, { preHandler: globalAuth }, async () => {
    const rows = await listPool(db);
    return {
      pool_revision: await poolRevision(db),
      count: rows.length,
      // Diagnostic sans UUID ni chemin WS : on nomme les deux natures de nœuds
      // pour que la porte de la vague B se lise en une commande (D45).
      tiers: TIERS.map((tier) => ({
        tier,
        total: rows.filter((row) => row.tier === tier).length,
        served: rows.filter(
          (row) =>
            row.tier === tier &&
            row.status === "active" &&
            row.health !== "down",
        ).length,
      })),
      endpoints: rows.map(diagRow),
    };
  });
}
