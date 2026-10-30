import "server-only";
import { BaseService, type BaseServiceDeps } from "@/server/api/base-service";
import { endpoint } from "@/server/api/endpoint";
import {
  type PaymentOperator,
  type PaymentOperatorUpdate,
  operatorParams,
  paymentOperatorUpdateBody,
  paymentOperatorUpdated,
  paymentOperatorsState,
} from "./payment-operators.schema";

/**
 * Dossier API : `/v1/admin/payment-operators` (106). Lecture : owner et
 * community_admin ; écriture : owner seul (Fastify revérifie). Réglage manuel :
 * aucune détection automatique d'une panne chez Fapshi.
 */
export class PaymentOperatorsService extends BaseService {
  private static readonly endpoints = {
    get: endpoint({ method: "GET", path: "/", response: paymentOperatorsState }),
    update: endpoint({
      method: "PUT",
      path: "/:operator",
      params: operatorParams,
      body: paymentOperatorUpdateBody,
      response: paymentOperatorUpdated,
      refreshAfter: true,
    }),
  } as const;

  constructor(deps: BaseServiceDeps) {
    super(deps, { basePath: "/v1/admin/payment-operators" });
  }

  getState() {
    return this.call(PaymentOperatorsService.endpoints.get);
  }

  setAvailability(operator: PaymentOperator, body: PaymentOperatorUpdate) {
    return this.call(PaymentOperatorsService.endpoints.update, { params: { operator }, body });
  }
}
