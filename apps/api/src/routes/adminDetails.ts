/**
 * Fiches de détail, recherche et résumé d'accueil (lot R3).
 *
 * Invariants, dans l'esprit de `admin.ts` :
 *
 * 1. **Le périmètre part de la ligne lue, jamais du corps.** Chaque fiche lit
 *    d'abord la ligne (abonné, commande, appareil, versement), en déduit sa
 *    communauté, puis `scopeRead` : `scopedCommunity` refuse une communauté
 *    étrangère par un 403, et `canRead` applique la matrice de lecture.
 * 2. **Aucune donnée technique d'un appareil ou d'un nœud.** Ni clé de
 *    signature, ni hachage de jeton, ni jeton push, ni URL de paiement, ni
 *    credential : une fiche dit ce qui s'est passé, jamais comment se connecter.
 * 3. **Les montants suivent `seesMoney`** : owner, `community_admin` et `finance`
 *    de la communauté. Un `support` reçoit des compteurs, jamais une somme.
 *
 * Écart assumé : `permitted()` (admin.ts) n'est pas exporté (propriété du lot
 * R1). `canRead` reprend les lignes de lecture de sa matrice ; quand R1 exporte
 * `permitted`, remplacer `canRead` par un appel (voir le rapport R3).
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Database, Row } from "../db.js";
import { requireAdmin, roleInCommunity, scopedCommunity, type AdminContext } from "../lib/auth.js";
import { fail } from "../lib/errors.js";
import { parseBody } from "./admin.js";

const PREFIX = "/v1/admin";
/** Fuseau d'exploitation : les « jour » et « mois » d'une communauté camerounaise. */
const TZ = "Africa/Douala";

type ReadKind = "member" | "order" | "commission" | "community";

/** Lecture par rôle de communauté (lignes de lecture de la matrice `permitted`). */
function canRead(admin: AdminContext, kind: ReadKind, communityId: string): boolean {
  if (admin.platformRole === "owner") return true;
  const local = roleInCommunity(admin, communityId);
  switch (kind) {
    case "member":
      return local === "community_admin" || local === "support";
    case "order":
    case "community":
      return local !== null;
    case "commission":
      return local === "community_admin" || local === "finance";
  }
}

/**
 * Résout une communauté de ligne et vérifie la lecture. Une ligne sans
 * communauté (appareil non rattaché) n'est lisible que par l'owner.
 */
function scopeRead(admin: AdminContext, communityId: string | null, kind: ReadKind): string | null {
  if (communityId === null) {
    if (admin.platformRole === "owner") return null;
    throw fail.forbidden("Action non autorisée pour votre rôle.");
  }
  scopedCommunity(admin, communityId); // 403 hors périmètre, jamais 404
  if (!canRead(admin, kind, communityId)) throw fail.forbidden("Action non autorisée pour votre rôle.");
  return communityId;
}

function seesMoney(admin: AdminContext, communityId: string | null): boolean {
  if (admin.platformRole === "owner") return true;
  const local = communityId ? roleInCommunity(admin, communityId) : null;
  return local === "community_admin" || local === "finance";
}

function iso(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString();
}

/* ------------------------------------------------------------ projections */

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

function payoutDto(row: Row) {
  return {
    id: row.id as string,
    communityId: row.community_id as string,
    communityName: (row.community_name as string | null) ?? null,
    amountXaf: Number(row.amount_xaf),
    currency: "XAF",
    status: row.status as string,
    note: (row.note as string | null) ?? null,
    providerRef: (row.provider_ref as string | null) ?? null,
    createdBy: (row.created_by as string | null) ?? null,
    approvedBy: (row.approved_by as string | null) ?? null,
    approvedAt: iso(row.approved_at),
    claimedAt: iso(row.claimed_at),
    attempts: Number(row.attempts ?? 0),
    failedReason: (row.failed_reason as string | null) ?? null,
    confirmedAt: iso(row.confirmed_at),
    resolvedBy: (row.resolved_by as string | null) ?? null,
    createdAt: iso(row.created_at),
    paidAt: iso(row.paid_at),
  };
}

/* ----------------------------------------------------------- recherche */

