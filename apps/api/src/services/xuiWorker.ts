/**
 * Boucle 3x-ui du forfait limité (D113, D114).
 *
 * Trois choses, toutes idempotentes :
 * 1. **Création** : un abonnement limité actif sans client reçoit une ligne
 *    `xui_jobs` (`create_client`), puis le client est créé dans le panneau.
 * 2. **Consommation** : toutes les 10 minutes, le trafic de chaque client est lu
 *    et stocké en `GREATEST` (un panneau redémarré peut perdre ses compteurs).
 * 3. **Épuisement** : au quota atteint, `subscriptions.exhausted_at` est posé
 *    **d'abord** (le bundle se vide immédiatement, même si le panneau est
 *    injoignable), puis une tâche `disable_client` coupe le client.
 *
 * Ordre des écritures côté panneau : la ligne locale (serveur, e-mail, UUID
 * scellé) est écrite avant l'appel, la confirmation (`confirmed_at`) après. Un
 * client sans confirmation n'est jamais servi dans un bundle.
 *
 * Verrou : toute la phase d'enfilement et de réclamation tourne sous
 * `pg_try_advisory_xact_lock`. Les appels réseau se font **hors** transaction,
 * pour ne pas tenir une connexion pendant un appel au panneau. Les réclamations
 * utilisent aussi `FOR UPDATE SKIP LOCKED` : deux instances ne prennent jamais le
 * même job, même si le verrou était contourné.
 */
import { randomUUID } from "node:crypto";
import type { FastifyBaseLogger } from "fastify";
import type { Database, Queryable, Row } from "../db.js";
import { decryptSecret, encryptSecret, newId } from "../lib/crypto.js";
import { bumpPoolRevision } from "./endpoints.js";
import { XuiError, addClient, getClientTraffic, panelFor, setClientEnabled, type XuiPanel } from "./xui.js";

/** 727_001 sert au schéma (db.ts) : celui-ci est le suivant. */
export const XUI_LOCK_KEY = 727_002;
export const MAX_ATTEMPTS = 8;
/** Bail d'une tâche réclamée : au-delà, un autre passage peut la reprendre. */
export const LEASE_SECONDS = 300;
export const TRAFFIC_INTERVAL_MS = 10 * 60_000;
export const TICK_MS = 30_000;
const BATCH = 50;

type JobKind = "create_client" | "disable_client";

interface Job {
  id: string;
  kind: JobKind;
  subscription_id: string;
  attempts: number;
}

export interface TickSummary {
  skipped: boolean;
  done: number;
  retried: number;
  failed: number;
  trafficRead: number;
  exhausted: number;
}

const EMPTY: TickSummary = { skipped: false, done: 0, retried: 0, failed: 0, trafficRead: 0, exhausted: 0 };

/* ------------------------------------------------------------- enfilement */

async function enqueueCreates(q: Queryable): Promise<void> {
  const subs = await q.query<{ id: string }>(
    `SELECT s.id
       FROM subscriptions s
       JOIN plans p ON p.id = s.plan_id
      WHERE p.family IN ('limited', 'limited_night')
        AND s.status = 'active'
        AND s.ends_at > now()
        AND s.exhausted_at IS NULL
        AND s.xui_client_email IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM xui_jobs j
           WHERE j.subscription_id = s.id AND j.kind = 'create_client'
             AND j.state IN ('pending', 'running', 'failed'))`,
  );
  for (const sub of subs) {
    await q.query("INSERT INTO xui_jobs (id, kind, subscription_id) VALUES ($1, 'create_client', $2)", [newId(), sub.id]);
  }
}

/** Filet de sécurité : un épuisement sans tâche de coupure en reçoit une. */
async function enqueueDisables(q: Queryable): Promise<void> {
  const subs = await q.query<{ id: string }>(
    `SELECT s.id FROM subscriptions s
      WHERE s.exhausted_at IS NOT NULL
        AND s.xui_client_email IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM xui_jobs j
           WHERE j.subscription_id = s.id AND j.kind = 'disable_client')`,
  );
  for (const sub of subs) {
    await q.query("INSERT INTO xui_jobs (id, kind, subscription_id) VALUES ($1, 'disable_client', $2)", [newId(), sub.id]);
  }
}

/* ------------------------------------------------------------ réclamation */

async function claim(q: Queryable): Promise<Job[]> {
  return q.query<Job>(
    `UPDATE xui_jobs
        SET state = 'running',
            attempts = attempts + 1,
            run_after = now() + ($1::int * interval '1 second')
      WHERE id IN (
        SELECT id FROM xui_jobs
         WHERE state IN ('pending', 'running') AND run_after <= now()
         ORDER BY created_at
         LIMIT $2
         FOR UPDATE SKIP LOCKED)
      RETURNING id, kind, subscription_id, attempts`,
    [LEASE_SECONDS, BATCH],
  );
}

