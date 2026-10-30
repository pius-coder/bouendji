/**
 * Sonde serveur d'un nœud (2026-10-30).
 *
 * Le serveur ouvre une connexion TCP réelle vers `host:port` du point
 * d'entrée. Ce n'est pas un handshake VLESS complet : cela prouve que le
 * nœud répond au niveau transport, ce que les rapports des téléphones ne
 * peuvent pas distinguer d'un problème local (réseau mobile, tunnel cassé).
 *
 * Le résultat est écrit dans `endpoints` puis `reconcileHealth` combine :
 *   - sonde serveur fraîche : verdict prioritaire ;
 *   - pas de sonde fraîche : verdict des téléphones (comportement D47/D50).
 *
 * Aucun retrait automatique : le verdict ne sert qu'à l'affichage et à
 * l'alerte Telegram.
 */
import net from "node:net";
import type { Queryable } from "../db.js";
import { reconcileHealth } from "./health.js";

export const PROBE_TIMEOUT_MS = 5_000;

export interface ProbeResult {
  ok: boolean;
  latencyMs: number | null;
  error: string | null;
}

/** Connexion TCP simple, avec délai maximal. Ne lève jamais. */
export function tcpProbe(host: string, port: number, timeoutMs = PROBE_TIMEOUT_MS): Promise<ProbeResult> {
  return new Promise((resolve) => {
    const started = Date.now();
    const socket = new net.Socket();
    let settled = false;

    const finish = (ok: boolean, error: string | null): void => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve({
        ok,
        latencyMs: ok ? Math.max(0, Date.now() - started) : null,
        error,
      });
    };

    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish(true, null));
    socket.once("timeout", () => finish(false, "timeout"));
    socket.once("error", (err: NodeJS.ErrnoException) => finish(false, err.code ?? err.message));
    socket.connect(port, host);
  });
}

export interface ProbeVerdict extends ProbeResult {
  endpointId: string;
  health: string;
  reason: string | null;
  changed: boolean;
}

/**
 * Sonde un nœud, écrit la mesure, puis applique le verdict combiné.
 * Retourne `null` si le nœud n'existe plus (purge concurrente).
 */
export async function probeAndRecord(db: Queryable, endpointId: string): Promise<ProbeVerdict | null> {
  const row = await db.one<{ id: string; host: string; port: number }>(
    "SELECT id, host, port FROM endpoints WHERE id = $1",
    [endpointId],
  );
  if (!row) return null;

  const result = await tcpProbe(String(row.host), Number(row.port));

  await db.query(
    `UPDATE endpoints
        SET probe_ok = $2,
            probe_latency_ms = $3,
            probe_error = $4,
            probed_at = now(),
            latency_ms = CASE WHEN $2 THEN COALESCE($3, latency_ms) ELSE latency_ms END,
            health_checked_at = now(),
            updated_at = now()
      WHERE id = $1`,
    [endpointId, result.ok, result.latencyMs, result.error],
  );

  // Le verdict lit la sonde qui vient d'être écrite. Il peut aussi alerter
  // Telegram si l'état change (voir health.setHealth).
  const verdict = await reconcileHealth(db, endpointId);

  const after = await db.one<{ health: string; down_reason: string | null }>(
    "SELECT health, down_reason FROM endpoints WHERE id = $1",
    [endpointId],
  );

  return {
    endpointId,
    ...result,
    health: String(after?.health ?? "unknown"),
    reason: (after?.down_reason as string | null | undefined) ?? null,
    changed: verdict?.changed ?? false,
  };
}

/** Sonde tous les nœuds actifs (y compris ceux marqués hors service). */
export async function probeActiveEndpoints(db: Queryable): Promise<number> {
  const rows = await db.query<{ id: string }>(
    `SELECT id FROM endpoints
      WHERE status = 'active'
      ORDER BY created_at DESC
      LIMIT 100`,
  );
  await Promise.allSettled(rows.map((row) => probeAndRecord(db, String(row.id))));
  return rows.length;
}
