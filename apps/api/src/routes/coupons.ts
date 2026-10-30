/**
 * Coupons de réduction (104).
 *
 * Administration :
 * - `GET  /v1/admin/apps/:appId/coupon-types`   types d'une app — owner seul
 * - `POST /v1/admin/apps/:appId/coupon-types`   créer un type (libellé, minutes) — owner seul
 * - `GET  /v1/admin/users/:userId/coupon-types` types proposables pour cet abonné — `coupon.issue`
 * - `GET  /v1/admin/users/:userId/coupons`      coupons émis pour cet abonné — `coupon.issue`
 * - `POST /v1/admin/users/:userId/coupons`      émettre un coupon ; le code n'est renvoyé qu'ici
 * - `POST /v1/admin/coupons/:couponId/revoke`   annuler un coupon non utilisé — `coupon.issue`
 *
 * Application :
 * - `POST /v1/me/coupons/redeem` `{ code }`     bearer + preuve d'appareil (`requireSession`)
 *
 * Le périmètre vient toujours de la ligne lue (app, abonné, coupon), jamais
 * du corps : même invariant que `admin.ts`.
 */
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { env } from "../config.js";
import type { Database, Row } from "../db.js";
import { AttemptCounter } from "../lib/attempts.js";
import { requireAdmin, scopedCommunity, type AdminContext } from "../lib/auth.js";
import { newId } from "../lib/crypto.js";
import { fail } from "../lib/errors.js";
import {
  COUPON_SELECT,
  COUPON_VALID_DAYS_DEFAULT,
  COUPON_VALID_DAYS_MAX,
  couponDto,
  couponTypeDto,
  issueCoupon,
  redeemCoupon,
} from "../services/coupons.js";
import { MAX_DURATION_MINUTES } from "../services/planTerms.js";
import { appendAudit, parseBody, permitted } from "./admin.js";
import { requireSession } from "./me.js";

const PREFIX = "/v1/admin";

const typeCreateSchema = z
  .object({
    label: z.string().trim().min(2).max(60),
    durationMinutes: z.number().int().min(1).max(MAX_DURATION_MINUTES),
  })
  .strict();

const issueSchema = z
  .object({
    typeId: z.string().trim().min(1).max(190),
    /** Validité du code avant utilisation, en jours. */
    validDays: z.number().int().min(1).max(COUPON_VALID_DAYS_MAX).optional(),
  })
  .strict();

const redeemSchema = z
  .object({
    code: z.string().trim().min(1).max(64),
  })
  .strict();

function authorize(admin: AdminContext, capability: "coupon_type.manage" | "coupon.issue", communityId: string): void {
  if (!permitted(admin, capability, communityId)) throw fail.forbidden("Action non autorisée pour votre rôle.");
}

async function mustUser(db: Database, userId: string): Promise<Row> {
  const user = await db.one<Row>("SELECT id, app_id, community_id, deleted_at FROM users WHERE id = $1", [userId]);
  if (!user) throw fail.notFound("Abonné introuvable.");
  return user;
}

async function couponTypesOf(db: Database, appId: string): Promise<Row[]> {
  return db.query<Row>(
    "SELECT id, app_id, label, duration_minutes, created_at FROM coupon_types WHERE app_id = $1 ORDER BY duration_minutes ASC, created_at ASC",
    [appId],
  );
}