/** `null` si un autre passage tient le verrou : rien à faire ici. */
async function claimDue(db: Database, enqueue: boolean): Promise<Job[] | null> {
  return db.tx(async (q) => {
    const locked = await q.scalar<boolean>("SELECT pg_try_advisory_xact_lock($1::bigint)", [XUI_LOCK_KEY]);
    if (!locked) return null;
    if (enqueue) {
      await enqueueCreates(q);
      await enqueueDisables(q);
    }
    return claim(q);
  });
}

/* ------------------------------------------------------------ exécution */

async function pickServer(db: Queryable): Promise<string | null> {
  const servers = await db.query<{ id: string; capacity: number; load: number }>(
    `SELECT s.id, s.capacity,
            (SELECT count(*)::int FROM subscriptions x WHERE x.xui_server_id = s.id) AS load
       FROM xui_servers s
      WHERE s.active
      ORDER BY load ASC, s.created_at ASC`,
  );
  return servers.find((server) => Number(server.load) < Number(server.capacity))?.id ?? null;
}

async function createClient(db: Database, subscriptionId: string): Promise<void> {
  const sub = await db.one<Row>(
    `SELECT id, ends_at, quota_bytes, xui_server_id, xui_client_email, exhausted_at
       FROM subscriptions WHERE id = $1`,
    [subscriptionId],
  );
  if (!sub) throw new XuiError("Abonnement introuvable.");
  if (sub.exhausted_at !== null && sub.exhausted_at !== undefined) return;
  if (sub.quota_bytes === null || sub.quota_bytes === undefined) throw new XuiError("Quota absent sur l'abonnement.");

  const serverId = (sub.xui_server_id as string | null) ?? (await pickServer(db));
  if (!serverId) throw new XuiError("Aucun serveur 3x-ui actif avec de la place.");

  const email = (sub.xui_client_email as string | null) ?? `bd-${subscriptionId}`;
  const existing = await db.one<Row>("SELECT uuid_sealed FROM xui_clients WHERE subscription_id = $1", [subscriptionId]);
  const uuid = existing ? decryptSecret(String(existing.uuid_sealed)) : randomUUID();

  // Écriture locale d'abord : un échec du panneau après ce point se rejoue avec
  // le même serveur, le même e-mail et le même UUID.
  await db.tx(async (q) => {
    await q.query("UPDATE subscriptions SET xui_server_id = $2, xui_client_email = $3 WHERE id = $1", [
      subscriptionId,
      serverId,
      email,
    ]);
    await q.query(
      "INSERT INTO xui_clients (subscription_id, uuid_sealed, used_bytes) VALUES ($1, $2, 0) ON CONFLICT (subscription_id) DO NOTHING",
      [subscriptionId, encryptSecret(uuid)],
    );
  });

  const panel = await panelFor(db, serverId);
  await addClient(panel, {
    email,
    uuid,
    quotaBytes: Number(sub.quota_bytes),
    expiresAtMs: new Date(sub.ends_at as string | Date).getTime(),
  });
  await db.query("UPDATE xui_clients SET confirmed_at = now(), updated_at = now() WHERE subscription_id = $1", [subscriptionId]);
  // Un nouveau client change ce que le bundle sert : les appareils doivent le revoir.
  await bumpPoolRevision(db);
}

async function disableClient(db: Database, subscriptionId: string): Promise<void> {
  const sub = await db.one<Row>("SELECT xui_server_id, xui_client_email FROM subscriptions WHERE id = $1", [subscriptionId]);
  if (!sub?.xui_server_id || !sub.xui_client_email) return;
  const panel: XuiPanel = await panelFor(db, String(sub.xui_server_id));
  await setClientEnabled(panel, String(sub.xui_client_email), false);
}

/** Pose l'épuisement une seule fois, puis prépare la coupure. */
export async function markExhausted(db: Database, subscriptionId: string): Promise<boolean> {
  const row = await db.one<Row>(
    "UPDATE subscriptions SET exhausted_at = now() WHERE id = $1 AND exhausted_at IS NULL RETURNING id",
    [subscriptionId],
  );
  if (!row) return false;
  await db.query("INSERT INTO xui_jobs (id, kind, subscription_id) VALUES ($1, 'disable_client', $2)", [newId(), subscriptionId]);
  await bumpPoolRevision(db);
  return true;
}

