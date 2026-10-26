import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import type { Database, Queryable, Row } from "../db.js";
import { buildAdminContext, openAdminSession, type AdminContext } from "../lib/auth.js";
import { AttemptCounter } from "../lib/attempts.js";
import { hashPassword, newId, verifyPassword } from "../lib/crypto.js";
import { fail } from "../lib/errors.js";
import { adminMeView, appendAudit, parseBody } from "./admin.js";

/**
 * Connexion du dashboard.
 *
 * Elle est séparée des routes d'administration parce qu'elle est la seule à ne
 * pas exiger de jeton — donc la seule exposée à une devinette de mot de passe.
 *
 * Deux compteurs, pas un :
 * - par **couple compte + IP** : un attaquant qui vise un compte depuis une
 *   adresse ne verrouille pas ce compte pour les autres adresses. Un compteur
 *   par compte seul laisserait un tiers verrouiller le propriétaire ;
 * - par **IP** : un attaquant qui balaie plusieurs comptes depuis une même
 *   adresse est freiné.
 *
 * Seuls les échecs sont journalisés (`admin.login_failed`), sans jamais dire si
 * le compte existe. Un succès remet le compteur du couple à zéro.
 *
 * En mémoire : sur plusieurs instances, la limite est par instance. C'est
 * assumé — un verrou distribué demanderait Redis, qui n'existe pas ici.
 */

const WINDOW_MS = 15 * 60_000;
const MAX_PER_ACCOUNT_IP = 8;
const MAX_PER_IP = 20;

const accountAttempts = new AttemptCounter(MAX_PER_ACCOUNT_IP, WINDOW_MS);
const ipAttempts = new AttemptCounter(MAX_PER_IP, WINDOW_MS);

/**
 * Hachage factice pour les comptes inconnus : la réponse prend le même temps
 * que pour un compte existant, et un chronomètre ne dit donc pas quels comptes
 * existent.
 */
const UNKNOWN_ACCOUNT_HASH = hashPassword(randomUUID());

/** Numéro WhatsApp : 9 chiffres, préfixe +237 facultatif, espaces et tirets ignorés. */
const WHATSAPP_RE = /^(?:\+?237)?(\d{9})$/;

/** Forme canonique stockée : les 9 chiffres seuls. */
export function normalizeWhatsapp(raw: string): string | null {
  const compact = raw.replace(/[\s.-]/g, "");
  const match = WHATSAPP_RE.exec(compact);
  return match?.[1] ?? null;
}

export type LoginIdentity = { kind: "email"; value: string } | { kind: "whatsapp"; value: string };

/** Un identifiant est un courriel s'il contient « @ », sinon un numéro WhatsApp. */
export function normalizeIdentifier(raw: string): LoginIdentity | null {
  const trimmed = raw.trim();
  if (trimmed.includes("@")) {
    const email = trimmed.toLowerCase();
    return z.string().email().max(190).safeParse(email).success ? { kind: "email", value: email } : null;
  }
  const phone = normalizeWhatsapp(trimmed);
  return phone ? { kind: "whatsapp", value: phone } : null;
}

const LoginBody = z
  .object({
    identifier: z.string().trim().min(3).max(190).optional(),
    /** Forme historique, toujours acceptée : le dashboard actuel envoie `email`. */
    email: z.string().trim().min(3).max(190).optional(),
    password: z.string().min(1).max(200),
  })
  .strict()
  .refine((value) => value.identifier !== undefined || value.email !== undefined, "Identifiant requis.");

/** Échec de connexion journalisé : jamais le mot de passe, jamais l'identifiant saisi. */
async function recordFailure(q: Queryable, req: FastifyRequest, adminId: string | null, reason: string): Promise<void> {
  const userAgent = req.headers["user-agent"];
  await q.query(
    `INSERT INTO audit_log
       (id, actor_id, actor_type, actor_role, action, target, target_type, target_id,
        community_id, ip, user_agent, meta, before_state, after_state)
     VALUES ($1, $2, 'admin', NULL, 'admin.login_failed', $3, 'admin', $4, NULL, $5, $6, $7::jsonb, NULL, NULL)`,
    [
      newId(),
      adminId,
      `admin:${adminId ?? "inconnu"}`,
      adminId ?? "inconnu",
      req.ip ?? null,
      typeof userAgent === "string" ? userAgent.slice(0, 300) : null,
      JSON.stringify({ reason }),
    ],
  );
}

export function registerAdminAuthRoutes(app: FastifyInstance, db: Database): void {
  app.post("/v1/admin/auth/login", async (req) => {
    const input = parseBody(LoginBody, req.body);
    const identity = normalizeIdentifier(input.identifier ?? input.email ?? "");
    if (!identity) {
      throw fail.validation({ identifier: "Email ou numéro WhatsApp invalide." });
    }

    const ip = req.ip ?? "";
    const accountKey = `${identity.value}|${ip}`;
    const ipGate = ipAttempts.hit(ip);
    if (!ipGate.allowed) throw fail.rateLimited(ipGate.retryAfterSeconds);
    const accountGate = accountAttempts.hit(accountKey);
    if (!accountGate.allowed) throw fail.rateLimited(accountGate.retryAfterSeconds);

    const admin =
      identity.kind === "email"
        ? await db.one<Row>("SELECT * FROM admin_users WHERE email = $1", [identity.value])
        : await db.one<Row>("SELECT * FROM admin_users WHERE whatsapp_number = $1", [identity.value]);

    // Même réponse pour « inconnu » et « mauvais mot de passe » : la différence
    // dirait quels comptes existent.
    const passwordOk = verifyPassword(input.password, String(admin?.password_hash ?? UNKNOWN_ACCOUNT_HASH));
    if (!admin || !passwordOk) {
      await recordFailure(db, req, admin ? String(admin.id) : null, admin ? "bad_password" : "unknown_account");
      throw fail.invalidCredentials();
    }
    if (!admin.active) {
      await recordFailure(db, req, String(admin.id), "inactive");
      throw fail.forbidden("Compte administrateur désactivé.");
    }

    accountAttempts.reset(accountKey);

    const adminId = String(admin.id);
    const session = await openAdminSession(db, { adminId, userAgent: req.headers["user-agent"] ?? null });
    const context: AdminContext = await buildAdminContext(db, admin, session.sessionId);

    await appendAudit(db, context, req, {
      action: "admin.login",
      targetType: "admin",
      targetId: adminId,
      communityId: null,
    });

    const expiresAt = session.expiresAt.toISOString();
    return {
      token: session.token,
      expiresAt,
      mustChangePassword: context.mustChangePassword,
      // Alias de compatibilité : le dashboard lit l'un ou l'autre.
      accessToken: session.token,
      accessExpiresAt: expiresAt,
      admin: adminMeView(context),
    };
  });
}
