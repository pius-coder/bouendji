/**
 * Opérateurs de paiement (106) : Orange Money et MTN MoMo sur la page Fapshi.
 *
 * - `GET /v1/admin/payment-operators`                 owner, ou community_admin (lecture seule) — `payment_operator.read`
 * - `PUT /v1/admin/payment-operators/:operator` `{ available }`   owner seul — `payment_operator.manage`
 *
 * Réglage **manuel** : l'API ne détecte pas une panne chez Fapshi. Il décide
 * seulement de la page que l'abonné voit avant de payer (`/pay/notice/:orderId`,
 * routes/payments.ts). Chaque changement écrit une ligne d'audit dans la même
 * transaction ; une valeur identique ne change rien et n'écrit rien.
 */
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import type { Database } from "../db.js";
import { hasPlatformRole, requireAdmin, type AdminContext } from "../lib/auth.js";
import { fail } from "../lib/errors.js";
import {
  isPaymentOperator,
  noticeFor,
  OPERATOR_LABEL,
  PAYMENT_OPERATORS,
  loadPaymentOperators,
  setOperatorAvailability,
  type OperatorStatus,
  type PaymentOperatorsState,
} from "../services/paymentOperators.js";
import { appendAudit, parseBody, permitted } from "./admin.js";

const PREFIX = "/v1/admin/payment-operators";

const updateSchema = z.object({ available: z.boolean() }).strict();

function operatorDto(status: OperatorStatus, owner: boolean) {
  return {
    operator: status.operator,
    label: OPERATOR_LABEL[status.operator],
    available: status.available,
    updatedAt: status.updatedAt,
    // L'auteur n'est montré qu'à l'owner.
    updatedByName: owner ? status.updatedByName : null,
  };
}

function stateDto(state: PaymentOperatorsState, admin: AdminContext) {
  const owner = hasPlatformRole(admin, "owner");
  return {
    items: PAYMENT_OPERATORS.map((operator) => operatorDto(state[operator], owner)),
    mode: noticeFor(state),
    /** Réglage manuel : aucune détection automatique d'une panne chez Fapshi. */
    automaticDetection: false as const,
    canManage: permitted(admin, "payment_operator.manage", null),
  };
}

export function registerPaymentOperatorRoutes(app: FastifyInstance, db: Database): void {
  app.get(PREFIX, async (req: FastifyRequest) => {
    const admin = await requireAdmin(db, req);
    if (!permitted(admin, "payment_operator.read", null)) throw fail.forbidden("Action non autorisée pour votre rôle.");
    return stateDto(await loadPaymentOperators(db), admin);
  });

  app.put<{ Params: { operator: string } }>(`${PREFIX}/:operator`, async (req) => {
    const admin = await requireAdmin(db, req);
    if (!permitted(admin, "payment_operator.manage", null)) throw fail.forbidden("Réservé au propriétaire de la plateforme.");
    const operator = String(req.params.operator ?? "").trim();
    if (!isPaymentOperator(operator)) throw fail.notFound("Opérateur inconnu.");
    const input = parseBody(updateSchema, req.body);

    const result = await db.tx(async (q) => {
      const change = await setOperatorAvailability(q, admin, { operator, available: input.available });
      if (change.changed) {
        await appendAudit(q, admin, req, {
          action: "payment_operator.update",
          targetType: "payment_operator",
          targetId: operator,
          before: { available: change.before.available },
          after: { available: change.after.available, mode: noticeFor(change.state) },
        });
      }
      return change;
    });

    return { ...stateDto(result.state, admin), changed: result.changed };
  });
}
