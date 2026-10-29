"use server";

import { getServices } from "@/server/services";
import type { OrderReconcileResult } from "@/server/services/orders/orders.schema";
import { runAction, type ActionResult } from "./action-result";

/** Reprend une commande existante ; ne crée jamais d'accès gratuit. */
export async function reconcileOrderAction(orderId: string): Promise<ActionResult<OrderReconcileResult>> {
  return runAction(() => getServices().orders.reconcileOrder(String(orderId)));
}
