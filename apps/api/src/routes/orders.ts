/**
 * Routes de commande côté mobile.
 *
 * Aucun champ monétaire n'entre ici : `POST /v1/orders` n'accepte que
 * `planId` + `planRevision` (+ un éventuel `campaignClaimId`, ignoré pour
 * l'attribution — une campagne ne désigne jamais le bénéficiaire d'une
 * commission). Le corps est strict : envoyer `amount` est une erreur, pas un
 * raccourci.
 *
 * Toutes les commandes sont relues avec `user_id` dans le WHERE : une commande
 * d'un autre compte renvoie 404, jamais 403 (pas de révélation d'existence).
 */
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import type { Database, Queryable } from "../db.js";
import { requireUser } from "../lib/auth.js";
import { fail } from "../lib/errors.js";
import {
  createOrder,
  loadOrder,
  ORDER_SELECT,
  orderDtoFor,
  orderDtosFor,
  reconcilePayment,
  type OrderDto,
  type OrderRow,
} from "../services/payments.js";
import { NIGHT_WINDOWS } from "../services/pricing.js";
import { customChoiceSchema } from "../services/customOffer.js";

/* -------------------------------------------------------------- validation */

function parseBody<T extends z.ZodTypeAny>(schema: T, body: unknown): z.infer<T> {
  const result = schema.safeParse(body ?? {});
  if (result.success) return result.data;
  const details: Record<string, string> = {};
  for (const issue of result.error.issues) {
    details[issue.path.join(".") || "_"] = issue.message;
  }
  throw fail.validation(details);
}

/**
 * `strict()` refuse les propriétés inconnues : c'est la barrière qui empêche
 * un client d'envoyer un montant, un taux ou un bénéficiaire.
 */
const createOrderSchema = z
  .object({
    planId: z.string().trim().min(1).max(190),
    planRevision: z.number().int().min(1),
    /** R6 : plage de nuit, obligatoire pour la famille limité + nuit, refusée sinon. */
    nightWindow: z.enum(NIGHT_WINDOWS).optional(),
    /** D127 : Go et jours choisis pour l'offre sur mesure ; le prix est recalculé ici. */
    custom: customChoiceSchema.optional(),
    /** Conservé pour le suivi de campagne ; n'influence ni le prix ni la commission. */
    campaignClaimId: z.string().trim().min(1).max(190).optional(),
  })
  .strict();

const listQuerySchema = z.object({
  cursor: z.string().max(512).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

/* ------------------------------------------------------------------ curseur */

interface Cursor {
  createdAt: string;
  id: string;
}

function encodeCursor(row: { created_at: Date | string; id: string }): string {
  const createdAt = row.created_at instanceof Date ? row.created_at.toISOString() : new Date(row.created_at).toISOString();
  return Buffer.from(`${createdAt}|${row.id}`, "utf8").toString("base64url");
}

/** Un curseur forgé ne doit pas produire une erreur SQL : il est rejeté. */
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

/* ------------------------------------------------------------- projections */

type ListRow = OrderRow;

const LIST_SELECT = ORDER_SELECT;
async function listOrders(
  db: Queryable,
  userId: string,
  options: { cursor?: Cursor; limit: number },
): Promise<{ items: OrderDto[]; nextCursor?: string }> {
  const params: unknown[] = [userId];
  let where = "WHERE o.user_id = $1";
  if (options.cursor) {
    params.push(options.cursor.createdAt, options.cursor.id);
    where += ` AND (o.created_at < $2::timestamptz
                    OR (o.created_at = $2::timestamptz AND o.id < $3))`;
  }
  params.push(options.limit + 1);
  const rows = await db.query<ListRow>(
    `${LIST_SELECT} ${where} ORDER BY o.created_at DESC, o.id DESC LIMIT $${params.length}`,
    params,
  );

  const hasMore = rows.length > options.limit;
  const page = hasMore ? rows.slice(0, options.limit) : rows;
  const last = page[page.length - 1];
  return {
    // 106 : l'URL de paiement suit le réglage courant des opérateurs.
    items: await orderDtosFor(db, page),
    ...(hasMore && last ? { nextCursor: encodeCursor(last) } : {}),
  };
}

/** Commande d'un autre compte = inexistante. */
async function ownedOrder(db: Queryable, userId: string, orderId: string): Promise<OrderRow> {
  const order = await loadOrder(db, orderId);
  if (!order || order.user_id !== userId) throw fail.notFound("Commande introuvable.");
  return order;
}

/* ------------------------------------------------------------------ routes */

export function registerOrderRoutes(app: FastifyInstance, db: Database): void {
  app.post("/v1/orders", async (req: FastifyRequest, reply) => {
    const auth = await requireUser(db, req);
    const input = parseBody(createOrderSchema, req.body);
    const created = await createOrder(db, {
      userId: auth.userId,
      planId: input.planId,
      planRevision: input.planRevision,
      nightWindow: input.nightWindow ?? null,
      custom: input.custom ?? null,
    });
    return reply.code(201).send(created.order);
  });

  app.get("/v1/orders", async (req: FastifyRequest) => {
    const auth = await requireUser(db, req);
    const parsed = listQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) {
      throw fail.validation({ limit: "Entre 1 et 100, ou absent.", cursor: "Curseur opaque." });
    }
    const query = parsed.data;
    const limit = query.limit ?? 20;
    const cursor = query.cursor ? decodeCursor(query.cursor) : undefined;
    return listOrders(db, auth.userId, { cursor, limit });
  });

  /**
   * Statut d'achat et d'activation.
   *
   * Pas d'appel fournisseur par défaut : un écran de suivi peut interroger
   * cette route toutes les 15 s sans transformer le backend en proxy Fapshi.
   * `?refresh=1` demande explicitement une réconciliation — utilisé au retour
   * du navigateur, quand le webhook peut être en retard.
   */
  app.get("/v1/orders/:orderId", async (req: FastifyRequest<{ Params: { orderId: string }; Querystring: { refresh?: string } }>) => {
    const auth = await requireUser(db, req);
    const order = await ownedOrder(db, auth.userId, req.params.orderId);
    const wantsRefresh = ["1", "true", "yes"].includes(String(req.query?.refresh ?? "").toLowerCase());

    if (wantsRefresh && (order.status === "pending" || order.status === "created")) {
      const result = await reconcilePayment(db, { orderId: order.id });
      return result.order;
    }
    if (wantsRefresh && order.status === "paid" && !order.activated_at) {
      // Paiement acquis mais activation interrompue : on reprend sans jamais
      // redemander un paiement.
      await reconcilePayment(db, { orderId: order.id });
      return orderDtoFor(db, await ownedOrder(db, auth.userId, order.id));
    }
    return orderDtoFor(db, order);
  });
}
