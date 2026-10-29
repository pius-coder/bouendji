import type { OrderDetail } from "@/server/services/orders/orders.schema";

/** Une reprise termine une commande existante ; elle n'accorde jamais un accès gratuit. */
export function canOfferPaymentReconciliation(
  order: Pick<OrderDetail, "status" | "activatedAt">,
  allowed: boolean,
): boolean {
  if (!allowed) return false;
  return order.status === "created" || order.status === "pending" || (order.status === "paid" && !order.activatedAt);
}
