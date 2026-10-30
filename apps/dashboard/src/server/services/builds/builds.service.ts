import "server-only";
import { z } from "zod";
import { BaseService, type BaseServiceDeps } from "@/server/api/base-service";
import { endpoint } from "@/server/api/endpoint";
import { id, listOf } from "@/server/api/schema-kit";

/** Source : `buildDto` (routes/builds.ts). */
export const build = z.object({
  id: z.string(),
  status: z.string(),
  versionCode: z.number().nullable(),
  versionName: z.string().nullable(),
  sha256: z.string().nullable(),
  apkUrl: z.string().nullable(),
  /** Page Cloudflare de la marque : le lien à partager, jamais l'APK brut. */
  downloadPageUrl: z.string().nullable().optional(),
  rejectReason: z.string().nullable().optional(),
  createdAt: z.string().nullable(),
  updatedAt: z.string().nullable(),
});
export type Build = z.infer<typeof build>;

const appParams = z.object({ appId: id });
const buildParams = z.object({ buildId: id });
const triggerBody = z.object({ versionName: z.string().trim().min(1).max(40).optional() });
export const rejectBuildBody = z.object({
  reason: z.string().trim().min(3, "Motif de 3 à 280 caractères.").max(280, "Motif de 3 à 280 caractères."),
});
const buildStepResponse = z.object({ buildId: z.string(), status: z.string() });

export type ListBuildsInput = { appId: string };
export type TriggerBuildInput = { appId: string } & z.input<typeof triggerBody>;
export type RequestBuildInput = { appId: string } & z.input<typeof triggerBody>;

/** Dossier API : `/v1/admin/apps` (builds) et `/v1/admin/builds` (approve / reject R5). */
export class BuildsService extends BaseService {
  private static readonly endpoints = {
    list: endpoint({ method: "GET", path: "/:appId/builds", params: appParams, response: listOf(build) }),
    request: endpoint({
      method: "POST",
      path: "/:appId/build-requests",
      params: appParams,
      body: triggerBody,
      response: buildStepResponse,
      idempotent: true,
      refreshAfter: true,
    }),
    trigger: endpoint({
      method: "POST",
      path: "/:appId/builds",
      params: appParams,
      body: triggerBody,
      response: buildStepResponse,
      idempotent: true,
      refreshAfter: true,
    }),
    approve: endpoint({
      method: "POST",
      basePath: "/v1/admin/builds",
      path: "/:buildId/approve",
      params: buildParams,
      response: buildStepResponse,
      idempotent: true,
      refreshAfter: true,
    }),
    reject: endpoint({
      method: "POST",
      basePath: "/v1/admin/builds",
      path: "/:buildId/reject",
      params: buildParams,
      body: rejectBuildBody,
      response: buildStepResponse,
      idempotent: true,
      refreshAfter: true,
    }),
  } as const;

  constructor(deps: BaseServiceDeps) {
    super(deps, { basePath: "/v1/admin/apps" });
  }

  async listBuilds(input: ListBuildsInput) {
    return (await this.call(BuildsService.endpoints.list, { params: input })).items;
  }

  requestBuild(input: RequestBuildInput) {
    const { appId, ...body } = input;
    return this.call(BuildsService.endpoints.request, { params: { appId }, body });
  }

  triggerBuild(input: TriggerBuildInput) {
    const { appId, ...body } = input;
    return this.call(BuildsService.endpoints.trigger, { params: { appId }, body });
  }

  approveBuild(buildId: string) {
    return this.call(BuildsService.endpoints.approve, { params: { buildId } });
  }

  rejectBuild(buildId: string, reason: string) {
    return this.call(BuildsService.endpoints.reject, { params: { buildId }, body: { reason } });
  }
}
