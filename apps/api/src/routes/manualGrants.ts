/**
 * Accès manuels et versements à la plateforme (105).
 *
 * Administration (owner, ou `community_admin` de la communauté concernée —
 * capacité `manual_grant.manage`) :
 * - `GET  /v1/admin/users/:userId/manual-grants/options`  forfaits accordables + impayés de la communauté
 * - `GET  /v1/admin/users/:userId/manual-grants`          accès manuels de cet abonné
 * - `POST /v1/admin/users/:userId/manual-grants`          accorder un forfait (accès immédiat, dette `owed`)
 * - `GET  /v1/admin/manual-grants?communityId=&status=`   impayés (défaut `owed`) avec totaux
 * - `POST /v1/admin/settlements` `{ communityId }`        versement du total dû, renvoie le lien Fapshi
 * - `GET  /v1/admin/settlements?communityId=`             versements récents
 * - `POST /v1/admin/settlements/:settlementId/refresh`    revérifie chez Fapshi et réconcilie
 *
 * Public :
 * - `GET  /pay/settlement/:settlementId/return`           retour de paiement Fapshi (revérifie, affiche l'état)
 *
 * Le webhook Fapshi reste `POST /v1/payments/webhook/:provider` (routes/payments.ts) :
 * il reconnaît un versement par sa référence et n'appelle pour lui que
 * `reconcileSettlement`.
 *
 * Le périmètre vient toujours de la ligne lue (abonné, versement) ou d'une
 * appartenance enregistrée ; un `communityId` fourni n'est qu'une cible,
 * vérifiée par `permitted` (403 hors périmètre).
 */
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import type { Database, Queryable, Row } from "../db.js";
import { hasPlatformRole, requireAdmin, type AdminContext } from "../lib/auth.js";
import { fail } from "../lib/errors.js";
import { payments as defaultProvider } from "../lib/fapshi.js";
import {
  grantablePlanDto,
  grantablePlans,
  grantDto,
  GRANT_SELECT,
  grantManualAccess,
  initiateSettlementPayment,
  listGrants,
  loadSettlement,
  owedByCommunity,
  PAYMENT_METHODS,
  prepareSettlement,
  reconcileSettlement,
  SETTLEMENT_SELECT,
  settlementDto,
  type SettlementAudit,
} from "../services/manualGrants.js";
import { NIGHT_WINDOWS } from "../services/pricing.js";
import { appendAudit, parseBody, permitted } from "./admin.js";

const PREFIX = "/v1/admin";

const grantSchema = z
  .object({
    planId: z.string().trim().min(1).max(190),
    paymentMethod: z.enum(PAYMENT_METHODS),
    note: z.string().trim().max(280).nullable().optional(),
    nightWindow: z.enum(NIGHT_WINDOWS).nullable().optional(),
  })
  .strict();

