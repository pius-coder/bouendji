import "server-only";
import { BaseService, type BaseServiceDeps } from "@/server/api/base-service";
import { endpoint } from "@/server/api/endpoint";
import { listOf } from "@/server/api/schema-kit";
import {
  type PlanCreate,
  type PlanUpdate,
  appIdParams,
  brandApp,
  plan,
  planCreateBody,
  planIdParams,
  planUpdateBody,
} from "./plans.schema";

export type ListPlansInput = { appId: string };
export type CreatePlanInput = { appId: string } & PlanCreate;
export type UpdatePlanInput = { planId: string } & PlanUpdate;

/** Dossier API : `/v1/admin/apps` (marques et leurs forfaits). */
export class PlansService extends BaseService {
  private static readonly endpoints = {
    listApps: endpoint({ method: "GET", path: "/", response: listOf(brandApp) }),
    list: endpoint({ method: "GET", path: "/:appId/plans", params: appIdParams, response: listOf(plan) }),
    create: endpoint({
      method: "POST",
      path: "/:appId/plans",
      params: appIdParams,
      body: planCreateBody,
      response: plan,
      idempotent: true,
      refreshAfter: true,
    }),
    // Autre dossier de l'API : `/v1/admin/plans/{planId}`.
    update: endpoint({
      method: "PATCH",
      basePath: "/v1/admin/plans",
      path: "/:planId",
      params: planIdParams,
      body: planUpdateBody,
      response: plan,
      refreshAfter: true,
    }),
  } as const;

  constructor(deps: BaseServiceDeps) {
    super(deps, { basePath: "/v1/admin/apps" });
  }

  async listApps() {
    return (await this.call(PlansService.endpoints.listApps)).items;
  }

  async listPlans(input: ListPlansInput) {
    return (await this.call(PlansService.endpoints.list, { params: input })).items;
  }

  createPlan(input: CreatePlanInput) {
    const { appId, ...body } = input;
    return this.call(PlansService.endpoints.create, { params: { appId }, body });
  }

  updatePlan(input: UpdatePlanInput) {
    const { planId, ...body } = input;
    return this.call(PlansService.endpoints.update, { params: { planId }, body });
  }
}
