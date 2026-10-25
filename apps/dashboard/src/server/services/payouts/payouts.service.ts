import "server-only";
import { BaseService, type BaseServiceDeps } from "@/server/api/base-service";
import { endpoint } from "@/server/api/endpoint";
import { listOf } from "@/server/api/schema-kit";
import { communityIdParams } from "../communities/communities.schema";
import {
  type PayoutResolve,
  type PayoutsQuery,
  payout,
  payoutIdParams,
  payoutPrepareBody,
  payoutPrepared,
  payoutResolveBody,
  payoutStep,
  payoutsQuery,
} from "./payouts.schema";

export type ListPayoutsInput = PayoutsQuery;
export type PreparePayoutInput = { communityId: string; note?: string };
export type PayoutStepInput = { payoutId: string };
export type ResolvePayoutInput = { payoutId: string } & PayoutResolve;

/**
 * Dossier API : `/v1/admin/payouts` (D65 : pending -> approved -> processing -> paid).
 * Les écritures sont idempotentes : un double clic ne doit pas bouger deux fois l'argent.
 */
export class PayoutsService extends BaseService {
  private static readonly endpoints = {
    list: endpoint({ method: "GET", path: "/", query: payoutsQuery, response: listOf(payout) }),
    // Autre dossier de l'API : la préparation vit sous la communauté.
    prepare: endpoint({
      method: "POST",
      basePath: "/v1/admin/communities",
      path: "/:communityId/payouts",
      params: communityIdParams,
      body: payoutPrepareBody,
      response: payoutPrepared,
      idempotent: true,
      refreshAfter: true,
    }),
    approve: endpoint({
      method: "POST",
      path: "/:payoutId/approve",
      params: payoutIdParams,
      response: payoutStep,
      idempotent: true,
      refreshAfter: true,
    }),
    // Appelle le fournisseur de virement : délai plus long que le défaut.
    pay: endpoint({
      method: "POST",
      path: "/:payoutId/pay",
      params: payoutIdParams,
      response: payoutStep,
      idempotent: true,
      timeout: 30_000,
      refreshAfter: true,
    }),
    confirm: endpoint({
      method: "POST",
      path: "/:payoutId/confirm",
      params: payoutIdParams,
      response: payoutStep,
      idempotent: true,
      refreshAfter: true,
    }),
    resolve: endpoint({
      method: "POST",
      path: "/:payoutId/resolve",
      params: payoutIdParams,
      body: payoutResolveBody,
      response: payoutStep,
      idempotent: true,
      refreshAfter: true,
    }),
  } as const;

  constructor(deps: BaseServiceDeps) {
    super(deps, { basePath: "/v1/admin/payouts" });
  }

  async listPayouts(input: ListPayoutsInput = {}) {
    return (await this.call(PayoutsService.endpoints.list, { query: input })).items;
  }

  preparePayout(input: PreparePayoutInput) {
    const { communityId, note } = input;
    return this.call(PayoutsService.endpoints.prepare, { params: { communityId }, body: note ? { note } : {} });
  }

  approvePayout(input: PayoutStepInput) {
    return this.call(PayoutsService.endpoints.approve, { params: input });
  }

  payPayout(input: PayoutStepInput) {
    return this.call(PayoutsService.endpoints.pay, { params: input });
  }

  confirmPayout(input: PayoutStepInput) {
    return this.call(PayoutsService.endpoints.confirm, { params: input });
  }

  resolvePayout(input: ResolvePayoutInput) {
    const { payoutId, ...body } = input;
    return this.call(PayoutsService.endpoints.resolve, { params: { payoutId }, body });
  }
}
