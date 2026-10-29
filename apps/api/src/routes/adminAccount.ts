/**
 * « Mon compte » d'un administrateur : profil, mot de passe, sessions.
 *
 * Ces routes sont ouvertes même quand le mot de passe doit changer (garde de
 * app.ts, `passwordChangeExempt`) : c'est là qu'on le change.
 *
 * Trois invariants :
 * 1. Toujours le compte du jeton, jamais un identifiant de chemin ou de corps :
 *    une session d'un autre compte répond 404, comme si elle n'existait pas.
 * 2. Changer le mot de passe révoque toutes les sessions, y compris celle qui a
 *    servi à le changer ; la réponse ouvre une nouvelle session.
 * 3. Le mot de passe actuel se devine aussi : même compteur pour ce compte.
 */
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { isUniqueViolation, type Database, type Row } from "../db.js";
import { buildAdminContext, openAdminSession, requireAdmin, type AdminContext } from "../lib/auth.js";
import { AttemptCounter } from "../lib/attempts.js";
import { hashPassword, verifyPassword } from "../lib/crypto.js";
import { fail } from "../lib/errors.js";
import { adminMeView, appendAudit, parseBody } from "./admin.js";
import { normalizeWhatsapp } from "./adminAuth.js";

const PASSWORD_WINDOW_MS = 15 * 60_000;
const PASSWORD_MAX_ATTEMPTS = 8;
/** Mot de passe actuel : tentatives par compte, quel que soit le jeton. */
const passwordAttempts = new AttemptCounter(PASSWORD_MAX_ATTEMPTS, PASSWORD_WINDOW_MS);

const meUpdateSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    /** `null` efface le numéro. Une chaîne est normalisée puis validée à part. */
    whatsappNumber: z.string().trim().max(40).nullable().optional(),
    telegramChatId: z
      .string()
      .trim()
      .regex(/^-?\d{1,20}$/, "Identifiant Telegram : chiffres uniquement.")
      .nullable()
      .optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, "Aucun champ à modifier.");

const passwordChangeSchema = z
  .object({
    currentPassword: z.string().min(1).max(256),
    newPassword: z.string().min(1).max(256),
  })
  .strict();

const sessionScopeSchema = z.object({ scope: z.literal("others") }).strict();

const sessionIdSchema = z.string().trim().min(1).max(64);

function iso(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString();
}

/** Relit le compte après écriture : la réponse ne reprend jamais un état périmé. */
async function freshContext(db: Database, admin: AdminContext): Promise<AdminContext> {
  const row = await db.one<Row>("SELECT * FROM admin_users WHERE id = $1", [admin.adminId]);
  if (!row) throw fail.forbidden("Compte administrateur introuvable.");
  return buildAdminContext(db, row, admin.sessionId);
}

