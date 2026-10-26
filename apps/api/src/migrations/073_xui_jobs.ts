import type { Queryable } from "../db.js";

/**
 * Outbox des actions 3x-ui (création de client, désactivation à l'épuisement).
 * Les écritures côté panneau ne partagent jamais la transaction qui les déclenche :
 * la ligne reste, l'action se rejoue jusqu'à réussite ou jusqu'à `failed`.
 */
export const id = "073_xui_jobs";

export async function up(db: Queryable): Promise<void> {
  await db.query(`
    CREATE TABLE IF NOT EXISTS xui_jobs (
      id              text PRIMARY KEY,
      kind            text NOT NULL CHECK (kind IN ('create_client', 'disable_client')),
      subscription_id text NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
      state           text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'running', 'done', 'failed')),
      attempts        integer NOT NULL DEFAULT 0,
      last_error      text,
      run_after       timestamptz NOT NULL DEFAULT now(),
      created_at      timestamptz NOT NULL DEFAULT now()
    )
  `);
  await db.query("CREATE INDEX IF NOT EXISTS xui_jobs_due_idx ON xui_jobs(state, run_after)");
}
