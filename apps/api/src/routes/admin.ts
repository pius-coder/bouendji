/**
 * Dashboard d'administration.
 *
 * Trois invariants portent tout ce fichier :
 *
 * 1. **Le périmètre vient de la session.** Aucune route ne lit un
 *    `community_id` dans le corps : le corps est filtré par zod (les clés
 *    inconnues sont jetées), et la communauté vient du chemin ou d'une
 *    appartenance enregistrée. Un admin qui vise une autre communauté obtient
 *    `403`, jamais un `404` qui laisserait croire à une ressource absente.
 * 2. **Le rôle est relu en base à chaque requête** (`requireAdmin`), pas lu dans
 *    le jeton. Retirer une appartenance coupe l'accès à l'appel suivant, même
 *    si le jeton vit 8 heures.
 * 3. **Le pool ne fuit jamais une identité.** Ni UUID, ni chemin WebSocket, ni
 *    credential, ni clé de déploiement : un admin ne voit jamais de quoi se
 *    connecter (knowledge/40-money/roles-and-commissions.md).
 *
 * Chaque action privilégiée écrit **une** ligne dans `audit_log`, dans la même
 * transaction que la mutation. `audit_log` refuse UPDATE et DELETE au niveau
 * PostgreSQL (règles dans schema.ts).
 */
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { isUniqueViolation, type Database, type Queryable, type Row } from "../db.js";
import { requireAdmin, roleInCommunity, scopedCommunity, type AdminContext, type StaffRole } from "../lib/auth.js";
import { hashPassword, newId } from "../lib/crypto.js";
import { fail } from "../lib/errors.js";
import { issueOfflineBundle } from "../services/offlineBundles.js";

const PREFIX = "/v1/admin";

/* ------------------------------------------------------------- validation */

export function parseBody<T extends z.ZodTypeAny>(schema: T, body: unknown): z.infer<T> {
  const result = schema.safeParse(body ?? {});
  if (result.success) return result.data;
  const details: Record<string, string> = {};
  for (const issue of result.error.issues) {
    details[issue.path.join(".") || "_"] = issue.message;
  }
  throw fail.validation(details);
}

function parseQuery<T extends z.ZodTypeAny>(schema: T, query: unknown): z.infer<T> {
  return parseBody(schema, query ?? {});
}

const slugSchema = z
  .string()
  .trim()
  .min(2)
  .max(64)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Minuscules, chiffres et tirets uniquement.");

const communityCreateSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    slug: slugSchema,
    /** 0..10000 (base points). Default 2000 = 20 %. */
    commissionBps: z.number().int().min(0).max(10_000).optional(),
  })
  .strict();

const communityPatchSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    commissionBps: z.number().int().min(0).max(10_000).optional(),
    status: z.enum(["active", "suspended"]).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, "Aucun champ à modifier.");

/**
 * Volontairement **non strict** : un `communityId` / `community_id` envoyé par
 * erreur dans le corps est ignoré, pas promu. Le chemin fait foi.
 */
const membershipCreateSchema = z.object({
  adminUserId: z.string().trim().min(1).max(190),
  role: z.enum(["community_admin", "support", "finance"]),
});

const membershipPatchSchema = z
  .object({
    role: z.enum(["community_admin", "support", "finance"]).optional(),
    status: z.enum(["active", "disabled"]).optional(),
  })
  .strict()
  .refine((value) => value.role !== undefined || value.status !== undefined, "Aucun champ à modifier.");

const adminCreateSchema = z
  .object({
    email: z.string().trim().toLowerCase().email().max(190),
    name: z.string().trim().min(2).max(120),
    password: z.string().min(12).max(256),
    platformRole: z.enum(["none", "owner"]).optional(),
  })
  .strict();

const payoutCreateSchema = z
  .object({
    /** Aucun montant : il est calculé depuis les commissions disponibles. */
    note: z.string().trim().max(280).optional(),
  })
  .strict();

const offlineBundleSchema = z
  .object({
    ttlHours: z.number().int().min(1).max(72).optional(),
  })
  .strict();

const listQuerySchema = z.object({
  cursor: z.string().max(512).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  status: z.string().trim().max(32).optional(),
});