const listQuerySchema = z.object({
  communityId: z.string().trim().min(1).max(190).optional(),
  status: z.enum(["owed", "settled"]).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

const settlementCreateSchema = z.object({ communityId: z.string().trim().min(1).max(190) }).strict();

const settlementListSchema = z.object({
  communityId: z.string().trim().min(1).max(190).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

function authorize(admin: AdminContext, communityId: string): void {
  if (!permitted(admin, "manual_grant.manage", communityId)) throw fail.forbidden("Action non autorisée pour votre rôle.");
}

/**
 * Communautés visibles : la cible demandée (vérifiée), sinon toutes pour
 * l'owner (`null`), sinon celles où le compte est `community_admin`.
 */
function visibleCommunities(admin: AdminContext, requested: string | undefined): string[] | null {
  if (requested) {
    authorize(admin, requested);
    return [requested];
  }
  if (hasPlatformRole(admin, "owner")) return null;
  const ids = admin.memberships.filter((m) => m.role === "community_admin").map((m) => m.communityId);
  if (ids.length === 0) throw fail.forbidden("Action non autorisée pour votre rôle.");
  return ids;
}

async function mustUser(db: Queryable, userId: string): Promise<Row> {
  const user = await db.one<Row>("SELECT id, app_id, community_id, deleted_at FROM users WHERE id = $1", [userId]);
  if (!user) throw fail.notFound("Abonné introuvable.");
  return user;
}

async function owedOf(db: Queryable, communityId: string): Promise<{ count: number; totalXaf: number }> {
  const [summary] = await owedByCommunity(db, [communityId]);
  return { count: summary?.count ?? 0, totalXaf: summary?.totalXaf ?? 0 };
}

/** `Idempotency-Key` du dashboard (BaseService) : borné, sinon ignoré. */
function requestKeyOf(req: FastifyRequest): string | null {
  const raw = req.headers["idempotency-key"];
  if (typeof raw !== "string") return null;
  const key = raw.trim();
  return key.length >= 8 && key.length <= 190 ? key : null;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function registerManualGrantRoutes(app: FastifyInstance, db: Database): void {
  /* ------------------------------------------------ fiche d'un abonné */

  app.get<{ Params: { userId: string } }>(`${PREFIX}/users/:userId/manual-grants/options`, async (req) => {
    const admin = await requireAdmin(db, req);
    const user = await mustUser(db, req.params.userId);
    const communityId = String(user.community_id);
    authorize(admin, communityId);
    const plans = await grantablePlans(db, String(user.app_id));
    return {
      plans: plans.map(grantablePlanDto),
      paymentMethods: [...PAYMENT_METHODS],
      // Décision par défaut (non tranchée) : des impayés n'empêchent pas
      // d'accorder ; le dashboard les affiche en avertissement.
      owed: { communityId, ...(await owedOf(db, communityId)) },
    };
  });

  app.get<{ Params: { userId: string } }>(`${PREFIX}/users/:userId/manual-grants`, async (req) => {
    const admin = await requireAdmin(db, req);
    const user = await mustUser(db, req.params.userId);
    authorize(admin, String(user.community_id));
    const rows = await db.query<Row>(`${GRANT_SELECT} WHERE g.user_id = $1 ORDER BY g.granted_at DESC, g.id DESC LIMIT 50`, [
      user.id,
    ]);
    return { items: rows.map(grantDto) };
  });

  app.post<{ Params: { userId: string } }>(`${PREFIX}/users/:userId/manual-grants`, async (req, reply) => {
    const admin = await requireAdmin(db, req);
    const user = await mustUser(db, req.params.userId);
    const communityId = String(user.community_id);
    authorize(admin, communityId);
    const input = parseBody(grantSchema, req.body);
    const requestKey = requestKeyOf(req);

    const result = await db.tx(async (q) => {
      const granted = await grantManualAccess(q, {
        userId: String(user.id),
        planId: input.planId,
        paymentMethod: input.paymentMethod,
        note: input.note ? input.note : null,
        nightWindow: input.nightWindow ?? null,
        adminId: admin.adminId,
        requestKey,
      });
      if (!granted.replayed) {
        await appendAudit(q, admin, req, {
          action: "manual_grant.create",
          targetType: "manual_grant",
          targetId: granted.grantId,
          communityId: granted.communityId,
          after: {
            userId: user.id,
            planId: input.planId,
            planName: granted.planName,
            amountXaf: granted.amountXaf,
            paymentMethod: input.paymentMethod,
            note: input.note ?? null,
            nightWindow: input.nightWindow ?? null,
            status: "owed",
            endsAt: granted.endsAt?.toISOString() ?? null,
          },
        });
      }
      return granted;
    });

    const row = await db.one<Row>(`${GRANT_SELECT} WHERE g.id = $1`, [result.grantId]);
    const owed = await owedOf(db, result.communityId);
    return reply.code(result.replayed ? 200 : 201).send({
      grant: grantDto(row as Row),
      subscription:
        result.startsAt && result.endsAt ? { startsAt: result.startsAt.toISOString(), endsAt: result.endsAt.toISOString() } : null,
      owed,
      replayed: result.replayed,
    });
  });

  /* ------------------------------------------------------------ impayés */

  app.get(`${PREFIX}/manual-grants`, async (req) => {
    const admin = await requireAdmin(db, req);
    const query = parseBody(listQuerySchema, req.query);
    const communityIds = visibleCommunities(admin, query.communityId);
    const status = query.status ?? "owed";
    const list = await listGrants(db, { communityIds, status, limit: query.limit });
    const communities = await owedByCommunity(db, communityIds);
    return {
      status,
      items: list.items,
      truncated: list.truncated,
      // Totaux des impayés (`owed`), exacts même si la liste est tronquée.
      owed: {
        count: communities.reduce((sum, c) => sum + c.count, 0),
        totalXaf: communities.reduce((sum, c) => sum + c.totalXaf, 0),
      },
      communities,
    };
  });

  /* ---------------------------------------------------------- versements */

  app.post(`${PREFIX}/settlements`, async (req, reply) => {
    const admin = await requireAdmin(db, req);
    const input = parseBody(settlementCreateSchema, req.body);
    authorize(admin, input.communityId);

    const prepared = await db.tx(async (q) => {
      const settlement = await prepareSettlement(q, {
        communityId: input.communityId,
        adminId: admin.adminId,
        providerName: defaultProvider.name,
      });
      await appendAudit(q, admin, req, {
        action: "settlement.create",
        targetType: "settlement",
        targetId: settlement.settlementId,
        communityId: settlement.communityId,
        after: {
          status: "pending",
          amountXaf: settlement.amountXaf,
          grantCount: settlement.grantIds.length,
          grantIds: settlement.grantIds,
        },
      });
      return settlement;
    });

    const created = await initiateSettlementPayment(db, prepared, { adminId: admin.adminId });
    const row = await loadSettlement(db, prepared.settlementId);
    reply.header("cache-control", "no-store");
    return reply.code(201).send({ settlement: settlementDto(row as Row), paymentUrl: created.paymentUrl });
  });

  app.get(`${PREFIX}/settlements`, async (req) => {
    const admin = await requireAdmin(db, req);
    const query = parseBody(settlementListSchema, req.query);
    const communityIds = visibleCommunities(admin, query.communityId);
    const rows = await db.query<Row>(
      `${SETTLEMENT_SELECT}
        WHERE ($1::text[] IS NULL OR st.community_id = ANY($1::text[]))
        ORDER BY st.created_at DESC, st.id DESC
        LIMIT $2`,
      [communityIds, query.limit ?? 20],
    );
    return { items: rows.map(settlementDto) };
  });

  app.post<{ Params: { settlementId: string } }>(`${PREFIX}/settlements/:settlementId/refresh`, async (req) => {
    const admin = await requireAdmin(db, req);
    const row = await loadSettlement(db, req.params.settlementId);
    if (!row) throw fail.notFound("Versement introuvable.");
    authorize(admin, String(row.community_id));
    // Confirmation demandée par un administrateur : le statut vient quand même
    // du fournisseur, l'administrateur n'en est que l'auteur dans le journal.
    const audit: SettlementAudit = (q, entry) =>
      appendAudit(q, admin, req, {
        action: entry.action,
        targetType: "settlement",
        targetId: entry.settlementId,
        communityId: entry.communityId,
        before: entry.before,
        after: entry.after,
      });
    const result = await reconcileSettlement(db, { settlementId: String(row.id), audit });
    return {
      settlement: result.settlement,
      providerStatus: result.providerStatus,
      changed: result.changed,
      settledGrants: result.settledGrants,
      commissionXaf: result.commissionXaf,
    };
  });

  /* --------------------------------------------- retour de paiement Fapshi */

  app.get<{ Params: { settlementId: string } }>("/pay/settlement/:settlementId/return", async (req, reply) => {
    const settlementId = String(req.params.settlementId ?? "").trim();
    let row = await loadSettlement(db, settlementId);
    if (row && (row.status === "pending" || row.status === "failed")) {
      try {
        await reconcileSettlement(db, { settlementId });
        row = (await loadSettlement(db, settlementId)) ?? row;
      } catch (err) {
        req.log.warn({ err, settlementId }, "réconciliation au retour du versement impossible");
      }
    }
    const status = row ? String(row.status) : "unknown";
    const title =
      status === "paid" || status === "needs_review"
        ? "Versement reçu"
        : status === "failed"
          ? "Versement non abouti"
          : status === "pending"
            ? "Versement en cours de vérification"
            : "Versement introuvable";
    const detail =
      status === "paid"
        ? "Les accès manuels inclus sont réglés et la commission de la communauté est créditée."
        : status === "needs_review"
          ? "Paiement reçu. Une partie des accès était déjà réglée : la plateforme vérifie l'écart."
          : status === "failed"
            ? "Le paiement n'a pas abouti. Les accès restent à régulariser : relancez un versement depuis le dashboard."
            : status === "pending"
              ? "La confirmation de l'opérateur n'est pas encore arrivée. Cette page se recharge seule."
              : "Aucun versement ne correspond à ce lien.";
    const amount = row ? `${Number(row.amount_xaf).toLocaleString("fr-FR")} FCFA` : "";
    return reply.type("text/html; charset=utf-8").send(`<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
${status === "pending" ? '<meta http-equiv="refresh" content="5">' : ""}
<title>${escapeHtml(title)}</title>
<style>:root{color-scheme:light dark}body{margin:0;min-height:100vh;display:grid;place-items:center;font-family:system-ui,sans-serif;background:#f5f7fb;color:#0b1220}
main{max-width:420px;padding:24px;margin:16px;background:#fff;border-radius:16px;box-shadow:0 1px 3px rgba(0,0,0,.08)}
h1{font-size:20px;margin:0 0 12px}p{line-height:1.5;margin:0 0 12px}.amount{font-weight:700;font-size:18px}
@media (prefers-color-scheme:dark){body{background:#0b1220;color:#f5f7fb}main{background:#111827}}</style>
</head><body><main><h1>${escapeHtml(title)}</h1>${amount ? `<p class="amount">${escapeHtml(amount)}</p>` : ""}<p>${escapeHtml(detail)}</p>
<p>Vous pouvez fermer cette page et revenir au dashboard.</p></main></body></html>`);
  });
}