/** Échappe `%`, `_` et `!` (caractère d'échappement de `LIKE ... ESCAPE '!'`). */
const escapeLike = (value: string): string => value.replace(/[!%_]/g, (c) => `!${c}`);

/** Condition `colonne IN (...)` ; `null` = toutes les communautés (owner). */
function inClause(column: string, values: string[] | null, params: unknown[]): string {
  if (values === null) return "TRUE";
  if (values.length === 0) return "FALSE";
  const marks = values.map((value) => {
    params.push(value);
    return `$${params.length}`;
  });
  return `${column} IN (${marks.join(", ")})`;
}

const searchQuerySchema = z.object({
  q: z.string().trim().min(2, "Deux caractères minimum.").max(64),
});

/* ------------------------------------------------------------- routes */

export function registerAdminDetailRoutes(app: FastifyInstance, db: Database): void {
  /* --------------------------------------------------------- abonné */

  app.get<{ Params: { id: string } }>(`${PREFIX}/users/:id`, async (req) => {
    const admin = await requireAdmin(db, req);
    const user = await db.one<Row>(
      `SELECT u.id, u.app_id, u.community_id, u.email, u.name, u.phone, u.locale,
              u.email_verified_at, u.deleted_at, u.created_at, a.name AS app_name
         FROM users u
         JOIN apps a ON a.id = u.app_id
        WHERE u.id = $1`,
      [req.params.id],
    );
    if (!user) throw fail.notFound("Abonné introuvable.");
    const communityId = scopeRead(admin, String(user.community_id), "member");
    const userId = String(user.id);

    // Abonnement en cours : actif et non échu. Le plus lointain l'emporte.
    const subscription = await db.one<Row>(
      `SELECT s.id, s.status, s.starts_at, s.ends_at, p.code AS plan_code, p.name AS plan_name
         FROM subscriptions s
         JOIN plans p ON p.id = s.plan_id
        WHERE s.user_id = $1 AND s.status = 'active' AND s.ends_at > now()
        ORDER BY s.ends_at DESC
        LIMIT 1`,
      [userId],
    );

    // Consommation : somme des jours de la période de l'abonnement, source
    // `device` (la même que `/v1/me/stats`, pour que l'abonné et l'admin lisent
    // le même chiffre).
    let usage: Record<string, unknown> | null = null;
    if (subscription) {
      const totals = await db.one<Row>(
        `SELECT COALESCE(SUM(ud.bytes_up), 0)   AS bytes_up,
                COALESCE(SUM(ud.bytes_down), 0) AS bytes_down,
                COALESCE(SUM(ud.seconds), 0)    AS seconds
           FROM usage_daily ud
           JOIN devices d ON d.id = ud.device_id
           JOIN subscriptions s ON s.id = $2
          WHERE d.user_id = $1
            AND ud.source = 'device'
            AND ud.day >= (s.starts_at AT TIME ZONE '${TZ}')::date
            AND ud.day <= (s.ends_at AT TIME ZONE '${TZ}')::date`,
        [userId, subscription.id],
      );
      usage = {
        bytesUp: Number(totals?.bytes_up ?? 0),
        bytesDown: Number(totals?.bytes_down ?? 0),
        seconds: Number(totals?.seconds ?? 0),
        periodStart: iso(subscription.starts_at),
        periodEnd: iso(subscription.ends_at),
      };
    }

    const devices = await db.query<Row>(
      `SELECT id, name, platform, status, integrity_ok, last_seen_at, revoked_at, created_at
         FROM devices WHERE user_id = $1
        ORDER BY created_at DESC, id DESC LIMIT 50`,
      [userId],
    );
    const orders = await db.query<Row>(
      `SELECT id, user_id, plan_id, status, currency, amount_xaf, commission_bps, commission_xaf,
              created_at, paid_at, activated_at
         FROM orders WHERE user_id = $1
        ORDER BY created_at DESC, id DESC LIMIT 20`,
      [userId],
    );
    const bundles = await db.query<Row>(
      `SELECT id, device_id, not_after, consumed_at, created_at
         FROM offline_bundles WHERE user_id = $1
        ORDER BY created_at DESC, id DESC LIMIT 10`,
      [userId],
    );

    const withMoney = seesMoney(admin, communityId);
    return {
      id: userId,
      communityId,
      app: { id: String(user.app_id), name: String(user.app_name) },
      email: user.email as string,
      name: user.name as string,
      phone: (user.phone as string | null) ?? null,
      locale: user.locale as string,
      emailVerified: user.email_verified_at !== null,
      deleted: user.deleted_at !== null,
      createdAt: iso(user.created_at),
      subscription: subscription
        ? {
            id: subscription.id as string,
            status: subscription.status as string,
            planCode: subscription.plan_code as string,
            planName: subscription.plan_name as string,
            startsAt: iso(subscription.starts_at),
            endsAt: iso(subscription.ends_at),
          }
        : null,
      usage,
      devices: devices.map((row) => ({
        deviceId: row.id as string,
        name: row.name as string,
        platform: row.platform as string,
        status: row.status as string,
        integrityOk: row.integrity_ok === true,
        lastSeenAt: iso(row.last_seen_at),
        revokedAt: iso(row.revoked_at),
        createdAt: iso(row.created_at),
      })),
      recentOrders: orders.map((row) => orderDto(row, withMoney)),
      offlineBundles: bundles.map((row) => ({
        id: row.id as string,
        deviceId: row.device_id as string,
        notAfter: iso(row.not_after),
        consumedAt: iso(row.consumed_at),
        createdAt: iso(row.created_at),
      })),
    };
  });

  /* -------------------------------------------------------- commande */

  app.get<{ Params: { id: string } }>(`${PREFIX}/orders/:id`, async (req) => {
    const admin = await requireAdmin(db, req);
    const row = await db.one<Row>(
      `SELECT o.id, o.user_id, o.plan_id, o.community_id, o.status, o.currency, o.amount_xaf,
              o.commission_bps, o.commission_xaf, o.provider, o.provider_ref, o.failure_reason,
              o.created_at, o.paid_at, o.activated_at, o.expires_at,
              u.name AS user_name, p.code AS plan_code, p.name AS plan_name
         FROM orders o
         JOIN users u ON u.id = o.user_id
         JOIN plans p ON p.id = o.plan_id
        WHERE o.id = $1`,
      [req.params.id],
    );
    if (!row) throw fail.notFound("Commande introuvable.");
    const communityId = scopeRead(admin, String(row.community_id), "order");
    const withMoney = seesMoney(admin, communityId);

    const subscription = await db.one<Row>(
      `SELECT id, status, starts_at, ends_at FROM subscriptions WHERE order_id = $1`,
      [row.id],
    );
    // Les commissions sont de l'argent : seules les lectures « montant » les voient.
    const commissions = withMoney
      ? await db.query<Row>(
          `SELECT id, order_id, bps, amount_xaf, status, payout_id, created_at, available_at
             FROM commissions WHERE order_id = $1 ORDER BY created_at ASC, id ASC`,
          [row.id],
        )
      : [];

    return {
      ...orderDto(row, withMoney),
      communityId,
      expiresAt: iso(row.expires_at),
      provider: row.provider as string,
      failureReason: (row.failure_reason as string | null) ?? null,
      userName: row.user_name as string,
      planCode: row.plan_code as string,
      planName: row.plan_name as string,
      ...(withMoney ? { providerRef: (row.provider_ref as string | null) ?? null } : {}),
      subscription: subscription
        ? {
            id: subscription.id as string,
            status: subscription.status as string,
            startsAt: iso(subscription.starts_at),
            endsAt: iso(subscription.ends_at),
          }
        : null,
      ...(withMoney ? { commissions: commissions.map(commissionDto) } : {}),
    };
  });

  /* ------------------------------------------------------- appareil */

  app.get<{ Params: { id: string } }>(`${PREFIX}/devices/:id`, async (req) => {
    const admin = await requireAdmin(db, req);
    const device = await db.one<Row>(
      `SELECT d.id, d.user_id, d.name, d.platform, d.status, d.app_version, d.android_version,
              d.integrity_ok, d.last_seen_at, d.revoked_at, d.created_at,
              u.community_id, u.name AS user_name, u.email AS user_email
         FROM devices d
         LEFT JOIN users u ON u.id = d.user_id
        WHERE d.id = $1`,
      [req.params.id],
    );
    if (!device) throw fail.notFound("Appareil introuvable.");
    const communityId = scopeRead(admin, device.community_id ? String(device.community_id) : null, "member");

    const usage = await db.query<Row>(
      `SELECT to_char(day, 'YYYY-MM-DD') AS day, source, bytes_up, bytes_down, seconds
         FROM usage_daily WHERE device_id = $1
        ORDER BY day DESC, source ASC LIMIT 28`,
      [device.id],
    );
    // « En échec » = rapports client négatifs (`config_reports.ok = false`), sur 24 h.
    const reports = await db.one<Row>(
      `SELECT COUNT(*) FILTER (WHERE ok)     AS ok_count,
              COUNT(*) FILTER (WHERE NOT ok) AS failed_count
         FROM config_reports
        WHERE device_id = $1 AND reported_at > now() - interval '24 hours'`,
      [device.id],
    );

    return {
      deviceId: device.id as string,
      communityId,
      userId: (device.user_id as string | null) ?? null,
      userName: (device.user_name as string | null) ?? null,
      userEmail: (device.user_email as string | null) ?? null,
      name: device.name as string,
      platform: device.platform as string,
      status: device.status as string,
      appVersion: (device.app_version as string | null) ?? null,
      androidVersion: device.android_version === null ? null : Number(device.android_version),
      integrityOk: device.integrity_ok === true,
      lastSeenAt: iso(device.last_seen_at),
      revokedAt: iso(device.revoked_at),
      createdAt: iso(device.created_at),
      usage: usage.map((row) => ({
        day: row.day as string,
        source: row.source as string,
        bytesUp: Number(row.bytes_up),
        bytesDown: Number(row.bytes_down),
        seconds: Number(row.seconds),
      })),
      reports24h: {
        ok: Number(reports?.ok_count ?? 0),
        failed: Number(reports?.failed_count ?? 0),
      },
    };
  });

  /* ------------------------------------------------------- versement */

  app.get<{ Params: { id: string } }>(`${PREFIX}/payouts/:id`, async (req) => {
    const admin = await requireAdmin(db, req);
    const row = await db.one<Row>(
      `SELECT p.*, c.name AS community_name
         FROM payouts p
         JOIN communities c ON c.id = p.community_id
        WHERE p.id = $1`,
      [req.params.id],
    );
    if (!row) throw fail.notFound("Versement introuvable.");
    scopeRead(admin, String(row.community_id), "commission");

    const commissions = await db.query<Row>(
      `SELECT id, order_id, bps, amount_xaf, status, payout_id, created_at, available_at
         FROM commissions WHERE payout_id = $1
        ORDER BY created_at ASC, id ASC LIMIT 500`,
      [row.id],
    );
    return { ...payoutDto(row), commissions: commissions.map(commissionDto) };
  });

  /* ---------------------------------------------------------- résumé */

  app.get<{ Params: { communityId: string } }>(`${PREFIX}/communities/:communityId/summary`, async (req) => {
    const admin = await requireAdmin(db, req);
    const community = await db.one<Row>(
      "SELECT id, name, status, commission_bps FROM communities WHERE id = $1",
      [req.params.communityId],
    );
    if (!community) {
      // Hors périmètre : 403 d'abord (scopeRead), 404 seulement pour l'owner.
      scopedCommunity(admin, req.params.communityId);
      throw fail.notFound("Communauté introuvable.");
    }
    const communityId = scopeRead(admin, req.params.communityId, "community") as string;
    const withMoney = seesMoney(admin, communityId);

    const today = `(now() AT TIME ZONE '${TZ}')::date`;
    const sameDay = `(o.paid_at AT TIME ZONE '${TZ}')::date = ${today}`;
    const sameMonth = `date_trunc('month', o.paid_at AT TIME ZONE '${TZ}') = date_trunc('month', now() AT TIME ZONE '${TZ}')`;
    const sales = await db.one<Row>(
      `SELECT COUNT(*) FILTER (WHERE ${sameDay})                                AS day_count,
              COALESCE(SUM(o.amount_xaf) FILTER (WHERE ${sameDay}), 0)           AS day_amount,
              COUNT(*) FILTER (WHERE ${sameMonth})                              AS month_count,
              COALESCE(SUM(o.amount_xaf) FILTER (WHERE ${sameMonth}), 0)        AS month_amount
         FROM orders o
        WHERE o.community_id = $1 AND o.status = 'paid' AND o.paid_at IS NOT NULL`,
      [communityId],
    );

    const subscribers = await db.scalar<number>(
      `SELECT COUNT(DISTINCT s.user_id)
         FROM subscriptions s
         JOIN users u ON u.id = s.user_id
        WHERE u.community_id = $1 AND s.status = 'active' AND s.ends_at > now()`,
      [communityId],
    );

    const usageToday = await db.scalar<number>(
      `SELECT COALESCE(SUM(ud.bytes_up + ud.bytes_down), 0)
         FROM usage_daily ud
         JOIN devices d ON d.id = ud.device_id
         JOIN users u ON u.id = d.user_id
        WHERE u.community_id = $1 AND ud.source = 'device' AND ud.day = ${today}`,
      [communityId],
    );

    // « À traiter » : chaque entrée n'existe que si l'admin peut ouvrir l'objet.
    const todo: Array<{ kind: string; count: number; ids: string[] }> = [];
    const pendingOrders = await db.query<Row>(
      `SELECT id FROM orders WHERE community_id = $1 AND status = 'pending'
        ORDER BY created_at DESC, id DESC LIMIT 5`,
      [communityId],
    );
    const pendingOrderCount = await db.scalar<number>(
      "SELECT COUNT(*) FROM orders WHERE community_id = $1 AND status = 'pending'",
      [communityId],
    );
    todo.push({ kind: "orders_pending", count: Number(pendingOrderCount ?? 0), ids: pendingOrders.map((r) => String(r.id)) });

    if (canRead(admin, "commission", communityId)) {
      for (const status of ["pending", "needs_review"] as const) {
        const count = await db.scalar<number>(
          "SELECT COUNT(*) FROM payouts WHERE community_id = $1 AND status = $2",
          [communityId, status],
        );
        const ids = await db.query<Row>(
          `SELECT id FROM payouts WHERE community_id = $1 AND status = $2
            ORDER BY created_at ASC, id ASC LIMIT 5`,
          [communityId, status],
        );
        todo.push({
          kind: status === "pending" ? "payouts_to_approve" : "payouts_needs_review",
          count: Number(count ?? 0),
          ids: ids.map((r) => String(r.id)),
        });
      }
    }

    if (canRead(admin, "member", communityId)) {
      const failing = await db.query<Row>(
        `SELECT DISTINCT d.id
           FROM config_reports r
           JOIN devices d ON d.id = r.device_id
           JOIN users u ON u.id = d.user_id
          WHERE u.community_id = $1 AND r.ok = false AND r.reported_at > now() - interval '24 hours'
          ORDER BY d.id LIMIT 5`,
        [communityId],
      );
      const failingCount = await db.scalar<number>(
        `SELECT COUNT(DISTINCT d.id)
           FROM config_reports r
           JOIN devices d ON d.id = r.device_id
           JOIN users u ON u.id = d.user_id
          WHERE u.community_id = $1 AND r.ok = false AND r.reported_at > now() - interval '24 hours'`,
        [communityId],
      );
      todo.push({ kind: "devices_failing", count: Number(failingCount ?? 0), ids: failing.map((r) => String(r.id)) });
    }

    let commissionsAvailable: { count: number; amountXaf: number } | null = null;
    if (withMoney) {
      const row = await db.one<Row>(
        `SELECT COUNT(*) AS n, COALESCE(SUM(amount_xaf), 0) AS amount
           FROM commissions WHERE community_id = $1 AND status = 'available'`,
        [communityId],
      );
      commissionsAvailable = { count: Number(row?.n ?? 0), amountXaf: Number(row?.amount ?? 0) };
    }

    return {
      communityId,
      name: community.name as string,
      status: community.status as string,
      commissionBps: Number(community.commission_bps),
      sales: {
        today: {
          count: Number(sales?.day_count ?? 0),
          ...(withMoney ? { amountXaf: Number(sales?.day_amount ?? 0) } : {}),
        },
        month: {
          count: Number(sales?.month_count ?? 0),
          ...(withMoney ? { amountXaf: Number(sales?.month_amount ?? 0) } : {}),
        },
      },
      activeSubscribers: Number(subscribers ?? 0),
      usageTodayBytes: Number(usageToday ?? 0),
      ...(withMoney ? { commissionsAvailable } : {}),
      todo,
    };
  });

  /* ---------------------------------------------------------- recherche */

  app.get(`${PREFIX}/search`, async (req) => {
    const admin = await requireAdmin(db, req);
    const { q } = parseBody(searchQuerySchema, req.query);

    // Périmètre : owner = tout ; sinon les communautés où le rôle lit les abonnés
    // (community_admin, support) pour les personnes et appareils, et toutes les
    // communautés de l'admin pour les commandes (lecture « sa communauté »).
    if (admin.platformRole !== "owner" && admin.memberships.length === 0) {
      throw fail.forbidden("Aucune communauté rattachée à ce compte.");
    }
    const memberCommunities =
      admin.platformRole === "owner"
        ? null
        : admin.memberships
            .filter((m) => m.role === "community_admin" || m.role === "support")
            .map((m) => m.communityId);
    const orderCommunities =
      admin.platformRole === "owner" ? null : admin.memberships.map((m) => m.communityId);

    const contains = `%${escapeLike(q)}%`;
    const prefix = `${escapeLike(q)}%`;
    const digits = q.replace(/\D/g, "");

    // Abonnés : nom, ou téléphone (chiffres seuls, à partir de 4 chiffres).
    const userParams: unknown[] = [];
    const userScope = inClause("u.community_id", memberCommunities, userParams);
    userParams.push(contains);
    const nameIdx = userParams.length;
    let phoneMatch = "FALSE";
    if (digits.length >= 4) {
      userParams.push(`%${digits}%`);
      phoneMatch = `regexp_replace(COALESCE(u.phone, ''), '\\D', '', 'g') LIKE $${userParams.length}`;
    }
    const users = await db.query<Row>(
      `SELECT u.id, u.name, u.phone, u.community_id
         FROM users u
        WHERE ${userScope} AND (u.name ILIKE $${nameIdx} ESCAPE '!' OR ${phoneMatch})
        ORDER BY u.created_at DESC, u.id DESC LIMIT 10`,
      userParams,
    );

    // Appareils : identifiant exact ou préfixe.
    const deviceParams: unknown[] = [];
    const deviceScope = inClause("u.community_id", memberCommunities, deviceParams);
    deviceParams.push(q, prefix);
    const devices = await db.query<Row>(
      `SELECT d.id, d.name, d.user_id, u.community_id
         FROM devices d
         JOIN users u ON u.id = d.user_id
        WHERE ${deviceScope} AND (d.id = $${deviceParams.length - 1} OR d.id LIKE $${deviceParams.length} ESCAPE '!')
        ORDER BY d.created_at DESC, d.id DESC LIMIT 10`,
      deviceParams,
    );

    // Commandes : identifiant exact ou préfixe.
    const orderParams: unknown[] = [];
    const orderScope = inClause("o.community_id", orderCommunities, orderParams);
    orderParams.push(q, prefix);
    const orders = await db.query<Row>(
      `SELECT o.id, o.status, o.community_id, o.created_at
         FROM orders o
        WHERE ${orderScope} AND (o.id = $${orderParams.length - 1} OR o.id LIKE $${orderParams.length} ESCAPE '!')
        ORDER BY o.created_at DESC, o.id DESC LIMIT 10`,
      orderParams,
    );

    return {
      q,
      subscribers: users.map((row) => ({
        id: row.id as string,
        name: row.name as string,
        phone: (row.phone as string | null) ?? null,
        communityId: row.community_id as string,
      })),
      devices: devices.map((row) => ({
        deviceId: row.id as string,
        name: row.name as string,
        userId: row.user_id as string,
        communityId: row.community_id as string,
      })),
      orders: orders.map((row) => ({
        id: row.id as string,
        status: row.status as string,
        communityId: row.community_id as string,
        createdAt: iso(row.created_at),
      })),
    };
  });
}
