/**
 * Catalogue public d'une marque.
 *
 * L'APK connaît son `appId` au build (`BrandTokens.appId`) : c'est la seule clé
 * nécessaire pour afficher les offres de sa marque, avec les prix fixés par son
 * administrateur (white label, D35). Aucune donnée d'utilisateur, et jamais le
 * prix d'une autre marque : la requête est filtrée par `app_id` en SQL.
 *
 * `revision` est la même valeur que celle vérifiée par `POST /v1/orders` ; si
 * l'administrateur change un prix entre l'affichage et le paiement, la commande
 * est refusée en `409 PLAN_CHANGED` au lieu d'être facturée à l'ancien prix.
 */
import type { FastifyInstance } from "fastify";
import type { Database, Row } from "../db.js";
import { fail } from "../lib/errors.js";
import { planRevision } from "../services/payments.js";

export function registerCatalogRoutes(app: FastifyInstance, db: Database): void {
  app.get<{ Params: { appId: string } }>("/v1/apps/:appId/plans", async (req) => {
    const appRow = await db.one<Row>("SELECT id, name FROM apps WHERE id = $1", [req.params.appId]);
    if (!appRow) throw fail.notFound("Application introuvable.");

    const rows = await db.query<Row>(
      `SELECT id, app_id, code, name, description, price_xaf, duration_days, device_limit,
              badge, featured, sort_order, active
         FROM plans
        WHERE app_id = $1 AND active = true
        ORDER BY sort_order ASC, price_xaf ASC`,
      [req.params.appId],
    );

    return {
      app: { id: appRow.id as string, name: appRow.name as string },
      items: rows.map((row) => ({
        id: row.id as string,
        code: row.code as string,
        name: row.name as string,
        description: row.description as string,
        priceXaf: Number(row.price_xaf),
        durationDays: Number(row.duration_days),
        deviceLimit: Number(row.device_limit),
        badge: (row.badge as string | null) ?? null,
        featured: row.featured === true,
        sortOrder: Number(row.sort_order),
        revision: planRevision({
          code: row.code as string,
          price_xaf: Number(row.price_xaf),
          duration_days: Number(row.duration_days),
          device_limit: Number(row.device_limit),
          active: row.active === true,
        }),
      })),
    };
  });
}
