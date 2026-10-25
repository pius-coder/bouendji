import { randomUUID } from "node:crypto";
import type { VlessConfig } from "@vpn/contract";
import { env } from "../config.js";
import { isUniqueViolation, type Queryable } from "../db.js";
import { decryptSecret, encryptSecret, newId } from "../lib/crypto.js";
import { fail } from "../lib/errors.js";
import { buildVlessUri, randomWsPath } from "../lib/vless.js";

export type EndpointStatus = "pending" | "active" | "draining" | "expired" | "failed";
export type EndpointHealth = "unknown" | "healthy" | "degraded" | "down";

/**
 * Deux natures de nœuds, jamais mélangées (D45) : `free-labs` vit 4 h 30 et
 * tourne par le nombre, `paid-gcp` ne meurt pas et porte la mesure par appareil
 * (D69). Un bundle ne contient qu'un seul tier.
 */
export type EndpointTier = "free-labs" | "paid-gcp";
export type EndpointIdentityMode = "shared" | "per_device";

/** Pool fixe d'identités pré-provisionnées d'un nœud `per_device` (D69). */
export const CLIENT_POOL_SIZE = 200;

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
  ws_host?: string | null;
  credential: string;
  tier: EndpointTier;
  identity_mode: EndpointIdentityMode;
  /** `jsonb` : tableau d'UUID quand `identity_mode = 'per_device'`. */
  client_pool: string[] | null;
  region: string;
  capacity: number;
  in_use: number;
  status: EndpointStatus;
  health: EndpointHealth;
  /** Posé par le verdict client / l'admin, jamais par le nœud (D47). */
  down_since: Date | string | null;
  down_reason: string | null;
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
  /** D68 : propriété du nœud, choisie par `ENDPOINT_TIER`. Défaut `free-labs`. */
  tier?: EndpointTier;
  /** D68 : `per_device` fait générer un pool d'identités à l'enregistrement. */
  identityMode?: EndpointIdentityMode;
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
  tier: EndpointTier;
  identityMode: EndpointIdentityMode;
  /** Pool fixe (200 UUID) quand `identityMode = 'per_device'`, sinon `null`. */
  clientPool: string[] | null;
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

/**
 * `client_pool` est du `jsonb` : selon le driver il revient déjà désérialisé
 * (tableau) ou sous forme de texte JSON. On accepte les deux, et on refuse tout
 * le reste — un pool illisible est un pool absent, jamais une exception au
 * milieu d'un bundle.
 */
export function readClientPool(value: unknown): string[] | null {
  if (value == null) return null;
  if (Array.isArray(value)) {
    const items = value.filter((item): item is string => typeof item === "string" && item.length > 0);
    return items.length > 0 ? items : null;
  }
  if (typeof value === "string") {
    try {
      return readClientPool(JSON.parse(value) as unknown);
    } catch {
      return null;
    }
  }
  return null;
}

