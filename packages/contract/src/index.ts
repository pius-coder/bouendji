/**
 * Shared wire types. These mirror the mobile contract (Contrat-API-mobile.md).
 * Keep field names snake-free (camelCase) and dates as ISO-8601 strings.
 */

export type IsoDate = string;
export type Ulid = string;

export type Appearance = "light" | "dark" | "auto";
export type ThemeId = "halo" | "mono" | "vector" | "otaku";
export type Platform = "android" | "ios";

export type DeviceStatus = "enrolled" | "active" | "revoked";
export type SubscriptionStatus = "active" | "expired" | "canceled";
export type OrderStatus = "pending" | "paid" | "failed" | "refunded" | "expired";
export type CommissionStatus = "pending" | "available" | "paid" | "reversed";
export type PayoutStatus = "pending" | "processing" | "paid" | "failed";
export type BuildStatus = "queued" | "running" | "succeeded" | "failed";
export type TicketStatus = "open" | "pending" | "resolved";
export type AdminRole = "platform" | "partner";

/** Error envelope returned by every non-2xx response. */
export interface ApiError {
  error: {
    code: string;
    message: string;
    retryAfter?: number;
    /** Non-sensitive field level details. */
    details?: Record<string, string>;
    requestId?: string;
  };
}

export interface PublicApp {
  id: Ulid;
  slug: string;
  name: string;
  packageName: string;
  theme: ThemeId;
  accent: string | null;
  appearance: Appearance;
  logoUrl: string | null;
  supportEmail: string | null;
  supportUrl: string | null;
  privacyUrl: string | null;
  termsUrl: string | null;
  downloadUrl: string;
  consentVersion: string;
  community: { id: Ulid; slug: string; name: string };
}

export interface Device {
  id: Ulid;
  name: string;
  platform: Platform;
  status: DeviceStatus;
  current: boolean;
  lastSeenAt: IsoDate | null;
  createdAt: IsoDate;
}

export interface EnrollRequest {
  installationId: string;
  deviceName: string;
  platform: Platform;
  /** Base64 SPKI, EC P-256, PURPOSE_SIGN. */
  signingKey: string;
  /** Base64 SPKI, EC P-256, PURPOSE_AGREE. */
  agreementKey: string;
  /** Optional Play Integrity token; empty when unavailable. */
  integrityToken?: string;
  appVersion: string;
  androidVersion: number;
}

export interface EnrollResponse {
  deviceId: Ulid;
  deviceToken: string;
  serverTime: IsoDate;
}

export interface ChallengeRequest {
  installationId: string;
  purpose: "enroll" | "login" | "refresh";
}
export interface Challenge {
  challengeId: Ulid;
  nonce: string;
  expiresAt: IsoDate;
  serverTime: IsoDate;
}

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  accessExpiresAt: IsoDate;
  refreshExpiresAt: IsoDate;
  user: User;
  device: Device;
}

export interface User {
  id: Ulid;
  email: string;
  name: string;
  locale: string;
  emailVerified: boolean;
  communityId: Ulid;
  createdAt: IsoDate;
}

export interface Me {
  user: User;
  community: { id: Ulid; slug: string; name: string };
  entitlement: Entitlement;
  device: Device;
  devicesUsed: number;
  devicesLimit: number;
}

export interface Entitlement {
  active: boolean;
  planCode: string | null;
  planName: string | null;
  startsAt: IsoDate | null;
  endsAt: IsoDate | null;
  daysRemaining: number;
  deviceLimit: number;
  /** True while a paid order is being provisioned. Drives the "activation en cours" screen. */
  activationPending: boolean;
}

export interface Plan {
  id: Ulid;
  code: string;
  name: string;
  description: string;
  priceXaf: number;
  currency: "XAF";
  durationDays: number;
  deviceLimit: number;
  badge: string | null;
  featured: boolean;
}

export interface Order {
  id: Ulid;
  status: OrderStatus;
  amountXaf: number;
  currency: "XAF";
  plan: { id: Ulid; code: string; name: string; durationDays: number };
  paymentUrl: string | null;
  createdAt: IsoDate;
  paidAt: IsoDate | null;
  /** Set once the webhook is processed and the subscription is active. */
  accessActivatedAt: IsoDate | null;
  failureReason: string | null;
}

export interface OrdersPage {
  items: Order[];
  nextCursor: string | null;
}

export interface Sync {
  serverTime: IsoDate;
  entitlement: Entitlement;
  bundleRevision: number;
  bundleExpiresAt: IsoDate | null;
  announcements: Announcement[];
  minAppVersion: { versionCode: number; versionName: string; storeUrl: string | null } | null;
  device: Device;
}

export interface Announcement {
  id: string;
  title: string;
  body: string;
  level: "info" | "warning" | "critical";
  publishedAt: IsoDate;
}

