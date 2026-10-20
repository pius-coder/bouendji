import { randomUUID } from "node:crypto";
import type { VlessConfig } from "@vpn/contract";
import { env } from "../config.js";
import { isUniqueViolation, type Queryable } from "../db.js";
import { decryptSecret, encryptSecret, newId } from "../lib/crypto.js";
import { fail } from "../lib/errors.js";
import { buildVlessUri, randomWsPath } from "../lib/vless.js";

export type EndpointStatus = "pending" | "active" | "draining" | "expired" | "failed";
export type EndpointHealth = "unknown" | "healthy" | "degraded" | "down";

export interface EndpointRow {
  id: string;
  deployment_key: string;
  label: string;
  host: string;
  port: number;
  protocol: string;
  transport: string;
  security: "tls" | "none";
  sni: string | null;
  ws_path: string | null;
  credential: string;
  identity_mode: "shared" | "per_device";
  region: string;
  capacity: number;
  in_use: number;
  status: EndpointStatus;
  health: EndpointHealth;
  latency_ms: number | null;
  health_checked_at: Date | string | null;
  agent_version: string | null;
  last_seen_at: Date | string | null;
  expires_at: Date | string;
  created_at: Date | string;
  updated_at: Date | string;
}

export interface RegisterEndpointInput {
  deploymentKey: string;
  label: string;
  host: string;
  port?: number;
  security?: "tls" | "none";
  sni?: string | null;
  wsPath?: string | null;
  region?: string;
  capacity?: number;
  ttlSeconds?: number;
  agentVersion?: string | null;
}

export interface RegisteredEndpoint {
  id: string;
  deploymentKey: string;
  label: string;
  host: string;
  port: number;
  security: "tls" | "none";
  sni: string | null;
  wsPath: string;
  /** Plaintext, only ever returned to the deployment that owns the row. */
  credential: string;
  status: EndpointStatus;
  expiresAt: string;
  poolRevision: number;
  created: boolean;
}

const HOST_RE = /^[a-z0-9]([a-z0-9.-]{0,251}[a-z0-9])?$/;
const PATH_RE = /^\/[A-Za-z0-9._~\-/]{1,95}$/;

function cleanHost(raw: string): string {
  const host = raw.trim().toLowerCase();
  if (host.includes("://") || host.includes("/") || !HOST_RE.test(host)) {
    throw fail.validation({ host: "Hôte invalide : donnez un nom d'hôte, sans schéma ni chemin." });
  }
  return host;
}

