"use server";

import { getServices } from "@/server/services";
import {
  operatorParams,
  paymentOperatorUpdateBody,
  type PaymentOperatorsState,
} from "@/server/services/payment-operators/payment-operators.schema";
import { runAction, type ActionResult } from "./action-result";

/**
 * Déclare un opérateur disponible ou indisponible. Owner seul : Fastify
 * revérifie `payment_operator.manage` et écrit l'audit. Réglage manuel.
 */
export async function setPaymentOperatorAction(
  operator: unknown,
  input: unknown,
): Promise<ActionResult<PaymentOperatorsState & { changed: boolean }>> {
  return runAction(async () => {
    const { operator: target } = operatorParams.parse({ operator });
    return getServices().paymentOperators.setAvailability(target, paymentOperatorUpdateBody.parse(input));
  });
}
