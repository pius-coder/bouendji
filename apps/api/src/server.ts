import type { FastifyServerOptions } from "fastify";
import { buildApp } from "./app.js";
import { env } from "./config.js";
import { createDb } from "./db.js";
import { purgeExpired, purgedTotal } from "./services/maintenance.js";
import { checkPoolExpiry, newPoolWatchState } from "./services/poolWatch.js";
import { probeActiveEndpoints } from "./services/probe.js";
import { startXuiWorker } from "./services/xuiWorker.js";

/**
 * Process entrypoint.
 *
 * Two things are easy to get wrong here:
 *  - Cloud Run only routes traffic to the port given in $PORT, never a fixed one.
 *  - SIGTERM is sent on scale-to-zero and on instance recycling, so shutdown must
 *    never deregister the endpoint: the node stays in the pool until expires_at
 *    (see knowledge/10-infrastructure/cloud-run.md §8).
 */

const SWEEP_INTERVAL_MS = 60_000;
const PROBE_INTERVAL_MS = 5 * 60_000;
const SHUTDOWN_GRACE_MS = 15_000;

/**
 * Production keeps raw JSON: Cloud Run and log shippers read fields, not a
 * formatted line. Development gets readable output through a pino transport,
 * so pino-pretty (a devDependency) is never loaded in production.
 */
const logger: FastifyServerOptions["logger"] = env.isProduction
  ? true
  : {
      transport: {
        target: "pino-pretty",
        options: { translateTime: "HH:MM:ss Z", ignore: "pid,hostname" },
      },
    };

const db = await createDb();
const app = await buildApp({ db, logger });
const poolWatch = newPoolWatchState();
startXuiWorker(db, app.log); // forfait limité 3x-ui (D113/D114) : tâche de fond, sous verrou consultatif

if (env.ingest.secret.length === 0) {
  app.log.warn("ENDPOINT_INGEST_SECRET est vide : /v1/internal/* répondra 503 (ingestion fermée).");
}

async function sweep(): Promise<void> {
  try {
    // D145 : plus de balayage qui désactive les nœuds — un serveur reste dans
    // le pool tant que personne ne le retire à la main. Ce tick ne fait plus
    // que les rappels de créneaux de nuit.
    const watch = await checkPoolExpiry(db, poolWatch);
    if (watch.sent) app.log.info({ minutesLeft: watch.minutesLeft, active: watch.activeCount }, "rappel de deploiement envoye");
  } catch (err) {
    app.log.error({ err }, "tick du pool en échec");
  }

  // Purge in the same tick, but isolated: a slow DELETE must not stop the pool
  // sweep from running, and vice versa. Nothing purged is served by any route,
  // so a failed purge is a growth problem, never a correctness problem.
  try {
    const purged = await purgeExpired(db);
    if (purgedTotal(purged) > 0) app.log.info(purged, "purge des données expirées");
  } catch (err) {
    app.log.error({ err }, "purge en échec");
  }
}

let probing = false;

/**
 * Sonde serveur périodique (2026-10-30). Elle donne au propriétaire un état
 * mesuré même sans téléphone connecté. Elle n'écrit jamais `status` : un nœud
 * hors service reste servi, l'alerte part sur Telegram (voir health.setHealth).
 */
async function probeTick(): Promise<void> {
  if (probing) return;
  probing = true;
  try {
    const count = await probeActiveEndpoints(db);
    if (count > 0) app.log.info({ count }, "sonde serveur des nœuds terminée");
  } catch (err) {
    app.log.error({ err }, "sonde serveur en échec");
  } finally {
    probing = false;
  }
}

try {
  await app.listen({ host: env.host, port: env.port });
} catch (err) {
  app.log.error({ err }, "impossible de démarrer le serveur");
  await db.close().catch(() => undefined);
  process.exit(1);
}

const timer = setInterval(() => {
  void sweep();
}, SWEEP_INTERVAL_MS);
// Never keep the process alive just for the sweep.
timer.unref();

const probeTimer = setInterval(() => {
  void probeTick();
}, PROBE_INTERVAL_MS);
probeTimer.unref();

// Première mesure peu après le démarrage : le pool est renseigné sans attendre
// cinq minutes ni le premier téléphone.
const firstProbe = setTimeout(() => {
  void probeTick();
}, 20_000);
firstProbe.unref();

let shuttingDown = false;

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  app.log.info({ signal }, "arrêt demandé : fermeture des connexions");
  clearInterval(timer);
  clearInterval(probeTimer);
  clearTimeout(firstProbe);

  const force = setTimeout(() => {
    app.log.error("arrêt forcé : des requêtes ne se terminent pas");
    process.exit(1);
  }, SHUTDOWN_GRACE_MS);
  force.unref();

  try {
    // Stops accepting, lets in-flight requests finish, then releases the DB.
    await app.close();
    await db.close();
    clearTimeout(force);
    process.exit(0);
  } catch (err) {
    app.log.error({ err }, "arrêt en erreur");
    process.exit(1);
  }
}

process.once("SIGTERM", () => void shutdown("SIGTERM"));
process.once("SIGINT", () => void shutdown("SIGINT"));
