import type { FastifyRequest } from "fastify";
import { SignJWT, jwtVerify } from "jose";
import { env } from "../config.js";
import type { Database, Row } from "../db.js";
import { canonicalProof, hashToken, verifyDeviceSignature } from "./crypto.js";
import { fail } from "./errors.js";

export interface AuthContext {
  userId: string;
  deviceId: string;
  communityId: string;
  sessionId: string;
  user: Row;
  device: Row;
}

/**
 * Global identity. `owner` is a single person-shaped role, not a level: there
 * is no `super_admin` and no `admin` value to compare against (see
 * knowledge/40-money/roles-and-commissions.md).
 */
export type PlatformRole = "none" | "owner";

/** Local permission, granted per community. Never global. */
export type StaffRole = "community_admin" | "support" | "finance";

export const STAFF_ROLES: readonly StaffRole[] = ["community_admin", "support", "finance"];

export interface AdminMembership {
  id: string;
  communityId: string;
  role: StaffRole;
}

/**
 * What a request handler is allowed to know. Deliberately *not* built from the
 * token claims: the token only proves identity (`sub`), and every permission is
 * re-read from the database on each request. Deactivating an account or
 * revoking a membership therefore takes effect on the next call, even though
 * the token itself lives 8 hours.
 */
export interface AdminContext {
  adminId: string;
  platformRole: PlatformRole;
  /** Active memberships only, unknown role values filtered out. */
  memberships: AdminMembership[];
  admin: Row;
}

const encoder = new TextEncoder();
const userKey = () => encoder.encode(`user:${env.jwtSecret}`);
const adminKey = () => encoder.encode(`admin:${env.jwtSecret}`);

/**
 * D17 — two audiences, no crossing. The claims already differ by signing key
 * (`user:` vs `admin:` prefix), so an audience check is a second, independent
 * lock: a token signed with one key and claiming the other audience is refused,
 * and a future refactor that unifies the keys cannot silently merge the two
 * worlds.
 */
export const MOBILE_AUDIENCE = "vpn-mobile";
export const ADMIN_AUDIENCE = "vpn-admin";

