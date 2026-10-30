/**
 * Offre sur mesure d'une application (D127), côté administration.
 *
 * - `GET /v1/admin/apps/:appId/custom-offer` : l'offre, ou `null` si non créée.
 * - `PUT /v1/admin/apps/:appId/custom-offer` : crée ou remplace l'offre.
 *
 * L'offre est portée par une ligne `plans` de famille `custom` (une par app),
 * pour que commandes, abonnements et commissions restent inchangés. Ses prix et
 * bornes vivent dans `plan_custom_terms`. Les plages de nuit réutilisent
 * `plan_night_options`. Droits : ceux des forfaits (`plan.manage`).
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Database, Row } from "../db.js";
import { requireAdmin, scopedCommunity, type AdminContext } from "../lib/auth.js";
import { newId } from "../lib/crypto.js";
import { ApiFailure, fail } from "../lib/errors.js";
import { appendAudit, parseBody, permitted } from "./admin.js";
import {
  assertCustomAboveFloor,
  customPriceXaf,
  customTermsFromJson,
  customTermsSchema,
  loadCustomPlan,
  upsertCustomTerms,
  type CustomTerms,
} from "../services/customOffer.js";
import { planRevision } from "../services/payments.js";
import { planTermsDto, planTermsSql, replaceNightOptions } from "../services/planTerms.js";
import { loadPricingSettings, nightOptionFloorXaf, NIGHT_WINDOWS } from "../services/pricing.js";

const PREFIX = "/v1/admin/apps/:appId/custom-offer";
const CODE = "sur-mesure";

const putSchema = z
  .object({
    name: z.string().trim().min(2).max(80).optional(),
    description: z.string().trim().max(500).optional(),
    active: z.boolean(),
    deviceLimit: z.number().int().min(1).max(10),
    terms: customTermsSchema,
    nightOptions: z
      .array(
        z
          .object({
            window: z.enum(NIGHT_WINDOWS),
            priceXaf: z.number().int().min(1).max(10_000_000),
            active: z.boolean().optional(),
          })
          .strict(),
      )
      .max(NIGHT_WINDOWS.length)
      .refine((items) => new Set(items.map((i) => i.window)).size === items.length, "Plage en double."),
  })
  .strict();

function authorize(admin: AdminContext, capability: "community.read" | "plan.manage", communityId: string): void {
  if (!permitted(admin, capability, communityId)) throw fail.forbidden("Action non autorisée pour votre rôle.");
}

function offerDto(row: Row | null) {
  if (!row) return null;
  const terms = customTermsFromJson(row.custom_terms);
  const plan = planTermsDto(row);
  return {
    planId: row.id as string,
    name: row.name as string,
    description: row.description as string,
    active: row.active === true,
    deviceLimit: Number(row.device_limit),
    terms,
    nightOptions: plan.nightOptions,
    /** Prix du plus petit choix (Go min, jours min) : « à partir de ». */
    fromXaf: terms ? customPriceXaf(terms, { gb: terms.minGb, days: terms.minDays }) : null,
    revision: planRevision({
      code: row.code as string,
      price_xaf: row.price_xaf as number,
      duration_days: row.duration_days as number,
      // 103 : l'offre sur mesure se règle en jours (curseurs) ; NULL en pratique.
      duration_minutes: (row.duration_minutes as number | null | undefined) ?? null,
      device_limit: row.device_limit as number,
      active: row.active === true,
      family: plan.family,
      quota_bytes: plan.quotaBytes,
      endpoint_tier: (row.endpoint_tier as string | null) ?? "paid-gcp",
      night_options: row.night_options,
      custom_terms: row.custom_terms,
    }),
  };
}

async function loadOffer(db: Database, appId: string): Promise<Row | null> {
  return db.one<Row>(
    `SELECT p.*, ${planTermsSql("p")} FROM plans p WHERE p.app_id = $1 AND p.family = 'custom'`,
    [appId],
  );
}

export function registerAdminCustomOfferRoutes(app: FastifyInstance, db: Database): void {
  app.get<{ Params: { appId: string } }>(PREFIX, async (req) => {
    const admin = await requireAdmin(db, req);
    const appRow = await db.one<Row>("SELECT id, community_id FROM apps WHERE id = $1", [req.params.appId]);
    if (!appRow) throw fail.notFound("Application introuvable.");
    const communityId = scopedCommunity(admin, String(appRow.community_id)) as string;
    authorize(admin, "community.read", communityId);
    return { offer: offerDto(await loadOffer(db, req.params.appId)) };
  });

  app.put<{ Params: { appId: string } }>(PREFIX, async (req) => {
    const admin = await requireAdmin(db, req);
    const appRow = await db.one<Row>("SELECT id, community_id FROM apps WHERE id = $1", [req.params.appId]);
    if (!appRow) throw fail.notFound("Application introuvable.");
    const communityId = scopedCommunity(admin, String(appRow.community_id)) as string;
    authorize(admin, "plan.manage", communityId);
    const input = parseBody(putSchema, req.body);
    const terms: CustomTerms = input.terms;
    const nightOptions = input.nightOptions.map((o) => ({ window: o.window, priceXaf: o.priceXaf, active: o.active ?? true }));

    await db.tx(async (q) => {
      const settings = await loadPricingSettings(q);
      assertCustomAboveFloor(settings, terms);
      for (const option of nightOptions) {
        const floor = option.active ? nightOptionFloorXaf(option.window, settings) : null;
        if (floor !== null && option.priceXaf < floor) {
          throw new ApiFailure(409, "CONFLICT", "Le prix est sous le plancher calculé à partir des réglages tarifaires.", {
            reason: "BELOW_FLOOR",
            field: `nightOptions.${option.window}`,
            floorXaf: String(floor),
            window: option.window,
          });
        }
      }

      const before = await loadCustomPlan(q, req.params.appId);
      // `price_xaf` et `duration_days` gardent le plus petit choix : tri et
      // anciens écrans ; le montant réel est toujours recalculé à la commande.
      const fromXaf = customPriceXaf(terms, { gb: terms.minGb, days: terms.minDays });
      const planId = (before?.id as string | undefined) ?? newId();
      if (before) {
        await q.query(
          `UPDATE plans SET name = $2, description = $3, price_xaf = $4, duration_days = $5,
                  device_limit = $6, active = $7
            WHERE id = $1`,
          [
            planId,
            input.name ?? (before.name as string),
            input.description ?? (before.description as string),
            fromXaf,
            terms.minDays,
            input.deviceLimit,
            input.active,
          ],
        );
      } else {
        await q.query(
          `INSERT INTO plans (id, app_id, code, name, description, price_xaf, duration_days, device_limit,
                              badge, featured, active, sort_order, endpoint_tier, family, quota_bytes)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NULL, true, $9, 0, 'paid-gcp', 'custom', NULL)`,
          [
            planId,
            req.params.appId,
            CODE,
            input.name ?? "Forfait sur mesure",
            input.description ?? "",
            fromXaf,
            terms.minDays,
            input.deviceLimit,
            input.active,
          ],
        );
      }
      await upsertCustomTerms(q, planId, terms);
      await replaceNightOptions(q, planId, nightOptions);
      await appendAudit(q, admin, req, {
        action: before ? "custom_offer.update" : "custom_offer.create",
        targetType: "plan",
        targetId: planId,
        communityId,
        before: before ? { terms: customTermsFromJson(before.custom_terms), active: before.active } : undefined,
        after: { terms, active: input.active, nightOptions },
      });
    });

    return { offer: offerDto(await loadOffer(db, req.params.appId)) };
  });
}