function cleanPath(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const path = raw.trim();
  if (!PATH_RE.test(path) || path.includes("//")) {
    throw fail.validation({ wsPath: "Chemin invalide : doit commencer par / et rester simple." });
  }
  return path;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

function iso(value: Date | string): string {
  return new Date(value).toISOString();
}

function isExpired(row: EndpointRow, now = Date.now()): boolean {
  return row.status === "expired" || new Date(row.expires_at).getTime() <= now;
}

export async function poolRevision(db: Queryable): Promise<number> {
  const value = await db.scalar<string | number>("SELECT revision FROM pool_state WHERE id = 'pool'");
  return Number(value ?? 1);
}

/** Any change to the served pool must move this number or clients keep stale configs. */
export async function bumpPoolRevision(db: Queryable): Promise<number> {
  const row = await db.one<{ revision: string | number }>(
    "UPDATE pool_state SET revision = revision + 1, updated_at = now() WHERE id = 'pool' RETURNING revision",
  );
  return Number(row?.revision ?? 1);
}

async function byDeploymentKey(db: Queryable, key: string): Promise<EndpointRow | null> {
  return db.one<EndpointRow>("SELECT * FROM endpoints WHERE deployment_key = $1", [key]);
}

/**
 * Idempotent registration. A container restarts, scales out, or is redeployed
 * with the same key: it must inherit the existing credential and the existing
 * expiry, otherwise every restart would invalidate the configs already handed
 * to devices and silently extend a lifetime that is supposed to be short.
 */
export async function registerEndpoint(db: Queryable, input: RegisterEndpointInput): Promise<RegisteredEndpoint> {
  const deploymentKey = input.deploymentKey.trim();
  if (deploymentKey.length < 3 || deploymentKey.length > 190) {
    throw fail.validation({ deploymentKey: "Clé de déploiement invalide (3 à 190 caractères)." });
  }
  const host = cleanHost(input.host);
  const wsPath = cleanPath(input.wsPath);
  const port = clamp(input.port ?? 443, 1, 65_535);
  const region = (input.region ?? "auto").trim().slice(0, 24) || "auto";
  const label = input.label.trim().slice(0, 64);
  if (label.length < 2) throw fail.validation({ label: "Libellé trop court." });
  const capacity = clamp(input.capacity ?? 80, 1, 10_000);

  const existing = await byDeploymentKey(db, deploymentKey);
  if (existing) {
    return revive(db, existing, { host, port, region, label, capacity, agentVersion: input.agentVersion ?? null });
  }

  const ttl = clamp(
    input.ttlSeconds ?? env.ingest.defaultTtlSeconds,
    env.ingest.minTtlSeconds,
    env.ingest.maxTtlSeconds,
  );
  const credential = randomUUID();
  const id = newId();
  const path = wsPath ?? randomWsPath();
  const expiresAt = new Date(Date.now() + ttl * 1000);

  try {
    await db.query(
      `INSERT INTO endpoints
         (id, deployment_key, label, host, port, protocol, transport, security, sni, ws_path,
          credential, identity_mode, region, capacity, status, health, agent_version,
          last_seen_at, expires_at)
       VALUES ($1,$2,$3,$4,$5,'vless','ws',$6,$7,$8,$9,'shared',$10,$11,'pending','unknown',$12,now(),$13)`,
      [
        id,
        deploymentKey,
        label,
        host,
        port,
        input.security ?? "tls",
        input.sni ?? host,
        path,
        encryptSecret(credential),
        region,
        capacity,
        input.agentVersion ?? null,
        expiresAt,
      ],
    );
  } catch (err) {
    // Two instances of the same revision booting at once: the loser reads the winner.
    if (isUniqueViolation(err)) {
      const raced = await byDeploymentKey(db, deploymentKey);
      if (raced) return revive(db, raced, { host, port, region, label, capacity, agentVersion: input.agentVersion ?? null });
    }
    throw err;
  }

  const revision = await bumpPoolRevision(db);
  return {
    id,
    deploymentKey,
    label,
    host,
    port,
    security: input.security ?? "tls",
    sni: input.sni ?? host,
    wsPath: path,
    credential,
    status: "pending",
    expiresAt: expiresAt.toISOString(),
    poolRevision: revision,
    created: true,
  };
}

async function revive(
  db: Queryable,
  row: EndpointRow,
  patch: { host: string; port: number; region: string; label: string; capacity: number; agentVersion: string | null },
): Promise<RegisteredEndpoint> {
  if (isExpired(row)) {
    throw fail.conflict("Ce déploiement est expiré. Déployez un nouveau serveur avec une nouvelle clé.");
  }
  await db.query(
    `UPDATE endpoints
        SET host=$2, port=$3, region=$4, label=$5, capacity=$6,
            agent_version=COALESCE($7, agent_version), last_seen_at=now(), updated_at=now()
      WHERE id=$1`,
    [row.id, patch.host, patch.port, patch.region, patch.label, patch.capacity, patch.agentVersion],
  );

  return {
    id: row.id,
    deploymentKey: row.deployment_key,
    label: patch.label,
    host: patch.host,
    port: patch.port,
    security: row.security,
    sni: row.sni,
    wsPath: row.ws_path ?? "/ws",
    credential: decryptSecret(row.credential),
    status: row.status,
    expiresAt: iso(row.expires_at),
    poolRevision: await poolRevision(db),
    created: false,
  };
}

export async function markReady(
  db: Queryable,
  deploymentKey: string,
  input: { agentVersion?: string | null } = {},
): Promise<{ status: EndpointStatus; poolRevision: number }> {
  const row = await byDeploymentKey(db, deploymentKey);
  if (!row) throw fail.notFound("Déploiement inconnu : appelez /register d'abord.");
  if (isExpired(row)) throw fail.conflict("Ce déploiement est expiré.");

  const nextStatus: EndpointStatus = env.ingest.autoApprove ? "active" : "pending";
  const changed = row.status !== nextStatus;
  await db.query(
    `UPDATE endpoints
        SET status=$2, health=$3, agent_version=COALESCE($4, agent_version),
            last_seen_at=now(), updated_at=now()
      WHERE id=$1`,
    [row.id, nextStatus, nextStatus === "active" ? "unknown" : row.health, input.agentVersion ?? null],
  );
  const revision = changed ? await bumpPoolRevision(db) : await poolRevision(db);
  return { status: nextStatus, poolRevision: revision };
}

/**
 * Liveness signal only. It never extends expires_at and never bumps the pool
 * revision: a heartbeat must not force every device to re-download a bundle.
 */
export async function heartbeat(
  db: Queryable,
  deploymentKey: string,
  input: { latencyMs?: number | null; health?: EndpointHealth | null; agentVersion?: string | null } = {},
): Promise<{ status: EndpointStatus; expiresAt: string }> {
  const row = await byDeploymentKey(db, deploymentKey);
  if (!row) throw fail.notFound("Déploiement inconnu.");
  await db.query(
    `UPDATE endpoints
        SET last_seen_at=now(), updated_at=now(),
            latency_ms=COALESCE($2, latency_ms),
            health=COALESCE($3, health),
            health_checked_at=CASE WHEN $3 IS NULL THEN health_checked_at ELSE now() END,
            agent_version=COALESCE($4, agent_version)
      WHERE id=$1`,
    [row.id, input.latencyMs ?? null, input.health ?? null, input.agentVersion ?? null],
  );
  return { status: row.status, expiresAt: iso(row.expires_at) };
}

/** Ordered best-first: the app connects to the first entry and probes the rest. */
export async function servedEndpoints(db: Queryable, limit = 12): Promise<EndpointRow[]> {
  return db.query<EndpointRow>(
    `SELECT * FROM endpoints
      WHERE status = 'active' AND expires_at > now()
      ORDER BY (health = 'healthy') DESC NULLS LAST, latency_ms ASC NULLS LAST, created_at ASC
      LIMIT $1`,
    [limit],
  );
}

export async function listPool(db: Queryable): Promise<EndpointRow[]> {
  return db.query<EndpointRow>("SELECT * FROM endpoints ORDER BY created_at DESC LIMIT 500");
}

/**
 * Moves endpoints out of the served pool before they die, so clients stop
 * being handed a server that is about to disappear. Returns what changed.
 */
export async function sweepEndpoints(
  db: Queryable,
  now = new Date(),
): Promise<{ expired: number; draining: number; poolRevision: number }> {
  const expired = await db.query<{ id: string }>(
    `UPDATE endpoints SET status='expired', updated_at=now()
      WHERE status IN ('pending','active','draining') AND expires_at <= $1
      RETURNING id`,
    [now],
  );

  let draining: Array<{ id: string }> = [];
  if (env.ingest.drainLeadSeconds > 0) {
    draining = await db.query<{ id: string }>(
      `UPDATE endpoints SET status='draining', updated_at=now()
        WHERE status='active' AND expires_at <= $1::timestamptz + ($2::int * interval '1 second')
        RETURNING id`,
      [now, env.ingest.drainLeadSeconds],
    );
  }

  const changed = expired.length + draining.length;
  return {
    expired: expired.length,
    draining: draining.length,
    poolRevision: changed > 0 ? await bumpPoolRevision(db) : await poolRevision(db),
  };
}

/** Plaintext config for one device. Only ever serialised inside the sealed envelope. */
export function endpointToConfig(row: EndpointRow, identity?: string | null): VlessConfig {
  const credential = row.identity_mode === "per_device" && identity ? identity : decryptSecret(row.credential);
  return {
    id: row.id,
    label: row.label,
    uri: buildVlessUri({
      id: credential,
      host: row.host,
      port: row.port,
      security: row.security,
      sni: row.sni,
      wsPath: row.ws_path,
      label: row.label,
    }),
    expiresAt: iso(row.expires_at),
    region: row.region,
  };
}
