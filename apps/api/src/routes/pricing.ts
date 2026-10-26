/**
 * Réglages tarifaires (R6, D121, D125) : coût du Go, coût par plage de nuit,
 * marge plateforme, plafond de commission. Aucune valeur n'est codée ici.
 *
 * - `GET /v1/admin/pricing` : owner et community_admin (capacité `pricing.read`).
 * - `PUT /v1/admin/pricing` : owner seul (capacité `pricing.manage`).
 *
 * Le lot R1 introduit ces capacités dans `permitted()`. Tant qu'il n'est pas
 * fusionné dans cette copie, le contrôle de rôle équivalent est fait ici.
 */
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import type { Database, Queryable, Row } from "../db.js";
import { requireAdmin, type AdminContext } from "../lib/auth.js";
import { fail } from "../lib/errors.js";
import { appendAudit } from "./admin.js";
import {
  commissionCapBps,
  loadPricingSettings,
  type PricingSettings,
} from "../services/pricing.js";

const PREFIX = "/v1/admin/pricing";

function parseBody<T extends z.ZodTypeAny>(schema: T, body: unknown): z.infer<T> {
  const result = schema.safeParse(body ?? {});
  if (result.success) return result.data;
  const details: Record<string, string> = {};
  for (const issue of result.error.issues) {
    details[issue.path.join(".") || "_"] = issue.message;
  }
  throw fail.validation(details);
}

const xafOrNull = z.number().int().min(0).max(10_000_000).nullable();
const bpsOrNull = z.number().int().min(0).max(10_000).nullable();

/**
 * PUT = remplacement complet : chaque champ est présent, `null` = « non réglé ».
 * Un champ oublié ne doit pas remettre un coût à zéro en silence.
 */
const pricingSchema = z
  .object({
    costPerGbXaf: xafOrNull,
    nightWindowCostXaf: z
      .object({
        "20-24": xafOrNull,
        "24-04": xafOrNull,
        "20-04": xafOrNull,
      })
      .strict(),
    platformMarginBps: bpsOrNull,
    maxCommissionBps: bpsOrNull,
  })
  .strict();

function canReadPricing(admin: AdminContext): boolean {
  return admin.platformRole === "owner" || admin.memberships.some((m) => m.role === "community_admin");
}

function requireOwner(admin: AdminContext): void {
  if (admin.platformRole !== "owner") throw fail.forbidden("Réservé au propriétaire de la plateforme.");
}

function pricingDto(settings: PricingSettings) {
  return {
    costPerGbXaf: settings.costPerGbXaf,
    nightWindowCostXaf: settings.nightWindowCostXaf,
    platformMarginBps: settings.platformMarginBps,
    /** `null` tant que l'owner n'a rien réglé. */
    maxCommissionBps: settings.maxCommissionBps,
    /** Plafond réellement appliqué : le réglage, sinon le repli de D35. */
    effectiveMaxCommissionBps: commissionCapBps(settings),
    /** Vrai quand le plancher peut être calculé (coût du Go et marge saisis). */
    floorConfigured: settings.costPerGbXaf !== null && settings.platformMarginBps !== null,
    updatedAt: settings.updatedAt,
    updatedBy: settings.updatedBy,
  };
}

async function currentSettings(q: Queryable): Promise<PricingSettings> {
  return loadPricingSettings(q);
}

export function registerPricingRoutes(app: FastifyInstance, db: Database): void {
  app.get(PREFIX, async (req: FastifyRequest) => {
    const admin = await requireAdmin(db, req);
    if (!canReadPricing(admin)) throw fail.forbidden("Action non autorisée pour votre rôle.");
    return pricingDto(await currentSettings(db));
  });

  app.put(PREFIX, async (req: FastifyRequest) => {
    const admin = await requireAdmin(db, req);
    requireOwner(admin);
    const input = parseBody(pricingSchema, req.body);

    const saved = await db.tx(async (q) => {
      const before = await currentSettings(q);
      await q.query(
        `INSERT INTO pricing_settings
           (id, cost_per_gb_xaf, night_window_cost_xaf, platform_margin_bps, max_commission_bps, updated_at, updated_by)
         VALUES ('current', $1, $2::jsonb, $3, $4, now(), $5)
         ON CONFLICT (id) DO UPDATE SET
           cost_per_gb_xaf       = EXCLUDED.cost_per_gb_xaf,
           night_window_cost_xaf = EXCLUDED.night_window_cost_xaf,
           platform_margin_bps   = EXCLUDED.platform_margin_bps,
           max_commission_bps    = EXCLUDED.max_commission_bps,
           updated_at            = now(),
           updated_by            = EXCLUDED.updated_by`,
        [
          input.costPerGbXaf,
          JSON.stringify(input.nightWindowCostXaf),
          input.platformMarginBps,
          input.maxCommissionBps,
          admin.adminId,
        ],
      );
      const after = await currentSettings(q);
      await appendAudit(q, admin, req, {
        action: "pricing.update",
        targetType: "pricing",
        targetId: "current",
        before: pricingDto(before) as unknown as Row,
        after: pricingDto(after) as unknown as Row,
      });
      return after;
    });
    return pricingDto(saved);
  });
}
