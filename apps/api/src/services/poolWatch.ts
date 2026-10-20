import { env } from "../config.js";
import type { Database } from "../db.js";
import { deployReminder, noEndpoint, notify } from "./telegram.js";

/**
 * Watches the *supply*, not the traffic.
 *
 * An endpoint container cannot warn about its own death: it is gone by then.
 * The API is the only place that knows the whole pool, so the reminder lives
 * here. It fires on the youngest endpoint, because that is the real deadline —
 * an older one dying is expected, the last one dying is an outage.
 */

const REPEAT_AFTER_MS = 15 * 60_000;

export interface PoolWatchState {
  lastKey: string | null;
  lastAt: number;
}

export type Sender = (text: string) => Promise<boolean>;

export interface PoolWatchResult {
  sent: boolean;
  key: string;
  activeCount: number;
  minutesLeft: number | null;
}

export function newPoolWatchState(): PoolWatchState {
  return { lastKey: null, lastAt: 0 };
}

export async function checkPoolExpiry(
  db: Database,
  state: PoolWatchState,
  options: { send?: Sender; now?: Date; repeatAfterMs?: number } = {},
): Promise<PoolWatchResult> {
  const send = options.send ?? notify;
  const now = options.now ?? new Date();
  const repeatAfter = options.repeatAfterMs ?? REPEAT_AFTER_MS;

  const row = await db.one<{ active: number | string; latest: string | Date | null }>(
    `SELECT CAST(count(*) AS int) AS active, max(expires_at) AS latest
       FROM endpoints
      WHERE status IN ('active', 'draining') AND expires_at > $1`,
    [now],
  );

  const activeCount = Number(row?.active ?? 0);
  if (activeCount === 0) {
    const key = "none";
    const due = state.lastKey !== key || now.getTime() - state.lastAt >= repeatAfter;
    if (!due) return { sent: false, key, activeCount, minutesLeft: null };
    state.lastKey = key;
    state.lastAt = now.getTime();
    return { sent: await send(noEndpoint()), key, activeCount, minutesLeft: null };
  }

  const latest = new Date(row!.latest as string);
  const minutesLeft = Math.round((latest.getTime() - now.getTime()) / 60_000);
  const key = `exp:${latest.toISOString()}`;

  if (minutesLeft > env.telegram.deployWarnMinutes) {
    return { sent: false, key, activeCount, minutesLeft };
  }

  const due = state.lastKey !== key || now.getTime() - state.lastAt >= repeatAfter;
  if (!due) return { sent: false, key, activeCount, minutesLeft };

  state.lastKey = key;
  state.lastAt = now.getTime();

  const text = deployReminder({
    minutesLeft,
    activeCount,
    service: process.env.K_SERVICE ?? "endpoint",
    region: process.env.CLOUD_RUN_REGION ?? process.env.K_REGION ?? "us-central1",
  });
  return { sent: await send(text), key, activeCount, minutesLeft };
}