/** Encrypted envelope. The server never sees a plaintext VLESS URI after sealing. */
export interface SealedEnvelope {
  version: 1;
  /** Base64 SPKI of the server ephemeral EC P-256 key. */
  ephemeralKey: string;
  /** Base64 16-byte HKDF salt. */
  salt: string;
  /** Base64 12-byte AES-GCM IV. */
  iv: string;
  /** Base64 ciphertext (config array JSON, UTF-8). */
  ciphertext: string;
  /** Base64 16-byte GCM tag. */
  tag: string;
  /** SHA-256 of the plaintext payload, base64. Lets the client detect a bad key. */
  digest: string;
}

export interface ConfigurationBundle {
  revision: number;
  issuedAt: IsoDate;
  expiresAt: IsoDate;
  configCount: number;
  envelope: SealedEnvelope;
}

/** Plaintext shape, only ever present inside the encrypted envelope. */
export interface VlessConfig {
  id: string;
  label: string;
  /** vless:// URI. Never log this. */
  uri: string;
  expiresAt: IsoDate;
  /** Advisory only; the client measures real latency. */
  region: string;
}

export interface Ticket {
  id: Ulid;
  subject: string;
  status: TicketStatus;
  createdAt: IsoDate;
  updatedAt: IsoDate;
  messages: TicketMessage[];
}
export interface TicketMessage {
  id: Ulid;
  author: "user" | "support";
  body: string;
  createdAt: IsoDate;
}
export interface TicketsPage {
  items: Ticket[];
  nextCursor: string | null;
}

export interface CampaignClaim {
  id: Ulid;
  code: string;
  name: string;
  claimedAt: IsoDate;
}

export interface UpdateInfo {
  versionCode: number;
  versionName: string;
  minSdk: number;
  sha256: string;
  downloadUrl: string;
  changelog: string | null;
  publishedAt: IsoDate;
}

/* ------------------------------------------------------------------ admin */

export interface AdminSession {
  token: string;
  expiresAt: IsoDate;
  admin: {
    id: Ulid;
    email: string;
    name: string;
    role: AdminRole;
    communityId: Ulid | null;
  };
}

export interface AdminOverview {
  revenueXaf: number;
  revenue30dXaf: number;
  orders30d: number;
  activeSubscribers: number;
  activeDevices: number;
  pendingPayoutXaf: number;
  availablePayoutXaf: number;
  failedBuilds: number;
  series: Array<{ date: string; revenueXaf: number; orders: number }>;
}

export interface Community {
  id: Ulid;
  name: string;
  slug: string;
  status: "active" | "paused";
  commissionBps: number;
  subscribers: number;
  activeSubscriptions: number;
  revenue30dXaf: number;
  availableXaf: number;
  apps: Array<{ id: Ulid; name: string; packageName: string; theme: ThemeId }>;
  createdAt: IsoDate;
}

export interface AdminOrder extends Order {
  user: { id: Ulid; email: string; name: string };
  community: { id: Ulid; name: string };
  commissionXaf: number;
  commissionBps: number;
  utm: Record<string, string> | null;
}

export interface Payout {
  id: Ulid;
  community: { id: Ulid; name: string };
  amountXaf: number;
  status: PayoutStatus;
  providerRef: string | null;
  note: string | null;
  createdAt: IsoDate;
  paidAt: IsoDate | null;
}

export interface Endpoint {
  id: Ulid;
  label: string;
  host: string;
  port: number;
  protocol: "vless-reality" | "vless-tls" | "vless-ws";
  region: string;
  capacity: number;
  inUse: number;
  active: boolean;
  expiresAt: IsoDate | null;
  lastCheckAt: IsoDate | null;
  health: "healthy" | "degraded" | "down" | "unknown";
}

export interface Build {
  id: Ulid;
  app: { id: Ulid; name: string };
  versionName: string;
  versionCode: number;
  theme: ThemeId;
  status: BuildStatus;
  artifactUrl: string | null;
  sha256: string | null;
  logUrl: string | null;
  requestedBy: string;
  createdAt: IsoDate;
  completedAt: IsoDate | null;
}

export interface BrandSpec {
  slug: string;
  name: string;
  packageName: string;
  theme: ThemeId;
  accent: string | null;
  appearance: Appearance;
  logoText: string;
  supportEmail: string | null;
  supportUrl: string | null;
  privacyUrl: string | null;
  termsUrl: string | null;
  apiBaseUrl: string;
  communitySlug: string;
}

export const API_ERROR_CODES = [
  "VALIDATION_FAILED",
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "NOT_FOUND",
  "CONFLICT",
  "RATE_LIMITED",
  "DEVICE_LIMIT_REACHED",
  "DEVICE_REVOKED",
  "DEVICE_PROOF_INVALID",
  "EMAIL_NOT_VERIFIED",
  "INVALID_CREDENTIALS",
  "SUBSCRIPTION_REQUIRED",
  "ORDER_NOT_PAYABLE",
  "PAYMENT_PROVIDER_ERROR",
  "INTERNAL",
] as const;
export type ApiErrorCode = (typeof API_ERROR_CODES)[number];