async function runJob(db: Database, job: Job, log?: FastifyBaseLogger): Promise<"done" | "retried" | "failed"> {
  try {
    if (job.kind === "create_client") await createClient(db, job.subscription_id);
    else await disableClient(db, job.subscription_id);
    await db.query("UPDATE xui_jobs SET state = 'done', last_error = NULL, run_after = now() WHERE id = $1", [job.id]);
    return "done";
  } catch (err) {
    // Seuls les messages de XuiError sont écrits : ils ne contiennent ni le jeton
    // ni le chemin de base du panneau. Le reste part au journal, sans contenu.
    const message = err instanceof XuiError ? err.message : "Erreur interne pendant l'action 3x-ui.";
    if (!(err instanceof XuiError)) log?.error({ err, jobId: job.id }, "tâche 3x-ui en erreur");
    const failed = job.attempts >= MAX_ATTEMPTS;
    const delaySeconds = Math.min(3_600, 60 * 2 ** Math.max(0, job.attempts - 1));
    await db.query(
      `UPDATE xui_jobs
          SET state = $2, last_error = $3, run_after = now() + ($4::int * interval '1 second')
        WHERE id = $1`,
      [job.id, failed ? "failed" : "pending", message.slice(0, 300), delaySeconds],
    );
    return failed ? "failed" : "retried";
  }
}

/* -------------------------------------------------------- consommation */

export async function readTraffic(db: Database, log?: FastifyBaseLogger): Promise<{ read: number; exhausted: number }> {
  const rows = await db.query<Row>(
    `SELECT s.id, s.xui_client_email, s.quota_bytes, s.xui_server_id
       FROM subscriptions s
       JOIN xui_servers srv ON srv.id = s.xui_server_id AND srv.active
       JOIN xui_clients c ON c.subscription_id = s.id AND c.confirmed_at IS NOT NULL
      WHERE s.exhausted_at IS NULL AND s.xui_client_email IS NOT NULL`,
  );
  const panels = new Map<string, XuiPanel>();
  let read = 0;
  let exhausted = 0;
  for (const row of rows) {
    const subscriptionId = String(row.id);
    try {
      const serverId = String(row.xui_server_id);
      const panel = panels.get(serverId) ?? (await panelFor(db, serverId));
      panels.set(serverId, panel);
      const used = await getClientTraffic(panel, String(row.xui_client_email));
      const stored = await db.one<Row>(
        `UPDATE xui_clients
            SET used_bytes = GREATEST(used_bytes, $2::bigint), read_at = now(), updated_at = now()
          WHERE subscription_id = $1
        RETURNING used_bytes`,
        [subscriptionId, used],
      );
      read += 1;
      const quota = row.quota_bytes === null || row.quota_bytes === undefined ? null : Number(row.quota_bytes);
      if (quota !== null && Number(stored?.used_bytes ?? 0) >= quota && (await markExhausted(db, subscriptionId))) {
        exhausted += 1;
      }
    } catch (err) {
      log?.warn({ subscriptionId, reason: err instanceof XuiError ? err.message : "erreur interne" }, "lecture 3x-ui en échec");
    }
  }
  return { read, exhausted };
}

/* ------------------------------------------------------------- passage */

/** Un passage complet. `readTraffic` est vrai une fois toutes les 10 minutes. */
export async function runXuiTick(
  db: Database,
  options: { readTraffic: boolean; log?: FastifyBaseLogger },
): Promise<TickSummary> {
  const first = await claimDue(db, true);
  if (first === null) return { ...EMPTY, skipped: true };

  const summary: TickSummary = { ...EMPTY };
  const count = (outcome: "done" | "retried" | "failed") => {
    if (outcome === "done") summary.done += 1;
    else if (outcome === "retried") summary.retried += 1;
    else summary.failed += 1;
  };

  for (const job of first) count(await runJob(db, job, options.log));

  if (options.readTraffic) {
    const traffic = await readTraffic(db, options.log);
    summary.trafficRead = traffic.read;
    summary.exhausted = traffic.exhausted;
  }

  // Les coupures créées par la lecture ci-dessus partent dans le même passage.
  const second = await claimDue(db, true);
  for (const job of second ?? []) count(await runJob(db, job, options.log));
  return summary;
}

/**
 * Branchement dans `server.ts`. Un passage toutes les 30 secondes ; la lecture du
 * trafic n'a lieu que toutes les 10 minutes. Un passage ne chevauche jamais le
 * précédent dans ce processus.
 */
export function startXuiWorker(db: Database, log: FastifyBaseLogger): { stop: () => void } {
  let lastTrafficAt = 0;
  let running = false;
  const timer = setInterval(() => {
    if (running) return;
    running = true;
    const now = Date.now();
    const readTrafficNow = now - lastTrafficAt >= TRAFFIC_INTERVAL_MS;
    if (readTrafficNow) lastTrafficAt = now;
    runXuiTick(db, { readTraffic: readTrafficNow, log })
      .catch((err: unknown) => log.error({ err }, "passage 3x-ui en échec"))
      .finally(() => {
        running = false;
      });
  }, TICK_MS);
  timer.unref();
  return { stop: () => clearInterval(timer) };
}
