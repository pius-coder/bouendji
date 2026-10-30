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

/**
 * Signing key for access tokens.
 *
 * In production it is **required**: a random per-process default would mean
 * that two Cloud Run revisions reject each other's tokens, and that every
 * deploy silently logs everyone out. Failing at boot is the honest behaviour.
 */
function jwtSecret(): string {
  const raw = process.env.JWT_SECRET;
  if (raw !== undefined && raw.length >= 32) return raw;
  if (process.env.NODE_ENV === "production") {
    throw new Error("JWT_SECRET is required in production (32 characters minimum)");
  }
  if (isTest) return "test-secret-test-secret-test-secret";
  return randomBytes(32).toString("base64");
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
  jwtSecret: jwtSecret(),
  accessTokenTtlSeconds: int(process.env.ACCESS_TOKEN_TTL, 900),
  refreshTokenTtlDays: int(process.env.REFRESH_TOKEN_TTL_DAYS, 45),
  allowedOrigins: (process.env.ALLOWED_ORIGINS ?? "http://localhost:5173,http://localhost:8080").split(","),
  paymentProvider: (process.env.PAYMENT_PROVIDER ?? "mock") as "mock" | "fapshi",
  /** Avis affiché avant la redirection vers le paiement (ex. Orange Money indisponible). Vide = aucun avis. */
  paymentNotice: (process.env.PAYMENT_NOTICE ?? "").trim(),
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
    ref: process.env.GITHUB_REF ?? "master",
    publicBaseUrl: process.env.BUILDS_BASE_URL ?? "",
    /** Secret du callback CI (distinct du secret d'ingestion, D66). */
    callbackSecret: process.env.BUILD_CALLBACK_SECRET ?? "",
  },
  /**
   * Pages de téléchargement publiques (Worker `cleanforce-plus`).
   *
   * Le domaine porte le slug de la communauté en sous-domaine :
   * `https://<slug>.cleanforceplus.online`. Le lien partagé aux clients est
   * cette page, jamais l'URL brute de l'APK sur R2 : une nouvelle version
   * publiée apparaît sans réécrire le lien.
   */
  downloadPages: {
    domain: process.env.DOWNLOAD_PAGES_DOMAIN ?? "cleanforceplus.online",
  },
  /**
   * Clé d'accès de la console (D54). Elle protège les données et l'inscription,
   * pas les octets d'un export statique. Vide = dev uniquement : le garde-fou
   * de production ci-dessous refuse de démarrer sans elle.
   */
  admin: {
    accessKey: process.env.DASHBOARD_ACCESS_KEY ?? "",
  },
  /** Secret dédié aux sondes d'exploitation ; distinct des secrets métier. */
  health: {
    checkKey: process.env.HEALTHCHECK_KEY ?? (isTest ? "test-health-check-key" : ""),
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
    /**
     * Ancien destinataire unique, gardé en repli. Les destinataires réels sont
     * les `telegram_chat_id` des comptes owner et reseau (services/telegram.ts).
     */
    chatId: process.env.TELEGRAM_CHAT_ID ?? "",
    /** Premier rappel, en minutes avant le début d'un créneau de nuit (D119). */
    deployWarnMinutes: int(process.env.DEPLOY_WARN_MINUTES, 15),
    /** Relance, en minutes, tant qu'aucun nœud n'est actif pour le créneau. */
    repeatMinutes: int(process.env.DEPLOY_REMIND_EVERY_MINUTES, 5),
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
    /**
     * Durée de vie d'un nœud de nuit, enregistré avec une clé de créneau (D124).
     * 4 h exactement, comme un créneau : sans cela un nœud de 20 h vivrait
     * jusqu'à 00 h 30 et chevaucherait le créneau de minuit.
     */
    nightTtlSeconds: int(process.env.NIGHT_NODE_TTL_SECONDS, 14_400),
    /** Stop advertising this long before the endpoint dies, in seconds. */
    drainLeadSeconds: int(process.env.ENDPOINT_DRAIN_LEAD, 900),
    /** How long a client keeps one tunnel before rotating it (55 min < 60 min cap). */
    reconnectAfterSeconds: int(process.env.ENDPOINT_RECONNECT_AFTER, 3_300),
    /** Node reconciliation cadence: revocations and new devices land within this window. */
    heartbeatSeconds: int(process.env.ENDPOINT_HEARTBEAT, 30),
    /** Tolerance on `X-Ingest-Timestamp`, in seconds (D56). */
    maxSkewSeconds: int(process.env.INGEST_MAX_SKEW_SECONDS, 120),
  },
};

/*
 * Garde-fou de production (D55). Il est évalué au chargement du module : une
 * fonction Vercel qui démarre sans ces valeurs doit échouer bruyamment, pas
 * servir un paiement simulé ou une ingestion ouverte.
 *
 * Le cas qui compte est `PAYMENT_PROVIDER` : sa valeur par défaut est `mock`,
 * et les routes `/pay/mock/:ref/confirm` confirment un paiement sans argent.
 */
if (process.env.NODE_ENV === "production") {
  const missing = [
    ["MASTER_KEY", process.env.MASTER_KEY],
    ["JWT_SECRET", process.env.JWT_SECRET],
    ["DATABASE_URL (postgres)", process.env.DATABASE_URL?.startsWith("postgres") ? "ok" : ""],
    ["ENDPOINT_INGEST_SECRET", process.env.ENDPOINT_INGEST_SECRET],
    ["DASHBOARD_ACCESS_KEY", process.env.DASHBOARD_ACCESS_KEY],
    ["BUILD_CALLBACK_SECRET", process.env.BUILD_CALLBACK_SECRET],
    ["HEALTHCHECK_KEY", process.env.HEALTHCHECK_KEY],
    ["FAPSHI_WEBHOOK_SECRET", process.env.FAPSHI_WEBHOOK_SECRET],
    ["PAYMENT_PROVIDER=fapshi", process.env.PAYMENT_PROVIDER === "fapshi" ? "ok" : ""],
  ]
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missing.length > 0) {
    throw new Error(`Configuration de production incomplète : ${missing.join(", ")}`);
  }
}