/** Le pool est fixe (D69) : généré une fois, jamais rechargé à l'inscription. */
function generateClientPool(): string[] {
  return Array.from({ length: CLIENT_POOL_SIZE }, () => randomUUID());
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
  // D68 : le défaut ne s'applique qu'à l'absence de valeur. Un `tier` transmis
  // par le conteneur doit être écrit tel quel, sinon le nœud payant devient un
  // nœud de lab sans que personne ne le voie.
  const requestedTier: EndpointTier | null = input.tier ?? null;
  const requestedIdentityMode: EndpointIdentityMode | null = input.identityMode ?? null;
  const tier: EndpointTier = requestedTier ?? "free-labs";
  const identityMode: EndpointIdentityMode = requestedIdentityMode ?? "shared";

  const existing = await byDeploymentKey(db, deploymentKey);
  if (existing) {
    return revive(db, existing, {
      host,
      port,
      region,
      label,
      capacity,
      sni: input.sni ?? host,
      agentVersion: input.agentVersion ?? null,
      tier: requestedTier,
      identityMode: requestedIdentityMode,
    });
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
  const clientPool = identityMode === "per_device" ? generateClientPool() : null;

  try {
    await db.query(
      `INSERT INTO endpoints
         (id, deployment_key, label, host, port, protocol, transport, security, sni, ws_path,
          credential, identity_mode, region, capacity, status, health, agent_version,
          last_seen_at, expires_at, tier, client_pool)
       VALUES ($1,$2,$3,$4,$5,'vless','ws',$6,$7,$8,$9,$10,$11,$12,'pending','unknown',$13,
               now(),$14,$15,$16::jsonb)`,
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
        identityMode,
        region,
        capacity,
        input.agentVersion ?? null,
        expiresAt,
        tier,
        clientPool === null ? null : JSON.stringify(clientPool),
      ],
    );
  } catch (err) {
    // Two instances of the same revision booting at once: the loser reads the winner.
    if (isUniqueViolation(err)) {
      const raced = await byDeploymentKey(db, deploymentKey);
      if (raced) {
        return revive(db, raced, {
          host,
          port,
          region,
          label,
          capacity,
          sni: input.sni ?? host,
          agentVersion: input.agentVersion ?? null,
          tier: requestedTier,
          identityMode: requestedIdentityMode,
        });
      }
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
    tier,
    identityMode,
    clientPool,
    expiresAt: expiresAt.toISOString(),
    poolRevision: revision,
    created: true,
  };
}

/**
 * Domain fronting (D93) : un nœud Cloud Run joignable aussi par un frontal
 * (IP Google + SNI d'un domaine Google, Host = le service). Chaque SNI devient
 * une sortie sœur, clé `<clé>#front-<n>`, qui partage l'identité, le chemin,
 * l'échéance et le statut du nœud principal. `front = null` retire les sœurs.
 */
export async function syncFrontSiblings(
  db: Queryable,
  deploymentKey: string,
  front: { address: string; snis: string[] } | null,
): Promise<number> {
  const main = await byDeploymentKey(db, deploymentKey);
  if (!main) throw fail.notFound("Déploiement inconnu.");
  const prefix = `${deploymentKey}#front-`;
  const keys = (front?.snis ?? []).map((_, index) => `${prefix}${index + 1}`);

  for (const [index, sni] of (front?.snis ?? []).entries()) {
    await db.query(
      `INSERT INTO endpoints
         (id, deployment_key, label, host, port, protocol, transport, security, sni, ws_path, ws_host,
          credential, identity_mode, region, capacity, status, health, agent_version, last_seen_at,
          expires_at, tier, client_pool)
       VALUES ($1,$2,$3,$4,443,'vless','ws','tls',$5,$6,$7,$8,$9,$10,$11,$12,'unknown',$13,now(),$14,$15,$16::jsonb)
       ON CONFLICT (deployment_key) DO UPDATE
          SET label = EXCLUDED.label, host = EXCLUDED.host, sni = EXCLUDED.sni, ws_path = EXCLUDED.ws_path,
              ws_host = EXCLUDED.ws_host, credential = EXCLUDED.credential, identity_mode = EXCLUDED.identity_mode,
              region = EXCLUDED.region, status = EXCLUDED.status, expires_at = EXCLUDED.expires_at,
              tier = EXCLUDED.tier, client_pool = EXCLUDED.client_pool, updated_at = now()`,
      [
        newId(),
        keys[index],
        `${main.label} ${index + 1}`,
        front!.address,
        sni,
        main.ws_path,
        main.host,
        main.credential,
        main.identity_mode,
        main.region,
        main.capacity,
        main.status,
        main.agent_version,
        main.expires_at,
        main.tier,
        main.client_pool === null ? null : JSON.stringify(main.client_pool),
      ],
    );
  }
  await db.query(
    `UPDATE endpoints SET status = 'expired', expires_at = LEAST(expires_at, now()), updated_at = now()
      WHERE left(deployment_key, length($1)) = $1 AND NOT (deployment_key = ANY($2::text[])) AND status <> 'expired'`,
    [prefix, keys],
  );
  return keys.length;
}

async function revive(
  db: Queryable,
  row: EndpointRow,
  patch: {
    host: string;
    port: number;
    region: string;
    label: string;
    capacity: number;
    /** Un nœud qui change de nom (nouveau domaine) change aussi de SNI. */
    sni: string;
    agentVersion: string | null;
    tier: EndpointTier | null;
    identityMode: EndpointIdentityMode | null;
  },
): Promise<RegisteredEndpoint> {
  if (isExpired(row)) {
    throw fail.conflict("Ce déploiement est expiré. Déployez un nouveau serveur avec une nouvelle clé.");
  }

  /*
   * Redémarrage = même ligne, même expiration, même credential. Le tier et le
   * mode d'identité suivent la même règle : la ligne fait foi, donc un
   * conteneur relancé sans `ENDPOINT_TIER` ne peut pas rétrograder un nœud
   * payant en nœud de lab. Une seule transition est acceptée, celle qui va
   * dans le sens de la déclaration : `shared` → `per_device` (le pool fixe est
   * alors généré une fois, et la révision bouge pour que les appareils
   * récupèrent une identité réelle).
   */
  const nextTier: EndpointTier = patch.tier !== null && patch.tier !== row.tier ? patch.tier : row.tier;
  const upgradingIdentity = patch.identityMode === "per_device" && row.identity_mode !== "per_device";
  const nextIdentityMode: EndpointIdentityMode = upgradingIdentity ? "per_device" : row.identity_mode;
  const nextClientPool =
    nextIdentityMode === "per_device" ? (readClientPool(row.client_pool) ?? generateClientPool()) : null;
  // Un changement d'adresse doit aussi faire bouger la révision : sinon les
  // appareils gardent en cache (ETag) l'ancien hôte ou l'ancien SNI.
  const poolChanged = nextTier !== row.tier || upgradingIdentity || patch.host !== row.host || patch.sni !== row.sni;

  await db.query(
    `UPDATE endpoints
        SET host=$2, port=$3, region=$4, label=$5, capacity=$6,
            agent_version=COALESCE($7, agent_version),
            tier=$8, identity_mode=$9, client_pool=$10::jsonb, sni=$11,
            last_seen_at=now(), updated_at=now()
      WHERE id=$1`,
    [
      row.id,
      patch.host,
      patch.port,
      patch.region,
      patch.label,
      patch.capacity,
      patch.agentVersion,
      nextTier,
      nextIdentityMode,
      nextClientPool === null ? null : JSON.stringify(nextClientPool),
      patch.sni,
    ],
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
    tier: nextTier,
    identityMode: nextIdentityMode,
    clientPool: nextClientPool,
    expiresAt: iso(row.expires_at),
    poolRevision: poolChanged ? await bumpPoolRevision(db) : await poolRevision(db),
    created: false,
  };
}

/**
 * `ready` ne dit qu'une chose : « ce conteneur est prêt à recevoir du trafic ».
 * Il ne touche plus à `health` (D47) : un redémarrage ne peut donc pas lever un
 * verdict `down` posé par les clients. Seul `setHealth` (services/health.ts)
 * écrit la santé, et c'est une transition qui bumpe la révision (D48).
 */
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
        SET status=$2, agent_version=COALESCE($3, agent_version),
            last_seen_at=now(), updated_at=now()
      WHERE id=$1 OR (left(deployment_key, length($4)) = $4 AND status <> 'expired')`,
    [row.id, nextStatus, input.agentVersion ?? null, `${deploymentKey}#front-`],
  );
  const revision = changed ? await bumpPoolRevision(db) : await poolRevision(db);
  return { status: nextStatus, poolRevision: revision };
}