const auditQuerySchema = z.object({
  community_id: z.string().trim().max(190).optional(),
  communityId: z.string().trim().max(190).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

/* ----------------------------------------------------------- permissions */

type Capability =
  | "community.manage"
  | "community.read"
  | "membership.read"
  | "membership.write"
  | "member.read"
  | "order.read"
  | "commission.read"
  | "payout.create"
  | "payout.approve"
  | "endpoint.read"
  | "device.revoke"
  | "offline_bundle.issue"
  | "audit.read";

/**
 * Matrice appliquée, rôle par rôle (knowledge/40-money/roles-and-commissions.md).
 *
 * | Capacité              | owner | community_admin | support | finance |
 * |-----------------------|-------|-----------------|---------|---------|
 * | community.manage      | oui   | non             | non     | non     |
 * | community.read        | oui   | sa communauté   | sa comm.| sa comm.|
 * | membership.read/write | oui   | sa communauté   | non     | non     |
 * | member.read           | oui   | sa communauté   | sa comm.| non     |
 * | order.read            | oui   | sa communauté   | sa comm.| toutes  |
 * | commission.read       | oui   | sa communauté   | non     | toutes  |
 * | payout.create         | oui   | non             | non     | sa comm.|
 * | payout.approve        | oui   | non             | non     | non     |
 * | endpoint.read         | oui   | oui (lecture)   | oui     | non     |
 * | device.revoke         | oui   | sa communauté   | sa comm.| non     |
 * | offline_bundle.issue  | oui   | sa communauté   | sa comm.| non     |
 * | audit.read            | oui   | sa communauté   | non     | non     |
 */
function permitted(admin: AdminContext, capability: Capability, communityId: string | null): boolean {
  if (admin.platformRole === "owner") return true;
  const local: StaffRole | null = communityId ? roleInCommunity(admin, communityId) : null;
  const anyRole = (roles: readonly StaffRole[]) => admin.memberships.some((m) => roles.includes(m.role));

  switch (capability) {
    case "community.read":
      // Une communauté précise exige une appartenance ; la liste, au moins une.
      return communityId ? local !== null : admin.memberships.length > 0;
    case "community.manage":
      return false;
    case "membership.read":
    case "membership.write":
      return local === "community_admin";
    case "member.read":
      return local === "community_admin" || local === "support";
    case "order.read":
      // `finance` voit toutes les communautés : elle encaisse pour la plateforme.
      return local !== null || anyRole(["finance"]);
    case "commission.read":
      return local === "community_admin" || local === "finance" || anyRole(["finance"]);
    case "payout.create":
      return local === "finance";
    case "payout.approve":
      return false;
    case "endpoint.read":
      return anyRole(["community_admin", "support"]);
    case "device.revoke":
    case "offline_bundle.issue":
      return local === "community_admin" || local === "support";
    case "audit.read":
      return local === "community_admin";
    default:
      return false;
  }
}

function authorize(admin: AdminContext, capability: Capability, communityId: string | null): void {
  if (!permitted(admin, capability, communityId)) {
    throw fail.forbidden("Action non autorisée pour votre rôle.");
  }
}

/** Qui voit les montants : owner, community_admin (ses ventes), finance. */
function seesMoney(admin: AdminContext, communityId: string | null): boolean {
  if (admin.platformRole === "owner") return true;
  const local = communityId ? roleInCommunity(admin, communityId) : null;
  return local === "community_admin" || local === "finance";
}

/* -------------------------------------------------------------- utilitaires */

function iso(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString();
}

interface Cursor {
  createdAt: string;
  id: string;
}

function encodeCursor(row: Row): string {
  return Buffer.from(`${iso(row.created_at)}|${String(row.id)}`, "utf8").toString("base64url");
}

function decodeCursor(raw: string): Cursor {
  let decoded: string;
  try {
    decoded = Buffer.from(raw, "base64url").toString("utf8");
  } catch {
    throw fail.validation({ cursor: "Curseur invalide." });
  }
  const separator = decoded.indexOf("|");
  if (separator <= 0 || separator === decoded.length - 1) throw fail.validation({ cursor: "Curseur invalide." });
  const createdAt = decoded.slice(0, separator);
  const id = decoded.slice(separator + 1);
  if (Number.isNaN(Date.parse(createdAt)) || id.length === 0 || id.length > 190) {
    throw fail.validation({ cursor: "Curseur invalide." });
  }
  return { createdAt, id };
}

async function mustCommunity(db: Queryable, communityId: string): Promise<void> {
  const row = await db.one("SELECT id FROM communities WHERE id = $1", [communityId]);
  if (!row) throw fail.notFound("Communauté introuvable.");
}

/** Dernier `community_admin` actif : le retirer verrouillerait la communauté. */
async function assertNotLastCommunityAdmin(db: Queryable, communityId: string, exceptId: string): Promise<void> {
  const remaining = await db.scalar<number>(
    `SELECT count(*) FROM community_memberships
      WHERE community_id = $1 AND role = 'community_admin' AND status = 'active' AND id <> $2`,
    [communityId, exceptId],
  );
  if (Number(remaining) === 0) {
    throw fail.conflict("Impossible de retirer le dernier administrateur de la communauté.");
  }
}

/* ------------------------------------------------------------------ audit */

export interface AuditInput {
  action: string;
  targetType: string;
  targetId: string;
  communityId?: string | null;
  before?: unknown;
  after?: unknown;
  meta?: Record<string, unknown>;
}

/**
 * Une ligne par action, écrite dans la transaction de la mutation : si la
 * mutation échoue, l'audit disparaît avec elle ; si elle passe, la trace existe.
 * `actor_role` est le rôle *exercé*, pas le rôle global : une ligne dit qui a
 * fait quoi, dans quelle communauté, avec quel rôle.
 */
export async function appendAudit(q: Queryable, admin: AdminContext, req: FastifyRequest, input: AuditInput): Promise<void> {
  const communityId = input.communityId ?? null;
  const actorRole =
    admin.platformRole === "owner" ? "owner" : (communityId ? roleInCommunity(admin, communityId) : null) ?? "staff";
  const userAgent = req.headers["user-agent"];
  await q.query(
    `INSERT INTO audit_log
       (id, actor_id, actor_type, actor_role, action, target, target_type, target_id,
        community_id, ip, user_agent, meta, before_state, after_state)
     VALUES ($1, $2, 'admin', $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12::jsonb, $13::jsonb)`,
    [
      newId(),
      admin.adminId,
      actorRole,
      input.action,
      `${input.targetType}:${input.targetId}`,
      input.targetType,
      input.targetId,
      communityId,
      req.ip ?? null,
      typeof userAgent === "string" ? userAgent.slice(0, 300) : null,
      JSON.stringify(input.meta ?? {}),
      input.before === undefined ? null : JSON.stringify(input.before),
      input.after === undefined ? null : JSON.stringify(input.after),
    ],
  );
}

/* ------------------------------------------------------------ projections */

function communityDto(row: Row) {
  return {
    id: row.id as string,
    name: row.name as string,
    slug: row.slug as string,
    status: row.status as string,
    commissionBps: Number(row.commission_bps),
    createdAt: iso(row.created_at),
    suspended: row.status !== "active",
  };
}

function membershipDto(row: Row) {
  return {
    id: row.id as string,
    adminUserId: row.admin_user_id as string,
    email: row.email as string | null,
    name: row.name as string | null,
    role: row.role as StaffRole,
    status: row.status as string,
    communityId: row.community_id as string,
    createdAt: iso(row.created_at),
  };
}

const MEMBERSHIP_SELECT = /* sql */ `
  SELECT m.id, m.admin_user_id, m.community_id, m.role, m.status, m.created_at,
         a.email, a.name
    FROM community_memberships m
    JOIN admin_users a ON a.id = m.admin_user_id`;

function orderDto(row: Row, withMoney: boolean) {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    planId: row.plan_id as string,
    status: row.status as string,
    currency: row.currency as string,
    ...(withMoney
      ? {
          amountXaf: Number(row.amount_xaf),
          commissionBps: Number(row.commission_bps),
          commissionXaf: Number(row.commission_xaf),
        }
      : {}),
    createdAt: iso(row.created_at),
    paidAt: iso(row.paid_at),
    activatedAt: iso(row.activated_at),
  };
}

function commissionDto(row: Row) {
  return {
    id: row.id as string,
    orderId: row.order_id as string,
    bps: Number(row.bps),
    amountXaf: Number(row.amount_xaf),
    status: row.status as string,
    payoutId: (row.payout_id as string | null) ?? null,
    createdAt: iso(row.created_at),
    availableAt: iso(row.available_at),
  };
}

/**
 * Le pool est une ressource **globale** : aucun `community_id` à filtrer. Ce qui
 * sort est un état de santé, jamais de quoi ouvrir un tunnel.
 */
function endpointDto(row: Row) {
  return {
    endpointId: row.id as string,
    label: row.label as string,
    host: row.host as string,
    port: Number(row.port),
    protocol: row.protocol as string,
    transport: row.transport as string,
    security: row.security as string,
    region: row.region as string,
    capacity: Number(row.capacity),
    inUse: Number(row.in_use),
    status: row.status as string,
    health: row.health as string,
    latencyMs: row.latency_ms === null || row.latency_ms === undefined ? null : Number(row.latency_ms),
    lastSeenAt: iso(row.last_seen_at),
    expiresAt: iso(row.expires_at),
  };
}

function auditDto(row: Row) {
  return {
    id: row.id as string,
    action: row.action as string,
    actorId: (row.actor_id as string | null) ?? null,
    actorRole: (row.actor_role as string | null) ?? null,
    targetType: (row.target_type as string | null) ?? null,
    targetId: (row.target_id as string | null) ?? null,
    communityId: (row.community_id as string | null) ?? null,
    ip: (row.ip as string | null) ?? null,
    before: row.before_state ?? null,
    after: row.after_state ?? null,
    createdAt: iso(row.created_at),
  };
}

/* ---------------------------------------------------------------- handlers */

export function registerAdminRoutes(app: FastifyInstance, db: Database): void {
  /* ------------------------------------------------------------------ moi */

  app.get(`${PREFIX}/me`, async (req) => {
    const admin = await requireAdmin(db, req);
    return {
      adminId: admin.adminId,
      email: admin.admin.email as string,
      name: admin.admin.name as string,
      platformRole: admin.platformRole,
      memberships: admin.memberships.map((m) => ({ communityId: m.communityId, role: m.role })),
    };
  });

  /* ---------------------------------------------------------- communautés */

  app.get(`${PREFIX}/communities`, async (req) => {
    const admin = await requireAdmin(db, req);
    const rows =
      admin.platformRole === "owner"
        ? await db.query<Row>("SELECT * FROM communities ORDER BY created_at DESC LIMIT 200")
        : await db.query<Row>(
            `SELECT c.* FROM communities c
               JOIN community_memberships m ON m.community_id = c.id
              WHERE m.admin_user_id = $1 AND m.status = 'active'
              ORDER BY c.created_at DESC LIMIT 200`,
            [admin.adminId],
          );
    return { items: rows.map(communityDto) };
  });

  app.post(`${PREFIX}/communities`, async (req, reply) => {
    const admin = await requireAdmin(db, req);
    authorize(admin, "community.manage", null);
    const input = parseBody(communityCreateSchema, req.body);
    const id = newId();
    try {
      await db.tx(async (q) => {
        await q.query(
          `INSERT INTO communities (id, name, slug, commission_bps) VALUES ($1, $2, $3, $4)`,
          [id, input.name, input.slug, input.commissionBps ?? 2000],
        );
        await appendAudit(q, admin, req, {
          action: "community.create",
          targetType: "community",
          targetId: id,
          communityId: id,
          after: { name: input.name, slug: input.slug, commissionBps: input.commissionBps ?? 2000 },
        });
      });
    } catch (err) {
      if (isUniqueViolation(err)) throw fail.conflict("Ce slug de communauté est déjà utilisé.");
      throw err;
    }
    const created = await db.one<Row>("SELECT * FROM communities WHERE id = $1", [id]);
    return reply.code(201).send(communityDto(created as Row));
  });

  app.get<{ Params: { communityId: string } }>(`${PREFIX}/communities/:communityId`, async (req) => {
    const admin = await requireAdmin(db, req);
    const communityId = scopedCommunity(admin, req.params.communityId) as string;
    authorize(admin, "community.read", communityId);
    await mustCommunity(db, communityId);
    const row = await db.one<Row>("SELECT * FROM communities WHERE id = $1", [communityId]);
    return communityDto(row as Row);
  });

  app.patch<{ Params: { communityId: string } }>(`${PREFIX}/communities/:communityId`, async (req) => {
    const admin = await requireAdmin(db, req);
    const communityId = scopedCommunity(admin, req.params.communityId) as string;
    authorize(admin, "community.manage", communityId);
    await mustCommunity(db, communityId);
    const input = parseBody(communityPatchSchema, req.body);
    const before = await db.one<Row>("SELECT * FROM communities WHERE id = $1", [communityId]);
    if (!before) throw fail.notFound("Communauté introuvable.");

    const name = input.name ?? (before.name as string);
    const commissionBps = input.commissionBps ?? Number(before.commission_bps);
    const status = input.status ?? (before.status as string);
    const suspended = before.status !== "suspended" && status === "suspended";

    await db.tx(async (q) => {
      await q.query(`UPDATE communities SET name = $2, commission_bps = $3, status = $4 WHERE id = $1`, [
        communityId,
        name,
        commissionBps,
        status,
      ]);
      await appendAudit(q, admin, req, {
        action: suspended ? "community.suspend" : status !== before.status ? "community.resume" : "community.update",
        targetType: "community",
        targetId: communityId,
        communityId,
        before: { name: before.name, commissionBps: Number(before.commission_bps), status: before.status },
        after: { name, commissionBps, status },
      });
    });

    const updated = await db.one<Row>("SELECT * FROM communities WHERE id = $1", [communityId]);
    return communityDto(updated as Row);
  });

  /* ----------------------------------------------------- personnel (staff) */

  app.get<{ Params: { communityId: string } }>(`${PREFIX}/communities/:communityId/memberships`, async (req) => {
    const admin = await requireAdmin(db, req);
    const communityId = scopedCommunity(admin, req.params.communityId) as string;
    authorize(admin, "membership.read", communityId);
    await mustCommunity(db, communityId);
    const rows = await db.query<Row>(`${MEMBERSHIP_SELECT} WHERE m.community_id = $1 ORDER BY m.created_at ASC`, [
      communityId,
    ]);
    return { items: rows.map(membershipDto) };
  });

  app.post<{ Params: { communityId: string } }>(`${PREFIX}/communities/:communityId/memberships`, async (req, reply) => {
    const admin = await requireAdmin(db, req);
    const communityId = scopedCommunity(admin, req.params.communityId) as string;
    // Autorisation avant validation : un rôle non autorisé n'obtient pas de
    // retour sur la forme du corps.
    authorize(admin, "membership.write", communityId);
    await mustCommunity(db, communityId);

    const input = parseBody(membershipCreateSchema, req.body);
    if (admin.platformRole !== "owner" && input.adminUserId === admin.adminId) {
      throw fail.forbidden("Vous ne pouvez pas modifier votre propre appartenance.");
    }
    const target = await db.one<Row>("SELECT id, active FROM admin_users WHERE id = $1", [input.adminUserId]);
    if (!target) throw fail.notFound("Compte administrateur introuvable.");
    if (target.active !== true) throw fail.conflict("Ce compte administrateur est désactivé.");

    const id = newId();
    try {
      await db.tx(async (q) => {
        await q.query(
          `INSERT INTO community_memberships (id, admin_user_id, community_id, role, status)
           VALUES ($1, $2, $3, $4, 'active')`,
          [id, input.adminUserId, communityId, input.role],
        );
        await appendAudit(q, admin, req, {
          action: "membership.create",
          targetType: "membership",
          targetId: id,
          communityId,
          after: { adminUserId: input.adminUserId, role: input.role, status: "active" },
        });
      });
    } catch (err) {
      if (isUniqueViolation(err)) throw fail.conflict("Ce compte a déjà une appartenance dans cette communauté.");
      throw err;
    }

    const row = await db.one<Row>(`${MEMBERSHIP_SELECT} WHERE m.id = $1`, [id]);
    return reply.code(201).send(membershipDto(row as Row));
  });

  app.patch<{ Params: { membershipId: string } }>(`${PREFIX}/memberships/:membershipId`, async (req) => {
    const admin = await requireAdmin(db, req);
    const target = await db.one<Row>(
      "SELECT id, admin_user_id, community_id, role, status FROM community_memberships WHERE id = $1",
      [req.params.membershipId],
    );
    if (!target) throw fail.notFound("Appartenance introuvable.");
    const communityId = target.community_id as string;
    authorize(admin, "membership.write", communityId);
    if (admin.platformRole !== "owner" && target.admin_user_id === admin.adminId) {
      throw fail.forbidden("Vous ne pouvez pas modifier votre propre appartenance.");
    }

    const input = parseBody(membershipPatchSchema, req.body);
    const role = (input.role ?? target.role) as StaffRole;
    const status = input.status ?? (target.status as string);
    const losesAdmin =
      target.role === "community_admin" && (role !== "community_admin" || status !== "active");
    if (losesAdmin) await assertNotLastCommunityAdmin(db, communityId, target.id as string);

    await db.tx(async (q) => {
      await q.query("UPDATE community_memberships SET role = $2, status = $3 WHERE id = $1", [
        target.id,
        role,
        status,
      ]);
      await appendAudit(q, admin, req, {
        action: status === "disabled" ? "membership.disable" : "membership.update",
        targetType: "membership",
        targetId: target.id as string,
        communityId,
        before: { role: target.role, status: target.status },
        after: { role, status },
      });
    });

    const row = await db.one<Row>(`${MEMBERSHIP_SELECT} WHERE m.id = $1`, [target.id]);
    return membershipDto(row as Row);
  });

  /** Retrait = désactivation logique : la ligne d'audit garde la trace. */
  app.delete<{ Params: { membershipId: string } }>(`${PREFIX}/memberships/:membershipId`, async (req) => {
    const admin = await requireAdmin(db, req);
    const target = await db.one<Row>(
      "SELECT id, admin_user_id, community_id, role, status FROM community_memberships WHERE id = $1",
      [req.params.membershipId],
    );
    if (!target) throw fail.notFound("Appartenance introuvable.");
    const communityId = target.community_id as string;
    authorize(admin, "membership.write", communityId);
    if (admin.platformRole !== "owner" && target.admin_user_id === admin.adminId) {
      throw fail.forbidden("Vous ne pouvez pas modifier votre propre appartenance.");
    }
    if (target.role === "community_admin" && target.status === "active") {
      await assertNotLastCommunityAdmin(db, communityId, target.id as string);
    }

    await db.tx(async (q) => {
      await q.query("UPDATE community_memberships SET status = 'disabled' WHERE id = $1", [target.id]);
      await appendAudit(q, admin, req, {
        action: "membership.disable",
        targetType: "membership",
        targetId: target.id as string,
        communityId,
        before: { role: target.role, status: target.status },
        after: { role: target.role, status: "disabled" },
      });
    });

    const row = await db.one<Row>(`${MEMBERSHIP_SELECT} WHERE m.id = $1`, [target.id]);
    return membershipDto(row as Row);
  });

  /** Provisionnement d'un compte d'administration (owner uniquement). */
  app.post(`${PREFIX}/admins`, async (req, reply) => {
    const admin = await requireAdmin(db, req);
    authorize(admin, "community.manage", null);
    const input = parseBody(adminCreateSchema, req.body);
    const id = newId();
    const platformRole = input.platformRole ?? "none";
    try {
      await db.tx(async (q) => {
        // La colonne héritée `role` reste synchronisée : voir schema.ts, la
        // migration ne doit jamais pouvoir re-promouvoir un compte rétrogradé.
        await q.query(
          `INSERT INTO admin_users (id, email, password_hash, name, role, platform_role, active)
           VALUES ($1, $2, $3, $4, $5, $6, true)`,
          [id, input.email, hashPassword(input.password), input.name, platformRole === "owner" ? "platform" : "partner", platformRole],
        );
        await appendAudit(q, admin, req, {
          action: "admin.create",
          targetType: "admin_user",
          targetId: id,
          after: { email: input.email, platformRole },
        });
      });
    } catch (err) {
      if (isUniqueViolation(err)) throw fail.conflict("Cette adresse email est déjà utilisée.");
      throw err;
    }
    return reply.code(201).send({ adminId: id, email: input.email, name: input.name, platformRole });
  });

  /* ------------------------------------------------------------- abonnés */

  app.get<{ Params: { communityId: string } }>(`${PREFIX}/communities/:communityId/users`, async (req) => {
    const admin = await requireAdmin(db, req);
    const communityId = scopedCommunity(admin, req.params.communityId) as string;
    authorize(admin, "member.read", communityId);
    await mustCommunity(db, communityId);
    const rows = await db.query<Row>(
      `SELECT id, email, name, locale, email_verified_at, deleted_at, created_at
         FROM users WHERE community_id = $1 ORDER BY created_at DESC LIMIT 100`,
      [communityId],
    );
    return {
      items: rows.map((row) => ({
        id: row.id as string,
        email: row.email as string,
        name: row.name as string,
        locale: row.locale as string,
        emailVerified: row.email_verified_at !== null,
        deleted: row.deleted_at !== null,
        createdAt: iso(row.created_at),
      })),
    };
  });

  /* ------------------------------------------------------------ appareils */

  app.get<{ Params: { communityId: string } }>(`${PREFIX}/communities/:communityId/devices`, async (req) => {
    const admin = await requireAdmin(db, req);
    const communityId = scopedCommunity(admin, req.params.communityId) as string;
    authorize(admin, "member.read", communityId);
    await mustCommunity(db, communityId);
    const rows = await db.query<Row>(
      `SELECT d.id, d.user_id, d.name, d.platform, d.status, d.last_seen_at, d.revoked_at, d.created_at
         FROM devices d
         JOIN users u ON u.id = d.user_id
        WHERE u.community_id = $1
        ORDER BY d.created_at DESC LIMIT 100`,
      [communityId],
    );
    return {
      items: rows.map((row) => ({
        deviceId: row.id as string,
        userId: row.user_id as string,
        name: row.name as string,
        platform: row.platform as string,
        status: row.status as string,
        lastSeenAt: iso(row.last_seen_at),
        revokedAt: iso(row.revoked_at),
        createdAt: iso(row.created_at),
      })),
    };
  });

  app.post<{ Params: { deviceId: string } }>(`${PREFIX}/devices/:deviceId/revoke`, async (req) => {
    const admin = await requireAdmin(db, req);
    const device = await db.one<Row>(
      `SELECT d.id, d.status, u.community_id
         FROM devices d JOIN users u ON u.id = d.user_id
        WHERE d.id = $1`,
      [req.params.deviceId],
    );
    if (!device) throw fail.notFound("Appareil introuvable.");
    const communityId = device.community_id as string;
    authorize(admin, "device.revoke", communityId);

    let sessionsRevoked = 0;
    await db.tx(async (q) => {
      await q.query("UPDATE devices SET status = 'revoked', revoked_at = now() WHERE id = $1", [device.id]);
      const sessions = await q.query<Row>(
        "UPDATE auth_sessions SET revoked_at = now() WHERE device_id = $1 AND revoked_at IS NULL RETURNING id",
        [device.id],
      );
      sessionsRevoked = sessions.length;
      await appendAudit(q, admin, req, {
        action: "device.revoke",
        targetType: "device",
        targetId: device.id as string,
        communityId,
        before: { status: device.status },
        after: { status: "revoked", sessionsRevoked },
      });
    });

    return { deviceId: device.id as string, status: "revoked", sessionsRevoked };
  });

  /* ------------------------------------------------------ bundles hors-ligne */

  app.post<{ Params: { deviceId: string } }>(`${PREFIX}/devices/:deviceId/offline-bundles`, async (req, reply) => {
    const admin = await requireAdmin(db, req);
    const device = await db.one<Row>(
      `SELECT d.id, d.user_id, u.community_id
         FROM devices d JOIN users u ON u.id = d.user_id
        WHERE d.id = $1`,
      [req.params.deviceId],
    );
    if (!device) throw fail.notFound("Appareil introuvable.");
    const communityId = device.community_id as string;
    authorize(admin, "offline_bundle.issue", communityId);

    const input = parseBody(offlineBundleSchema, req.body);
    // Défaut court : un fichier de secours qui traîne ne doit pas rester
    // utilisable (D29). L'admin peut allonger, jamais au-delà de 24 h.
    const ttlMinutes = (input.ttlHours ?? 1) * 60;

    const issued = await issueOfflineBundle(db, {
      deviceId: String(device.id),
      userId: String(device.user_id),
      createdBy: admin.adminId,
      ttlMinutes,
    });

    await appendAudit(db, admin, req, {
      action: "offline_bundle.issue",
      targetType: "offline_bundle",
      targetId: issued.file.bundleId,
      communityId,
      after: { deviceId: device.id, notAfter: issued.notAfter, endpointCount: issued.endpointCount },
    });

    // Le fichier est scellé pour cet appareil : même un administrateur ne peut
    // pas en lire le contenu. La réponse ne montre que le droit et le sceau.
    return reply.code(201).send({
      bundleId: issued.file.bundleId,
      deviceId: device.id as string,
      notAfter: issued.notAfter,
      singleUse: true,
      endpointCount: issued.endpointCount,
      file: issued.file,
    });
  });

  /* ---------------------------------------------------------- commandes */

  app.get<{ Params: { communityId: string } }>(`${PREFIX}/communities/:communityId/orders`, async (req) => {
    const admin = await requireAdmin(db, req);
    const communityId = scopedCommunity(admin, req.params.communityId) as string;
    authorize(admin, "order.read", communityId);
    await mustCommunity(db, communityId);
    const query = parseQuery(listQuerySchema, req.query);
    const limit = query.limit ?? 20;

    const params: unknown[] = [communityId];
    let where = "WHERE community_id = $1";
    if (query.status) {
      params.push(query.status);
      where += ` AND status = $${params.length}`;
    }
    if (query.cursor) {
      const cursor = decodeCursor(query.cursor);
      params.push(cursor.createdAt, cursor.id);
      where += ` AND (created_at < $${params.length - 1}::timestamptz
                      OR (created_at = $${params.length - 1}::timestamptz AND id < $${params.length}))`;
    }
    params.push(limit + 1);
    const rows = await db.query<Row>(
      `SELECT id, user_id, plan_id, status, currency, amount_xaf, commission_bps, commission_xaf,
              created_at, paid_at, activated_at
         FROM orders ${where}
        ORDER BY created_at DESC, id DESC LIMIT $${params.length}`,
      params,
    );

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page[page.length - 1];
    const withMoney = seesMoney(admin, communityId);
    return {
      items: page.map((row) => orderDto(row, withMoney)),
      ...(hasMore && last ? { nextCursor: encodeCursor(last) } : {}),
    };
  });

  /* --------------------------------------------------------- commissions */

  app.get<{ Params: { communityId: string } }>(`${PREFIX}/communities/:communityId/commissions`, async (req) => {
    const admin = await requireAdmin(db, req);
    const communityId = scopedCommunity(admin, req.params.communityId) as string;
    authorize(admin, "commission.read", communityId);
    await mustCommunity(db, communityId);
    const query = parseQuery(listQuerySchema, req.query);
    const limit = query.limit ?? 20;

    const params: unknown[] = [communityId];
    let where = "WHERE community_id = $1";
    if (query.status) {
      params.push(query.status);
      where += ` AND status = $${params.length}`;
    }
    params.push(limit);
    const rows = await db.query<Row>(
      `SELECT id, order_id, bps, amount_xaf, status, payout_id, created_at, available_at
         FROM commissions ${where}
        ORDER BY created_at DESC LIMIT $${params.length}`,
      params,
    );
    return { items: rows.map(commissionDto) };
  });

  /* ------------------------------------------------------------- versements */

  app.post<{ Params: { communityId: string } }>(`${PREFIX}/communities/:communityId/payouts`, async (req, reply) => {
    const admin = await requireAdmin(db, req);
    const communityId = scopedCommunity(admin, req.params.communityId) as string;
    authorize(admin, "payout.create", communityId);
    await mustCommunity(db, communityId);
    const input = parseBody(payoutCreateSchema, req.body);

    const id = newId();
    let amountXaf = 0;
    let commissionCount = 0;

    await db.tx(async (q) => {
      // Le montant n'est jamais fourni par le client : il est la somme des
      // commissions disponibles, marquées dans la même transaction.
      const totals = await q.one<Row>(
        `SELECT COALESCE(SUM(amount_xaf), 0) AS total, count(*) AS n
           FROM commissions
          WHERE community_id = $1 AND status = 'pending' AND payout_id IS NULL AND available_at <= now()`,
        [communityId],
      );
      amountXaf = Number(totals?.total ?? 0);
      commissionCount = Number(totals?.n ?? 0);
      if (amountXaf <= 0 || commissionCount === 0) {
        throw fail.conflict("Aucune commission disponible pour un versement.");
      }

      await q.query(
        `INSERT INTO payouts (id, community_id, amount_xaf, status, note, created_by)
         VALUES ($1, $2, $3, 'pending', $4, $5)`,
        [id, communityId, amountXaf, input.note ?? null, admin.adminId],
      );
      const attached = await q.query<Row>(
        `UPDATE commissions SET payout_id = $1
          WHERE community_id = $2 AND status = 'pending' AND payout_id IS NULL AND available_at <= now()
          RETURNING id`,
        [id, communityId],
      );
      if (attached.length !== commissionCount) {
        // Concurrence entre le SELECT et l'UPDATE : on annule plutôt que de
        // payer deux fois les mêmes commissions.
        throw fail.conflict("Commissions modifiées pendant le calcul, réessayez.");
      }
      await appendAudit(q, admin, req, {
        action: "payout.create",
        targetType: "payout",
        targetId: id,
        communityId,
        after: { amountXaf, commissionCount, status: "pending" },
      });
    });

    const row = await db.one<Row>("SELECT * FROM payouts WHERE id = $1", [id]);
    return reply.code(201).send({
      id,
      communityId,
      amountXaf,
      status: "pending",
      commissionCount,
      note: (row?.note as string | null) ?? null,
      createdAt: iso(row?.created_at),
      createdBy: (row?.created_by as string | null) ?? null,
    });
  });

  app.post<{ Params: { payoutId: string } }>(`${PREFIX}/payouts/:payoutId/approve`, async (req) => {
    const admin = await requireAdmin(db, req);
    const payout = await db.one<Row>("SELECT * FROM payouts WHERE id = $1", [req.params.payoutId]);
    if (!payout) throw fail.notFound("Versement introuvable.");
    const communityId = payout.community_id as string;
    authorize(admin, "payout.approve", communityId);
    if (payout.status !== "pending") throw fail.conflict("Ce versement n'est plus en attente.");

    await db.tx(async (q) => {
      await q.query("UPDATE payouts SET status = 'approved' WHERE id = $1", [payout.id]);
      await appendAudit(q, admin, req, {
        action: "payout.approve",
        targetType: "payout",
        targetId: payout.id as string,
        communityId,
        before: { status: payout.status },
        after: { status: "approved" },
      });
    });

    return {
      id: payout.id as string,
      communityId,
      amountXaf: Number(payout.amount_xaf),
      status: "approved",
      // Le décaissement réel passe par le fournisseur (routes api-money).
      paidAt: null,
    };
  });

  /* ------------------------------------------------------------------ pool */

  app.get(`${PREFIX}/pool`, async (req) => {
    const admin = await requireAdmin(db, req);
    // Ressource globale : aucune communauté à filtrer, seulement un droit de
    // lecture (owner, community_admin, support).
    authorize(admin, "endpoint.read", null);
    const rows = await db.query<Row>(
      `SELECT id, label, host, port, protocol, transport, security, region, capacity, in_use,
              status, health, latency_ms, last_seen_at, expires_at
         FROM endpoints ORDER BY created_at DESC LIMIT 200`,
    );
    const revision = await db.scalar<number>("SELECT revision FROM pool_state WHERE id = 'pool'");
    return { poolRevision: Number(revision ?? 0), count: rows.length, endpoints: rows.map(endpointDto) };
  });

  /* ------------------------------------------------------------ audit log */

  app.get(`${PREFIX}/audit-log`, async (req) => {
    const admin = await requireAdmin(db, req);
    const query = parseQuery(auditQuerySchema, req.query);
    const requested = query.community_id ?? query.communityId ?? null;
    const communityId = scopedCommunity(admin, requested);
    authorize(admin, "audit.read", communityId);

    const limit = query.limit ?? 50;
    const params: unknown[] = [];
    let where = "";
    if (communityId) {
      params.push(communityId);
      where = "WHERE community_id = $1";
    }
    params.push(limit);
    const rows = await db.query<Row>(
      `SELECT id, action, actor_id, actor_role, target_type, target_id, community_id, ip,
              before_state, after_state, created_at
         FROM audit_log ${where}
        ORDER BY created_at DESC LIMIT $${params.length}`,
      params,
    );
    return { items: rows.map(auditDto) };
  });
}

