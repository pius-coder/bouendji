import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import type { Database, Row } from "../db.js";
import { issueAdminToken, type AdminMembership, type AdminContext, type PlatformRole } from "../lib/auth.js";
import { verifyPassword } from "../lib/crypto.js";
import { fail } from "../lib/errors.js";
import { appendAudit, parseBody } from "./admin.js";

/**
 * Connexion du dashboard.
 *
 * Elle est séparée des routes d'administration parce qu'elle est la seule à ne
 * pas exiger de jeton — donc la seule exposée à une devinette de mot de passe.
 * Deux compteurs, pas un : par adresse IP (un attaquant qui balaie) et par
 * compte (un attaquant qui vise). Un compteur seulement par IP laisserait
 * passer un essai lent sur un compte précis ; un compteur seulement par compte
 * laisserait verrouiller le propriétaire depuis un réseau tiers.
 *
 * En mémoire : sur plusieurs instances, la limite est par instance. C'est
 * assumé et écrit dans le rapport — un verrou distribué demanderait Redis, qui
 * n'existe pas dans cette architecture.
 */

const LoginBody = z
  .object({
    email: z.string().trim().toLowerCase().email().max(190),
    password: z.string().min(1).max(200),
  })
  .strict();

const WINDOW_MS = 15 * 60_000;
const MAX_PER_IP = 20;
const MAX_PER_ACCOUNT = 8;

interface Bucket {
  count: number;
  resetAt: number;
}

function newLimiter() {
  const buckets = new Map<string, Bucket>();

  return {
    hit(key: string, max: number): void {
      const now = Date.now();
      // Nettoyage à l'occasion : sans lui, la table grossit indéfiniment sur un
      // service qui tourne 4 h.
      if (buckets.size > 5_000) {
        for (const [candidate, bucket] of buckets) {
          if (bucket.resetAt <= now) buckets.delete(candidate);
        }
      }
      const bucket = buckets.get(key);
      if (!bucket || bucket.resetAt <= now) {
        buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
        return;
      }
      bucket.count += 1;
      if (bucket.count > max) {
        throw fail.rateLimited(Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)));
      }
    },
    clear(key: string): void {
      buckets.delete(key);
    },
  };
}

export function registerAdminAuthRoutes(app: FastifyInstance, db: Database): void {
  const limiter = newLimiter();

  app.post("/v1/admin/auth/login", async (req: FastifyRequest) => {
    const input = parseBody(LoginBody, req.body);

    limiter.hit(`ip:${req.ip}`, MAX_PER_IP);
    const accountKey = `account:${input.email}`;
    limiter.hit(accountKey, MAX_PER_ACCOUNT);

    const admin = await db.one<Row>("SELECT * FROM admin_users WHERE email = $1", [input.email]);
    // Même réponse pour « inconnu » et « mauvais mot de passe » : la différence
    // dirait quels courriels existent.
    if (!admin || !verifyPassword(input.password, String(admin.password_hash))) {
      throw fail.invalidCredentials();
    }
    if (!admin.active) throw fail.forbidden("Compte administrateur désactivé.");

    limiter.clear(accountKey);

    const platformRole: PlatformRole = admin.platform_role === "owner" ? "owner" : "none";
    const { token, expiresAt } = await issueAdminToken({
      adminId: String(admin.id),
      role: platformRole === "owner" ? "platform" : "partner",
      communityId: null,
    });

    const memberships = await db.query<Row>(
      `SELECT id, community_id, role
         FROM community_memberships
        WHERE admin_user_id = $1 AND status = 'active'
        ORDER BY community_id`,
      [admin.id],
    );

    const context: AdminContext = {
      adminId: String(admin.id),
      platformRole,
      memberships: memberships.map(
        (row): AdminMembership => ({
          id: String(row.id),
          communityId: String(row.community_id),
          role: String(row.role) as AdminMembership["role"],
        }),
      ),
      admin,
    };

    await appendAudit(db, context, req, {
      action: "admin.login",
      targetType: "admin",
      targetId: String(admin.id),
      communityId: null,
    });

    return {
      // Deux noms pour le même jeton : le dashboard lit l'un ou l'autre.
      accessToken: token,
      token,
      accessExpiresAt: expiresAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      admin: {
        id: String(admin.id),
        email: String(admin.email),
        name: String(admin.name),
        platformRole,
        memberships: context.memberships.map((membership) => ({
          communityId: membership.communityId,
          role: membership.role,
        })),
      },
    };
  });
}