export function registerAdminAccountRoutes(app: FastifyInstance, db: Database): void {
  app.patch("/v1/admin/me", async (req) => {
    const admin = await requireAdmin(db, req);
    const input = parseBody(meUpdateSchema, req.body);

    const changes: Record<string, unknown> = {};
    if (input.name !== undefined) changes.name = input.name;
    if (input.telegramChatId !== undefined) changes.telegram_chat_id = input.telegramChatId;
    if (input.whatsappNumber !== undefined) {
      if (input.whatsappNumber === null) {
        changes.whatsapp_number = null;
      } else {
        const normalized = normalizeWhatsapp(input.whatsappNumber);
        if (!normalized) throw fail.validation({ whatsappNumber: "Numéro WhatsApp : 9 chiffres, préfixe +237 facultatif." });
        changes.whatsapp_number = normalized;
      }
    }

    const columns = Object.keys(changes);
    try {
      await db.tx(async (q) => {
        const before = await q.one<Row>("SELECT name, whatsapp_number, telegram_chat_id FROM admin_users WHERE id = $1", [
          admin.adminId,
        ]);
        const assignments = columns.map((column, index) => `${column} = $${index + 2}`).join(", ");
        await q.query(`UPDATE admin_users SET ${assignments} WHERE id = $1`, [
          admin.adminId,
          ...columns.map((column) => changes[column]),
        ]);
        await appendAudit(q, admin, req, {
          action: "admin.profile_update",
          targetType: "admin",
          targetId: admin.adminId,
          communityId: null,
          // Les valeurs ne sont pas journalisées : seuls les champs changés le sont.
          meta: { fields: columns },
          before: before ?? null,
        });
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw fail.conflict("Ce numéro WhatsApp est déjà utilisé.");
      throw error;
    }

    return adminMeView(await freshContext(db, admin));
  });

  app.post("/v1/admin/me/password", async (req: FastifyRequest) => {
    const admin = await requireAdmin(db, req);
    const input = parseBody(passwordChangeSchema, req.body);

    if (input.newPassword === input.currentPassword) {
      throw fail.validation({ newPassword: "Le nouveau mot de passe doit être différent de l'actuel." });
    }

    const gate = passwordAttempts.hit(admin.adminId);
    if (!gate.allowed) throw fail.rateLimited(gate.retryAfterSeconds);

    const current = await db.one<Row>("SELECT password_hash FROM admin_users WHERE id = $1", [admin.adminId]);
    if (!current || !verifyPassword(input.currentPassword, String(current.password_hash))) {
      throw fail.validation({ currentPassword: "Mot de passe actuel incorrect." });
    }
    passwordAttempts.reset(admin.adminId);

    const session = await db.tx(async (q) => {
      await q.query("UPDATE admin_users SET password_hash = $2, must_change_password = false WHERE id = $1", [
        admin.adminId,
        hashPassword(input.newPassword),
      ]);
      await q.query("UPDATE admin_sessions SET revoked_at = now() WHERE admin_id = $1 AND revoked_at IS NULL", [
        admin.adminId,
      ]);
      const opened = await openAdminSession(q, { adminId: admin.adminId, userAgent: req.headers["user-agent"] ?? null });
      await appendAudit(q, admin, req, {
        action: "admin.password_change",
        targetType: "admin",
        targetId: admin.adminId,
        communityId: null,
      });
      return opened;
    });

    return { token: session.token, expiresAt: session.expiresAt.toISOString() };
  });

  app.get("/v1/admin/me/sessions", async (req) => {
    const admin = await requireAdmin(db, req);
    // Une session plus vieille que la durée du jeton ne sert plus : on ne la montre pas.
    const rows = await db.query<Row>(
      `SELECT id, created_at, last_seen_at, user_agent
         FROM admin_sessions
        WHERE admin_id = $1 AND revoked_at IS NULL AND created_at > now() - interval '8 hours'
        ORDER BY last_seen_at DESC
        LIMIT 100`,
      [admin.adminId],
    );
    return {
      sessions: rows.map((row) => ({
        id: String(row.id),
        createdAt: iso(row.created_at),
        lastSeenAt: iso(row.last_seen_at),
        userAgent: (row.user_agent as string | null) ?? null,
        current: String(row.id) === admin.sessionId,
      })),
    };
  });

  app.delete("/v1/admin/me/sessions", async (req, reply) => {
    const admin = await requireAdmin(db, req);
    parseBody(sessionScopeSchema, req.query);
    await db.query(
      "UPDATE admin_sessions SET revoked_at = now() WHERE admin_id = $1 AND id <> $2 AND revoked_at IS NULL",
      [admin.adminId, admin.sessionId],
    );
    await appendAudit(db, admin, req, {
      action: "admin.sessions_revoke",
      targetType: "admin",
      targetId: admin.adminId,
      communityId: null,
      meta: { scope: "others" },
    });
    return reply.code(204).send();
  });

  app.delete<{ Params: { sessionId: string } }>("/v1/admin/me/sessions/:sessionId", async (req, reply) => {
    const admin = await requireAdmin(db, req);
    const sessionId = sessionIdSchema.safeParse(req.params.sessionId);
    if (!sessionId.success) throw fail.notFound("Session introuvable.");

    const revoked = await db.query<Row>(
      `UPDATE admin_sessions SET revoked_at = now()
        WHERE id = $1 AND admin_id = $2 AND revoked_at IS NULL
        RETURNING id`,
      [sessionId.data, admin.adminId],
    );
    if (revoked.length === 0) throw fail.notFound("Session introuvable.");

    await appendAudit(db, admin, req, {
      action: "admin.session_revoke",
      targetType: "admin_session",
      targetId: sessionId.data,
      communityId: null,
    });
    return reply.code(204).send();
  });

  app.post("/v1/admin/auth/logout", async (req, reply) => {
    const admin = await requireAdmin(db, req);
    await db.query("UPDATE admin_sessions SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL", [
      admin.sessionId,
    ]);
    return reply.code(204).send();
  });
}