export async function issueAccessToken(input: {
  userId: string;
  deviceId: string;
  communityId: string;
  sessionId: string;
}): Promise<{ token: string; expiresAt: Date }> {
  const expiresAt = new Date(Date.now() + env.accessTokenTtlSeconds * 1000);
  const token = await new SignJWT({
    did: input.deviceId,
    cid: input.communityId,
    sid: input.sessionId,
    typ: "user",
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(input.userId)
    .setIssuedAt()
    .setIssuer("vpn-api")
    .setAudience(MOBILE_AUDIENCE)
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(userKey());
  return { token, expiresAt };
}

export async function issueAdminToken(input: {
  adminId: string;
  role: "platform" | "partner";
  communityId: string | null;
}): Promise<{ token: string; expiresAt: Date }> {
  const expiresAt = new Date(Date.now() + 8 * 3600 * 1000);
  const token = await new SignJWT({
    role: input.role,
    cid: input.communityId,
    typ: "admin",
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(input.adminId)
    .setIssuedAt()
    .setIssuer("vpn-api")
    .setAudience(ADMIN_AUDIENCE)
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(adminKey());
  return { token, expiresAt };
}

function bearer(req: FastifyRequest): string | null {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice(7).trim();
}

export async function requireUser(db: Database, req: FastifyRequest): Promise<AuthContext> {
  const token = bearer(req);
  if (!token) throw fail.unauthenticated();

  let payload: Record<string, unknown>;
  try {
    // `audience` is checked by jose, not by hand: a token minted for the admin
    // surface has no business on a mobile route (D17).
    const result = await jwtVerify(token, userKey(), { issuer: "vpn-api", audience: MOBILE_AUDIENCE });
    payload = result.payload as Record<string, unknown>;
  } catch {
    throw fail.unauthenticated("Session expirée.");
  }
  if (payload.typ !== "user") throw fail.unauthenticated();

  const session = await db.one<Row>(
    `SELECT s.id, s.revoked_at, s.expires_at, u.id AS user_id, u.community_id, u.deleted_at,
            d.id AS device_id, d.status AS device_status, d.signing_key
       FROM auth_sessions s
       JOIN users u ON u.id = s.user_id
       JOIN devices d ON d.id = s.device_id
      WHERE s.id = $1 AND s.device_id = $2 AND s.user_id = $3`,
    [payload.sid, payload.did, payload.sub],
  );
  if (!session) throw fail.unauthenticated();
  if (session.revoked_at) throw fail.unauthenticated("Session révoquée.");
  if (new Date(session.expires_at as string).getTime() < Date.now()) throw fail.unauthenticated("Session expirée.");
  if (session.device_status === "revoked") throw fail.deviceRevoked();
  if (session.deleted_at) throw fail.unauthenticated();

  return {
    userId: session.user_id as string,
    deviceId: session.device_id as string,
    communityId: session.community_id as string,
    sessionId: session.id as string,
    user: await db.one<Row>("SELECT * FROM users WHERE id = $1", [session.user_id]) as Row,
    device: await db.one<Row>("SELECT * FROM devices WHERE id = $1", [session.device_id]) as Row,
  };
}

export async function requireDeviceByToken(db: Database, req: FastifyRequest): Promise<Row> {
  const token = req.headers["x-device-token"];
  if (typeof token !== "string" || token.length < 20) throw fail.deviceProof("Jeton d'appareil manquant.");
  const device = await db.one<Row>("SELECT * FROM devices WHERE device_token_hash = $1", [hashToken(token)]);
  if (!device) throw fail.deviceProof("Appareil inconnu.");
  if (device.status === "revoked") throw fail.deviceRevoked();
  return device;
}

export async function verifyDeviceProof(db: Database, req: FastifyRequest, device: Row): Promise<void> {
  const timestamp = req.headers["x-device-timestamp"];
  const nonce = req.headers["x-device-nonce"];
  const signature = req.headers["x-device-signature"];
  if (typeof timestamp !== "string" || typeof nonce !== "string" || typeof signature !== "string") {
    throw fail.deviceProof("En-têtes de preuve manquants.");
  }
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > 120_000) {
    throw fail.deviceProof("Horodatage hors tolérance.");
  }
  if (nonce.length < 16 || nonce.length > 80) throw fail.deviceProof("Nonce invalide.");

  const rawBody = (req as FastifyRequest & { rawBody?: string }).rawBody ?? "";
  const message = canonicalProof({
    method: req.method,
    path: req.url.split("?")[0] ?? req.url,
    body: rawBody,
    timestamp,
    nonce,
  });

  if (!verifyDeviceSignature(device.signing_key as string, message, signature)) {
    throw fail.deviceProof();
  }

  try {
    await db.query("DELETE FROM device_nonces WHERE seen_at < now() - interval '10 minutes'");
    await db.query("INSERT INTO device_nonces (nonce, device_id) VALUES ($1, $2)", [nonce, device.id]);
  } catch {
    throw fail.deviceProof("Requête rejouée.");
  }
  await db.query("UPDATE devices SET last_seen_at = now() WHERE id = $1", [device.id]);
}

export async function requireAdmin(db: Database, req: FastifyRequest): Promise<AdminContext> {
  const token = bearer(req);
  if (!token) throw fail.unauthenticated();
  let payload: Record<string, unknown>;
  try {
    const result = await jwtVerify(token, adminKey(), { issuer: "vpn-api", audience: ADMIN_AUDIENCE });
    payload = result.payload as Record<string, unknown>;
  } catch {
    throw fail.unauthenticated("Session administrateur expirée.");
  }
  if (payload.typ !== "admin") throw fail.forbidden();
  const admin = await db.one<Row>("SELECT * FROM admin_users WHERE id = $1 AND active = true", [payload.sub]);
  if (!admin) throw fail.forbidden("Compte administrateur désactivé.");

  const rows = await db.query<Row>(
    `SELECT id, community_id, role
       FROM community_memberships
      WHERE admin_user_id = $1 AND status = 'active'
      ORDER BY community_id`,
    [admin.id],
  );
  // A row with an unexpected role grants nothing: the filter is an allow-list.
  const memberships: AdminMembership[] = rows
    .filter((row) => STAFF_ROLES.includes(row.role as StaffRole) && typeof row.community_id === "string")
    .map((row) => ({ id: row.id as string, communityId: row.community_id as string, role: row.role as StaffRole }));

  const platformRole: PlatformRole = admin.platform_role === "owner" ? "owner" : "none";

  return {
    adminId: admin.id as string,
    platformRole,
    memberships,
    admin,
  };
}

/** The staff role this admin holds in one community, if any. */
export function roleInCommunity(admin: AdminContext, communityId: string): StaffRole | null {
  return admin.memberships.find((m) => m.communityId === communityId)?.role ?? null;
}

/**
 * Resolves the community a request may act on.
 *
 * `requested` always comes from the URL (path or query), never from a body: a
 * body-supplied community id is dropped by validation. An owner may target any
 * community; anybody else is confined to their memberships, and a foreign id is
 * a 403 rather than a 404 - the caller is authenticated, the boundary is what
 * they crossed (the test suite pins this).
 *
 * With no explicit target, a single-membership admin is implicitly scoped; an
 * admin with several memberships must say which one.
 */
export function scopedCommunity(admin: AdminContext, requested?: string | null): string | null {
  if (admin.platformRole === "owner") return requested ?? null;
  if (!requested) {
    const first = admin.memberships[0];
    if (!first) throw fail.forbidden("Aucune communauté rattachée à ce compte.");
    if (admin.memberships.length > 1) {
      throw fail.validation({ community_id: "Communauté requise : ce compte en gère plusieurs." });
    }
    return first.communityId;
  }
  if (!roleInCommunity(admin, requested)) throw fail.forbidden("Communauté hors de votre périmètre.");
  return requested;
}