/**
 * Liveness signal only. It never extends expires_at and never bumps the pool
 * revision: a heartbeat must not force every device to re-download a bundle.
 *
 * D47 : la parole du nœud ne lève **jamais** un `down`. Un conteneur vivant dont
 * le tunnel est mort est exactement le cas que le verdict client doit voir, et
 * le heartbeat ne voit pas le chemin client. Elle peut en revanche poser
 * `healthy` ou `degraded` tant qu'aucun verdict `down` n'existe.
 */
export async function heartbeat(
  db: Queryable,
  deploymentKey: string,
  input: { latencyMs?: number | null; health?: EndpointHealth | null; agentVersion?: string | null } = {},
): Promise<{ status: EndpointStatus; expiresAt: string; tier: EndpointTier }> {
  const row = await byDeploymentKey(db, deploymentKey);
  if (!row) throw fail.notFound("Déploiement inconnu.");
  await db.query(
    `UPDATE endpoints
        SET last_seen_at=now(), updated_at=now(),
            latency_ms=COALESCE($2, latency_ms),
            health=CASE WHEN endpoints.health = 'down' THEN 'down' ELSE COALESCE($3, health) END,
            health_checked_at=CASE WHEN $3 IS NULL THEN health_checked_at ELSE now() END,
            agent_version=COALESCE($4, agent_version)
      WHERE id=$1`,
    [row.id, input.latencyMs ?? null, input.health ?? null, input.agentVersion ?? null],
  );
  return { status: row.status, expiresAt: iso(row.expires_at), tier: row.tier };
}

/**
 * La liste vivante (D45/D47) : le tier demandé, jamais un nœud `down`, jamais un
 * nœud qui meurt dans la fenêtre de drain. `expires_at` ne décide plus de la
 * présence — il ne sert qu'au drain et aux alertes.
 *
 * `drain` remplace `sweepEndpoints()` pour la **lecture** : plus besoin d'un
 * tick serveur pour retirer un nœud qui va mourir (D51).
 *
 * La seconde signature (`servedEndpoints(db, limit)`) est l'appel historique des
 * bundles hors ligne : elle reste valable et sert le tier gratuit.
 */
export function servedEndpoints(db: Queryable, tier: EndpointTier, limit?: number): Promise<EndpointRow[]>;
export function servedEndpoints(db: Queryable, limit?: number): Promise<EndpointRow[]>;
export async function servedEndpoints(
  db: Queryable,
  tierOrLimit: EndpointTier | number = "free-labs",
  limit = 12,
): Promise<EndpointRow[]> {
  const tier: EndpointTier = typeof tierOrLimit === "number" ? "free-labs" : tierOrLimit;
  const max = typeof tierOrLimit === "number" ? tierOrLimit : limit;
  return db.query<EndpointRow>(
    `SELECT * FROM endpoints
      WHERE status = 'active'
        AND tier = $2
        AND health <> 'down'
        AND expires_at > now() + ($3::int * interval '1 second')
      ORDER BY CASE health WHEN 'healthy' THEN 0 WHEN 'unknown' THEN 1 ELSE 2 END,
               latency_ms ASC NULLS LAST,
               created_at ASC
      LIMIT $1`,
    [max, tier, env.ingest.drainLeadSeconds],
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
      hostHeader: row.ws_host ?? null,
      label: row.label,
    }),
    expiresAt: iso(row.expires_at),
    region: row.region,
  };
}
