import type { FastifyRequest } from "fastify";
import { SignJWT, jwtVerify } from "jose";
import { env } from "../config.js";
import type { Database, Queryable, Row } from "../db.js";
import { canonicalProof, hashToken, newId, verifyDeviceSignature } from "./crypto.js";
import type { ApiErrorCode } from "@vpn/contract";
import { ApiFailure, fail } from "./errors.js";

export interface AuthContext {
  userId: string;
  deviceId: string;
  communityId: string;
  sessionId: string;
  user: Row;
  device: Row;
}

/**
 * Rôles plateforme, cumulables : une personne peut être `owner` et `reseau`
 * (D120). Le rang sert seulement à la forme historique `platformRole` :
 * owner > reseau > none. Les décisions se prennent sur `platformRoles`.
 * `owner` est une qualité de personne, pas un niveau : il n'existe pas de
 * `super_admin` (knowledge/40-money/roles-and-commissions.md).
 */
export type PlatformRoleName = "owner" | "reseau";
export type PlatformRole = "none" | PlatformRoleName;

export const PLATFORM_ROLES: readonly PlatformRoleName[] = ["owner", "reseau"];

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
 * token claims: the token only proves identity (`sub`) and a session (`sid`),
 * and every permission is re-read from the database on each request.
 * Deactivating an account, revoking a membership or revoking the session takes
 * effect on the next call, even though the token itself lives 8 hours.
 */
export interface AdminContext {
  adminId: string;
  /** Session révocable qui a produit le jeton (claim `sid`). */
  sessionId: string;
  /** Rang le plus haut porté : owner, puis reseau, sinon none. */
  platformRole: PlatformRole;
  /** Tous les rôles portés, dans l'ordre de PLATFORM_ROLES. */
  platformRoles: readonly PlatformRoleName[];
  /** Active memberships only, unknown role values filtered out. */
  memberships: AdminMembership[];
  /** Tant que vrai, seules les routes de compte sont accessibles (garde app.ts). */
  mustChangePassword: boolean;
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

/** Durée d'un jeton administrateur. La révocation passe par la session, pas par ce délai. */
export const ADMIN_TOKEN_TTL_MS = 8 * 3600 * 1000;

/** `last_seen_at` n'est écrit qu'au plus une fois par minute : pas une écriture par requête. */
const SESSION_TOUCH_INTERVAL = "1 minute";

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

/** Signe un jeton administrateur rattaché à une session existante. */
export async function issueAdminToken(input: {
  adminId: string;
  sessionId: string;
}): Promise<{ token: string; expiresAt: Date }> {
  const expiresAt = new Date(Date.now() + ADMIN_TOKEN_TTL_MS);
  const token = await new SignJWT({
    sid: input.sessionId,
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

/**
 * Ouvre une session révocable et signe son jeton. C'est le seul chemin de
 * fabrication d'un jeton administrateur : sans ligne `admin_sessions`, le jeton
 * n'ouvre rien.
 */
export async function openAdminSession(
  q: Queryable,
  input: { adminId: string; userAgent?: string | null },
): Promise<{ token: string; expiresAt: Date; sessionId: string }> {
  const sessionId = newId();
  await q.query("INSERT INTO admin_sessions (id, admin_id, user_agent) VALUES ($1, $2, $3)", [
    sessionId,
    input.adminId,
    input.userAgent ? input.userAgent.slice(0, 300) : null,
  ]);
  const { token, expiresAt } = await issueAdminToken({ adminId: input.adminId, sessionId });
  return { token, expiresAt, sessionId };
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

/**
 * Une seule lecture par requête. La garde de `app.ts` et la route appellent
 * `requireAdmin` : la seconde reprend le résultat de la première, sans seconde
 * série de requêtes, et une erreur reste la même pour toute la requête.
 */
const adminByRequest = new WeakMap<object, Promise<AdminContext>>();

export function requireAdmin(db: Database, req: FastifyRequest): Promise<AdminContext> {
  const known = adminByRequest.get(req);
  if (known) return known;
  const pending = loadAdmin(db, req);
  adminByRequest.set(req, pending);
  return pending;
}

async function loadAdmin(db: Database, req: FastifyRequest): Promise<AdminContext> {
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
  if (typeof payload.sid !== "string" || typeof payload.sub !== "string") throw fail.unauthenticated();

  // La session est lue avant le compte : une session révoquée meurt même si le
  // compte reste actif, et une session d'un autre compte n'existe pas pour lui.
  const session = await db.one<Row>("SELECT id, admin_id, revoked_at FROM admin_sessions WHERE id = $1", [payload.sid]);
  if (!session || session.admin_id !== payload.sub || session.revoked_at) {
    throw fail.unauthenticated("Session révoquée.");
  }
  await db.query(
    `UPDATE admin_sessions SET last_seen_at = now()
      WHERE id = $1 AND last_seen_at < now() - interval '${SESSION_TOUCH_INTERVAL}'`,
    [session.id],
  );

  const admin = await db.one<Row>("SELECT * FROM admin_users WHERE id = $1 AND active = true", [payload.sub]);
  if (!admin) throw fail.forbidden("Compte administrateur désactivé.");

  return buildAdminContext(db, admin, String(session.id));
}

/**
 * Relit rôles et appartenances d'un compte déjà authentifié. Sert à la requête
 * (`requireAdmin`) et à la réponse de connexion, qui doit dire la même chose.
 */
export async function buildAdminContext(db: Queryable, admin: Row, sessionId: string): Promise<AdminContext> {
  const roleRows = await db.query<Row>("SELECT role FROM admin_platform_roles WHERE admin_id = $1", [admin.id]);
  const granted = new Set<string>(roleRows.map((row) => String(row.role)));
  // Colonne legacy : un owner créé avant la table reste owner tant qu'elle dit owner.
  if (admin.platform_role === "owner") granted.add("owner");
  const platformRoles = PLATFORM_ROLES.filter((role) => granted.has(role));

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

  return {
    adminId: String(admin.id),
    sessionId,
    platformRole: platformRoles[0] ?? "none",
    platformRoles,
    memberships,
    mustChangePassword: admin.must_change_password === true,
    admin,
  };
}

/** Un rôle plateforme porté, cumulable avec les autres. */
export function hasPlatformRole(admin: AdminContext, role: PlatformRoleName): boolean {
  return admin.platformRoles.includes(role);
}

/**
 * Routes qui restent ouvertes tant que le mot de passe doit changer : le compte
 * lui-même et l'authentification. Tout le reste répond `PASSWORD_CHANGE_REQUIRED`.
 */
export function passwordChangeExempt(path: string): boolean {
  return path === "/v1/admin/me" || path.startsWith("/v1/admin/me/") || path.startsWith("/v1/admin/auth/");
}

/**
 * Code renvoyé tant que le mot de passe doit changer. Il n'est pas encore dans
 * API_ERROR_CODES (packages/contract, hors de ce lot) : la conversion est
 * isolée ici, à remplacer par la valeur du contrat dès qu'elle y figure.
 */
const PASSWORD_CHANGE_CODE = "PASSWORD_CHANGE_REQUIRED" as unknown as ApiErrorCode;

export function passwordChangeRequired(): ApiFailure {
  return new ApiFailure(403, PASSWORD_CHANGE_CODE, "Changez votre mot de passe avant de continuer.");
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
  if (hasPlatformRole(admin, "owner")) return requested ?? null;
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
