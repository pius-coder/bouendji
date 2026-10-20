import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function int(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

const isTest = process.env.NODE_ENV === "test";

/** 32-byte master key, base64. Generated in dev only, never in production. */
function masterKey(): Buffer {
  const raw = process.env.MASTER_KEY;
  if (raw) {
    const buf = Buffer.from(raw, "base64");
    if (buf.length !== 32) throw new Error("MASTER_KEY must be 32 bytes base64");
    return buf;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("MASTER_KEY is required in production");
  }
  return Buffer.alloc(32, 7); // deterministic dev key
}

const dataDir = resolve(process.cwd(), "data");
if (!existsSync(dataDir) && !process.env.DATABASE_URL?.startsWith("postgres")) {
  mkdirSync(dataDir, { recursive: true });
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  isTest,
  isProduction: process.env.NODE_ENV === "production",
  host: process.env.HOST ?? "0.0.0.0",
  port: int(process.env.PORT, 8080),
  publicBaseUrl: process.env.PUBLIC_BASE_URL ?? "http://localhost:8080",
  databaseUrl: process.env.DATABASE_URL ?? resolve(dataDir, "pg"),
  masterKey: masterKey(),
  jwtSecret: process.env.JWT_SECRET ?? (isTest ? "test-secret-test-secret-test-secret" : randomBytes(32).toString("base64")),
  accessTokenTtlSeconds: int(process.env.ACCESS_TOKEN_TTL, 900),
  refreshTokenTtlDays: int(process.env.REFRESH_TOKEN_TTL_DAYS, 45),
  allowedOrigins: (process.env.ALLOWED_ORIGINS ?? "http://localhost:5173,http://localhost:8080").split(","),
  paymentProvider: (process.env.PAYMENT_PROVIDER ?? "mock") as "mock" | "fapshi",
  fapshi: {
    baseUrl: process.env.FAPSHI_BASE_URL ?? "https://live.fapshi.com",
    apiUser: process.env.FAPSHI_API_USER ?? "",
    apiKey: process.env.FAPSHI_API_KEY ?? "",
    webhookSecret: process.env.FAPSHI_WEBHOOK_SECRET ?? "",
    payoutUser: process.env.FAPSHI_PAYOUT_USER ?? "",
    payoutKey: process.env.FAPSHI_PAYOUT_KEY ?? "",
    /** Re-fetch the transaction status instead of trusting the webhook body. */
    verifyWithApi: bool(process.env.FAPSHI_VERIFY_WITH_API, true),
  },
  mailer: {
    driver: (process.env.MAIL_DRIVER ?? "console") as "console" | "resend",
    resendKey: process.env.RESEND_API_KEY ?? "",
    from: process.env.MAIL_FROM ?? "no-reply@example.com",
  },
  integrity: {
    /** When false, Play Integrity tokens are stored but not enforced (dev builds). */
    enforce: bool(process.env.ENFORCE_PLAY_INTEGRITY, false),
  },
  builds: {
    mock: bool(process.env.MOCK_BUILDS, process.env.NODE_ENV !== "production"),
    githubToken: process.env.GITHUB_TOKEN ?? "",
    repo: process.env.GITHUB_REPO ?? "",
    workflow: process.env.GITHUB_WORKFLOW ?? "android-brand.yml",
    ref: process.env.GITHUB_REF ?? "main",
    publicBaseUrl: process.env.BUILDS_BASE_URL ?? "",
  },
  /**
   * Per-route throttling. The global ceiling in app.ts is a blunt instrument
   * (300/min); these are the limits that actually matter.
   *
   * `enforce` is off in tests by default: the existing suites run dozens of
   * logins and bundle pulls from a single injected IP, and a strict budget
   * would turn them red for a reason unrelated to what they assert. Tests that
   * cover throttling set `RATE_LIMIT_ENFORCE=1` themselves (see
   * test/hardening.test.ts). In development and production it is on.
   */
  rateLimit: {
    enforce: bool(process.env.RATE_LIMIT_ENFORCE, !isTest),
    auth: {
      max: int(process.env.RATE_LIMIT_AUTH_MAX, 10),
      /** Same budget for the per-email counter (lib/attempts.ts). */
      windowMs: int(process.env.RATE_LIMIT_AUTH_WINDOW_SECONDS, 15 * 60) * 1000,
      /** @fastify/rate-limit accepts a string window ("15 minutes"). */
      window: process.env.RATE_LIMIT_AUTH_WINDOW ?? "15 minutes",
    },
    bundle: {
      max: int(process.env.RATE_LIMIT_BUNDLE_MAX, 30),
      window: process.env.RATE_LIMIT_BUNDLE_WINDOW ?? "1 minute",
    },
  },
  seed: {
    adminEmail: process.env.SEED_ADMIN_EMAIL ?? "admin@example.com",
    adminPassword: process.env.SEED_ADMIN_PASSWORD ?? "",
    communityName: process.env.SEED_COMMUNITY_NAME ?? "Bouendji",
    communitySlug: process.env.SEED_COMMUNITY_SLUG ?? "bouendji",
    appName: process.env.SEED_APP_NAME ?? "Bouendji VPN",
    packageName: process.env.SEED_PACKAGE_NAME ?? "cm.bouendji.vpn",
  },
  /**
   * Operations channel only. It is never used to carry a configuration, an
   * UUID or a payment credential: `services/telegram.ts` scrubs those patterns
   * before anything leaves the process.
   */
  telegram: {
    enabled: bool(process.env.TELEGRAM_ENABLED, false),
    botToken: process.env.TELEGRAM_BOT_TOKEN ?? "",
    chatId: process.env.TELEGRAM_CHAT_ID ?? "",
    /** Warn this long before the youngest endpoint dies, so a new one can ship. */
    deployWarnMinutes: int(process.env.DEPLOY_WARN_MINUTES, 30),
  },
  /**
   * Offline bundle signing. The private key never leaves the server; the public
   * half is pinned in the APK at build time (`BrandTokens.offlineBundleSigningKeyB64`).
   * Absent key = feature off, with an explicit 503 rather than an unsigned file.
   */
  offline: {
    signingKey: process.env.OFFLINE_BUNDLE_SIGNING_KEY ?? "",
    ttlMinutes: int(process.env.OFFLINE_BUNDLE_TTL_MINUTES, 60),
  },
  /**
   * Endpoint containers push their own configuration here at boot. The secret
   * is a single high-entropy bearer token shared with the deployments; when it
   * is empty, registration is refused rather than left open.
   */
  ingest: {
    secret: process.env.ENDPOINT_INGEST_SECRET ?? (isTest ? "test-ingest-secret" : ""),
    /** Skip manual approval: pending endpoints become active on 'ready'. */
    autoApprove: bool(process.env.ENDPOINT_AUTO_APPROVE, process.env.NODE_ENV !== "production"),
    minTtlSeconds: int(process.env.ENDPOINT_MIN_TTL, 3_600),
    maxTtlSeconds: int(process.env.ENDPOINT_MAX_TTL, 30 * 86_400),
    /**
     * A Cloud Run deployment lives 4 h. The Xray *process* can outlive that,
     * but every VLESS-over-WS connection is capped at 60 min by the platform,
     * so the client rotates its tunnel well before the cap.
     */
    defaultTtlSeconds: int(process.env.ENDPOINT_DEFAULT_TTL, 16_200),
    /** Stop advertising this long before the endpoint dies, in seconds. */
    drainLeadSeconds: int(process.env.ENDPOINT_DRAIN_LEAD, 900),
    /** How long a client keeps one tunnel before rotating it (55 min < 60 min cap). */
    reconnectAfterSeconds: int(process.env.ENDPOINT_RECONNECT_AFTER, 3_300),
    /** Node reconciliation cadence: revocations and new devices land within this window. */
    heartbeatSeconds: int(process.env.ENDPOINT_HEARTBEAT, 30),
  },
};
