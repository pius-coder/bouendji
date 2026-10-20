/**
 * Single source of truth for the schema. Postgres-compatible, no extensions
 * required so the same file runs on PGlite (dev/tests) and Postgres (prod).
 */
export const SCHEMA_SQL = /* sql */ `
CREATE TABLE IF NOT EXISTS communities (
  id            text PRIMARY KEY,
  name          text NOT NULL,
  slug          text NOT NULL UNIQUE,
  status        text NOT NULL DEFAULT 'active',
  commission_bps integer NOT NULL DEFAULT 2000,
  payout_phone  text,
  payout_name   text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS apps (
  id              text PRIMARY KEY,
  community_id    text NOT NULL REFERENCES communities(id),
  slug            text NOT NULL UNIQUE,
  name            text NOT NULL,
  package_name    text NOT NULL UNIQUE,
  theme           text NOT NULL DEFAULT 'halo',
  accent          text,
  appearance      text NOT NULL DEFAULT 'auto',
  logo_url        text,
  support_email   text,
  support_url     text,
  privacy_url     text,
  terms_url       text,
  consent_version text NOT NULL DEFAULT '2026-01',
  min_version_code integer NOT NULL DEFAULT 1,
  store_url       text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id                text PRIMARY KEY,
  app_id            text NOT NULL REFERENCES apps(id),
  community_id      text NOT NULL REFERENCES communities(id),
  email             text NOT NULL,
  password_hash     text NOT NULL,
  name              text NOT NULL,
  locale            text NOT NULL DEFAULT 'fr',
  email_verified_at timestamptz,
  deleted_at        timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (email)
);

CREATE TABLE IF NOT EXISTS devices (
  id                text PRIMARY KEY,
  user_id           text REFERENCES users(id) ON DELETE CASCADE,
  installation_id   text NOT NULL UNIQUE,
  name              text NOT NULL,
  platform          text NOT NULL DEFAULT 'android',
  signing_key       text NOT NULL,
  agreement_key     text NOT NULL,
  status            text NOT NULL DEFAULT 'enrolled',
  device_token_hash text NOT NULL,
  app_version       text,
  android_version   integer,
  integrity_ok      boolean NOT NULL DEFAULT false,
  push_token        text,
  last_seen_at      timestamptz,
  revoked_at        timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS devices_user_idx ON devices(user_id);

CREATE TABLE IF NOT EXISTS device_nonces (
  nonce      text PRIMARY KEY,
  device_id  text NOT NULL,
  seen_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS enroll_challenges (
  id             text PRIMARY KEY,
  nonce          text NOT NULL,
  installation_id text NOT NULL,
  expires_at     timestamptz NOT NULL,
  used_at        timestamptz
);

CREATE TABLE IF NOT EXISTS auth_sessions (
  id            text PRIMARY KEY,
  user_id       text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id     text NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  refresh_hash  text NOT NULL UNIQUE,
  expires_at    timestamptz NOT NULL,
  revoked_at    timestamptz,
  last_used_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON auth_sessions(user_id);

CREATE TABLE IF NOT EXISTS verification_codes (
  id         text PRIMARY KEY,
  user_id    text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash  text NOT NULL,
  purpose    text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- "role" is the legacy single-tenant column: it is no longer read by the API.
-- It is still written in mirror of "platform_role" (see the migration below) so
-- that a container restart cannot silently re-promote an account that was
-- demoted through the admin API.
CREATE TABLE IF NOT EXISTS admin_users (
  id            text PRIMARY KEY,
  community_id  text REFERENCES communities(id),
  email         text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  name          text NOT NULL,
  role          text NOT NULL DEFAULT 'partner',
  platform_role text NOT NULL DEFAULT 'none',
  active        boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS plans (
  id            text PRIMARY KEY,
  app_id        text NOT NULL REFERENCES apps(id),
  code          text NOT NULL,
  name          text NOT NULL,
  description   text NOT NULL DEFAULT '',
  price_xaf     integer NOT NULL,
  duration_days integer NOT NULL,
  device_limit  integer NOT NULL DEFAULT 1,
  badge         text,
  featured      boolean NOT NULL DEFAULT false,
  active        boolean NOT NULL DEFAULT true,
  sort_order    integer NOT NULL DEFAULT 0,
  UNIQUE (app_id, code)
);

CREATE TABLE IF NOT EXISTS orders (
  id               text PRIMARY KEY,
  user_id          text NOT NULL REFERENCES users(id),
  app_id           text NOT NULL REFERENCES apps(id),
  plan_id          text NOT NULL REFERENCES plans(id),
  community_id     text NOT NULL REFERENCES communities(id),
  amount_xaf       integer NOT NULL,
  currency         text NOT NULL DEFAULT 'XAF',
  status           text NOT NULL DEFAULT 'pending',
  provider         text NOT NULL,
  provider_ref     text UNIQUE,
  payment_url      text,
  commission_bps   integer NOT NULL DEFAULT 0,
  commission_xaf   integer NOT NULL DEFAULT 0,
  utm              jsonb,
  failure_reason   text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  paid_at          timestamptz,
  activated_at     timestamptz,
  expires_at       timestamptz
);
CREATE INDEX IF NOT EXISTS orders_user_idx ON orders(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS orders_community_idx ON orders(community_id, created_at DESC);

CREATE TABLE IF NOT EXISTS subscriptions (
  id         text PRIMARY KEY,
  user_id    text NOT NULL REFERENCES users(id),
  plan_id    text NOT NULL REFERENCES plans(id),
  order_id   text NOT NULL REFERENCES orders(id),
  status     text NOT NULL DEFAULT 'active',
  starts_at  timestamptz NOT NULL,
  ends_at    timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS subs_user_idx ON subscriptions(user_id, ends_at DESC);

-- Endpoints are global supply: one deployment serves every community, so there
-- is no community_id here. A row is created by the endpoint container itself
-- calling /v1/internal/endpoints/register (see infra/endpoint/README.md).
CREATE TABLE IF NOT EXISTS endpoints (
  id              text PRIMARY KEY,
  -- Idempotency key chosen by the deployment (Cloud Run revision, VM name...).
  -- A container restart must reuse the same row, not create a second server.
  deployment_key  text NOT NULL UNIQUE,
  label           text NOT NULL,
  host            text NOT NULL,
  port            integer NOT NULL DEFAULT 443,
  protocol        text NOT NULL DEFAULT 'vless',
  transport       text NOT NULL DEFAULT 'ws',
  security        text NOT NULL DEFAULT 'tls',
  sni             text,
  ws_path         text,
  -- AES-GCM sealed with MASTER_KEY. Decrypted only when a bundle is built.
  credential      text NOT NULL,
  -- 'shared': one UUID for the whole deployment (what Cloud Run can do).
  -- 'per_device': identity is derived per device, requires a resident server.
  identity_mode   text NOT NULL DEFAULT 'shared',
  region          text NOT NULL DEFAULT 'auto',
  capacity        integer NOT NULL DEFAULT 80,
  in_use          integer NOT NULL DEFAULT 0,
  -- pending -> active -> draining -> expired. 'failed' means it never served.
  status          text NOT NULL DEFAULT 'pending',
  health          text NOT NULL DEFAULT 'unknown',
  latency_ms      integer,
  health_checked_at timestamptz,
  agent_version   text,
  last_seen_at    timestamptz,
  -- Authoritative lifetime. Never extended by a restart or a heartbeat.
  expires_at      timestamptz NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS endpoints_pool_idx ON endpoints(status, expires_at);

-- Monotonic counter. The app only re-pulls its encrypted bundle when this
-- number moves, so adding or expiring a server must bump it.
CREATE TABLE IF NOT EXISTS pool_state (
  id         text PRIMARY KEY,
  revision   bigint NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO pool_state (id, revision) VALUES ('pool', 1) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS config_grants (
  id          text PRIMARY KEY,
  user_id     text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id   text NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  endpoint_id text NOT NULL REFERENCES endpoints(id),
  identity    text NOT NULL,
  issued_at   timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,
  revoked_at  timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS grants_device_endpoint_idx ON config_grants(device_id, endpoint_id);

CREATE TABLE IF NOT EXISTS bundles (
  id           text PRIMARY KEY,
  user_id      text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id    text NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  revision     integer NOT NULL,
  config_count integer NOT NULL,
  payload      jsonb NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL,
  UNIQUE (device_id)
);

CREATE TABLE IF NOT EXISTS commissions (
  id           text PRIMARY KEY,
  community_id text NOT NULL REFERENCES communities(id),
  order_id     text NOT NULL UNIQUE REFERENCES orders(id),
  bps          integer NOT NULL,
  amount_xaf   integer NOT NULL,
  status       text NOT NULL DEFAULT 'pending',
  payout_id    text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  available_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS commissions_community_idx ON commissions(community_id, status);

CREATE TABLE IF NOT EXISTS payouts (
  id           text PRIMARY KEY,
  community_id text NOT NULL REFERENCES communities(id),
  amount_xaf   integer NOT NULL,
  status       text NOT NULL DEFAULT 'pending',
  provider_ref text UNIQUE,
  note         text,
  created_by   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  paid_at      timestamptz
);

CREATE TABLE IF NOT EXISTS webhook_events (
  id           text PRIMARY KEY,
  provider     text NOT NULL,
  event_id     text NOT NULL,
  payload_hash text NOT NULL,
  status       text NOT NULL DEFAULT 'received',
  error        text,
  received_at  timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  UNIQUE (provider, event_id)
);

CREATE TABLE IF NOT EXISTS support_tickets (
  id         text PRIMARY KEY,
  user_id    text NOT NULL REFERENCES users(id),
  app_id     text NOT NULL REFERENCES apps(id),
  subject    text NOT NULL,
  status     text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS support_messages (
  id         text PRIMARY KEY,
  ticket_id  text NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  author     text NOT NULL,
  body       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS diagnostics (
  id         text PRIMARY KEY,
  user_id    text NOT NULL REFERENCES users(id),
  device_id  text NOT NULL,
  payload    jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS campaigns (
  id         text PRIMARY KEY,
  app_id     text NOT NULL REFERENCES apps(id),
  code       text NOT NULL,
  name       text NOT NULL,
  active     boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (app_id, code)
);

CREATE TABLE IF NOT EXISTS campaign_claims (
  id          text PRIMARY KEY,
  user_id     text NOT NULL REFERENCES users(id),
  campaign_id text NOT NULL REFERENCES campaigns(id),
  claimed_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, campaign_id)
);

CREATE TABLE IF NOT EXISTS app_versions (
  id           text PRIMARY KEY,
  app_id       text NOT NULL REFERENCES apps(id),
  version_code integer NOT NULL,
  version_name text NOT NULL,
  min_sdk      integer NOT NULL DEFAULT 26,
  sha256       text NOT NULL,
  download_url text NOT NULL,
  changelog    text,
  published_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (app_id, version_code)
);

CREATE TABLE IF NOT EXISTS builds (
  id           text PRIMARY KEY,
  app_id       text NOT NULL REFERENCES apps(id),
  version_code integer NOT NULL,
  version_name text NOT NULL,
  theme        text NOT NULL,
  status       text NOT NULL DEFAULT 'queued',
  run_id       text,
  artifact_url text,
  sha256       text,
  log_url      text,
  requested_by text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE TABLE IF NOT EXISTS announcements (
  id         text PRIMARY KEY,
  app_id     text REFERENCES apps(id),
  title      text NOT NULL,
  body       text NOT NULL,
  level      text NOT NULL DEFAULT 'info',
  active     boolean NOT NULL DEFAULT true,
  published_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_log (
  id         text PRIMARY KEY,
  actor_id   text,
  actor_type text NOT NULL,
  action     text NOT NULL,
  target     text,
  meta       jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

/* =====================================================================
 * Compatible migrations.
 *
 * Everything below is additive: ADD COLUMN IF NOT EXISTS, CREATE TABLE IF NOT
 * EXISTS, CREATE INDEX IF NOT EXISTS. Nothing is dropped or renamed, because
 * the same file is replayed on every boot (see db.ts) and on databases that
 * already carry data. Column names are snake_case like the rest of the
 * schema; "before"/"after" are avoided because they are SQL keywords - the
 * audit trail uses before_state / after_state.
 * ===================================================================== */

-- Legacy "role" ('platform' | 'partner') -> "platform_role" ('owner' | 'none').
-- Idempotent: the WHERE clause only promotes rows still at the default, and the
-- admin API keeps the legacy column mirrored so a demotion is never undone.
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS platform_role text NOT NULL DEFAULT 'none';
UPDATE admin_users
   SET platform_role = 'owner'
 WHERE platform_role = 'none' AND role = 'platform';

-- Staff permissions are local to a community. The global identity is either
-- 'owner' (everything) or 'none' (only what a membership grants).
CREATE TABLE IF NOT EXISTS community_memberships (
  id            text PRIMARY KEY,
  admin_user_id text NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  community_id  text NOT NULL REFERENCES communities(id),
  role          text NOT NULL,
  status        text NOT NULL DEFAULT 'active',
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (admin_user_id, community_id)
);
CREATE INDEX IF NOT EXISTS memberships_community_idx
  ON community_memberships(community_id, role, status);

-- One row per device-bound offline authorization. 'consumed_at' is set once:
-- the single-use property is enforced by the consuming query, not here.
CREATE TABLE IF NOT EXISTS offline_bundles (
  id          text PRIMARY KEY,
  device_id   text NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  user_id     text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_by  text,
  not_after   timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS offline_bundles_device_idx
  ON offline_bundles(device_id, consumed_at);

-- Audit columns required by the admin surface. 'target'/'meta' stay for the
-- rows written by services/payments.ts; new rows fill both forms.
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS actor_role   text;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS target_type  text;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS target_id    text;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS community_id text;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS ip           text;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS user_agent   text;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS before_state jsonb;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS after_state  jsonb;
CREATE INDEX IF NOT EXISTS audit_log_community_idx
  ON audit_log(community_id, created_at DESC);

-- Rotation chain of a refresh token. 'replaced_by_id' is the session created by
-- the rotation that killed this row, 'replaced_at' the instant it happened. The
-- pair is what makes a lost response recoverable: a replay of the *just*
-- replaced token, from the same device and inside the tolerance window, is
-- treated as a retry (routes/auth.ts), not as theft. Outside that window it is
-- theft, and the whole chain is revoked.
ALTER TABLE auth_sessions ADD COLUMN IF NOT EXISTS replaced_by_id text;
ALTER TABLE auth_sessions ADD COLUMN IF NOT EXISTS replaced_at    timestamptz;
-- The chain is walked in both directions (forward via replaced_by_id, backward
-- by looking for rows that point at it), so the reverse lookup needs an index.
CREATE INDEX IF NOT EXISTS sessions_replaced_by_idx ON auth_sessions(replaced_by_id);

-- Append-only at the database level: an UPDATE or DELETE issued by any code
-- path (including a future bug or a psql session) is a no-op instead of a
-- silent rewrite of the trail.
CREATE OR REPLACE RULE audit_log_no_update AS
  ON UPDATE TO audit_log DO INSTEAD NOTHING;
CREATE OR REPLACE RULE audit_log_no_delete AS
  ON DELETE TO audit_log DO INSTEAD NOTHING;
`;