export function registerCouponRoutes(app: FastifyInstance, db: Database): void {
  /* ------------------------------------------------- types (owner seul) */

  app.get<{ Params: { appId: string } }>(`${PREFIX}/apps/:appId/coupon-types`, async (req) => {
    const admin = await requireAdmin(db, req);
    const appRow = await db.one<Row>("SELECT id, community_id FROM apps WHERE id = $1", [req.params.appId]);
    if (!appRow) throw fail.notFound("Application introuvable.");
    const communityId = scopedCommunity(admin, String(appRow.community_id)) as string;
    authorize(admin, "coupon_type.manage", communityId);
    return { items: (await couponTypesOf(db, req.params.appId)).map(couponTypeDto) };
  });

  app.post<{ Params: { appId: string } }>(`${PREFIX}/apps/:appId/coupon-types`, async (req, reply) => {
    const admin = await requireAdmin(db, req);
    const appRow = await db.one<Row>("SELECT id, community_id FROM apps WHERE id = $1", [req.params.appId]);
    if (!appRow) throw fail.notFound("Application introuvable.");
    const communityId = scopedCommunity(admin, String(appRow.community_id)) as string;
    authorize(admin, "coupon_type.manage", communityId);
    const input = parseBody(typeCreateSchema, req.body);
    const typeId = newId();
    await db.tx(async (q) => {
      await q.query(
        `INSERT INTO coupon_types (id, app_id, label, duration_minutes, created_by)
         VALUES ($1, $2, $3, $4, $5)`,
        [typeId, req.params.appId, input.label, input.durationMinutes, admin.adminId],
      );
      await appendAudit(q, admin, req, {
        action: "coupon_type.create",
        targetType: "coupon_type",
        targetId: typeId,
        communityId,
        after: { appId: req.params.appId, label: input.label, durationMinutes: input.durationMinutes },
      });
    });
    const row = await db.one<Row>("SELECT id, app_id, label, duration_minutes, created_at FROM coupon_types WHERE id = $1", [typeId]);
    return reply.code(201).send(couponTypeDto(row as Row));
  });

  /* ------------------------------------------- coupons d'un abonné (admin) */

  app.get<{ Params: { userId: string } }>(`${PREFIX}/users/:userId/coupon-types`, async (req) => {
    const admin = await requireAdmin(db, req);
    const user = await mustUser(db, req.params.userId);
    const communityId = scopedCommunity(admin, String(user.community_id)) as string;
    authorize(admin, "coupon.issue", communityId);
    return { items: (await couponTypesOf(db, String(user.app_id))).map(couponTypeDto) };
  });

  app.get<{ Params: { userId: string } }>(`${PREFIX}/users/:userId/coupons`, async (req) => {
    const admin = await requireAdmin(db, req);
    const user = await mustUser(db, req.params.userId);
    const communityId = scopedCommunity(admin, String(user.community_id)) as string;
    authorize(admin, "coupon.issue", communityId);
    const rows = await db.query<Row>(`${COUPON_SELECT} WHERE c.user_id = $1 ORDER BY c.issued_at DESC, c.id DESC LIMIT 50`, [
      user.id,
    ]);
    return { items: rows.map(couponDto) };
  });

  app.post<{ Params: { userId: string } }>(`${PREFIX}/users/:userId/coupons`, async (req, reply) => {
    const admin = await requireAdmin(db, req);
    const user = await mustUser(db, req.params.userId);
    const communityId = scopedCommunity(admin, String(user.community_id)) as string;
    authorize(admin, "coupon.issue", communityId);
    if (user.deleted_at) throw fail.conflict("Ce compte est supprimé : aucun coupon ne peut lui être émis.");
    const input = parseBody(issueSchema, req.body);

    // Décision owner 2 : uniquement un type défini par l'owner pour l'app de l'abonné.
    const type = await db.one<Row>("SELECT id, app_id, label, duration_minutes FROM coupon_types WHERE id = $1", [input.typeId]);
    if (!type || type.app_id !== user.app_id) throw fail.notFound("Type de coupon introuvable pour cette application.");

    const validDays = input.validDays ?? COUPON_VALID_DAYS_DEFAULT;
    const issued = await db.tx(async (q) => {
      const result = await issueCoupon(q, { typeId: String(type.id), userId: String(user.id), adminId: admin.adminId, validDays });
      // Le code n'entre jamais dans le journal : ni en clair, ni haché.
      await appendAudit(q, admin, req, {
        action: "coupon.issue",
        targetType: "coupon",
        targetId: result.couponId,
        communityId,
        after: {
          userId: user.id,
          typeId: type.id,
          label: type.label,
          durationMinutes: Number(type.duration_minutes),
          validDays,
        },
      });
      return result;
    });

    const row = await db.one<Row>(`${COUPON_SELECT} WHERE c.id = $1`, [issued.couponId]);
    // Affiché une seule fois : rien ne doit le garder en cache.
    reply.header("cache-control", "no-store");
    return reply.code(201).send({ coupon: couponDto(row as Row), code: issued.code });
  });

  app.post<{ Params: { couponId: string } }>(`${PREFIX}/coupons/:couponId/revoke`, async (req) => {
    const admin = await requireAdmin(db, req);
    const coupon = await db.one<Row>(
      "SELECT c.id, c.status, u.community_id FROM coupons c JOIN users u ON u.id = c.user_id WHERE c.id = $1",
      [req.params.couponId],
    );
    if (!coupon) throw fail.notFound("Coupon introuvable.");
    const communityId = scopedCommunity(admin, String(coupon.community_id)) as string;
    authorize(admin, "coupon.issue", communityId);

    await db.tx(async (q) => {
      const rows = await q.query(
        "UPDATE coupons SET status = 'revoked' WHERE id = $1 AND status = 'issued' RETURNING id",
        [coupon.id],
      );
      if (rows.length !== 1) throw fail.conflict("Seul un coupon pas encore utilisé peut être annulé.");
      await appendAudit(q, admin, req, {
        action: "coupon.revoke",
        targetType: "coupon",
        targetId: String(coupon.id),
        communityId,
        before: { status: "issued" },
        after: { status: "revoked" },
      });
    });
    const row = await db.one<Row>(`${COUPON_SELECT} WHERE c.id = $1`, [coupon.id]);
    return { coupon: couponDto(row as Row) };
  });

  /* ------------------------------------------------- utilisation (app) */

  // Ralentisseur par compte, local au processus (voir lib/attempts.ts) : le
  // code est lié au compte, donc marteler des codes ne sert qu'à ce compte.
  const redeemAttempts = env.rateLimit.enforce
    ? new AttemptCounter(env.rateLimit.auth.max, env.rateLimit.auth.windowMs)
    : null;

  app.post("/v1/me/coupons/redeem", async (req: FastifyRequest) => {
    const auth = await requireSession(db, req);
    if (redeemAttempts) {
      const attempt = redeemAttempts.hit(`coupon:${auth.userId}`);
      if (!attempt.allowed) throw fail.rateLimited(attempt.retryAfterSeconds);
    }
    const input = parseBody(redeemSchema, req.body);
    // Identifiant d'appareil : celui de la session, donc de l'enrôlement
    // (`devices.id`, 1:1 avec l'`installationId` de l'app). Jamais lu du corps.
    const redeemed = await redeemCoupon(db, { userId: auth.userId, deviceId: auth.deviceId, code: input.code });
    return {
      coupon: { id: redeemed.couponId, label: redeemed.label, durationMinutes: redeemed.durationMinutes },
      subscription: { startsAt: redeemed.startsAt.toISOString(), endsAt: redeemed.endsAt.toISOString() },
    };
  });
}
