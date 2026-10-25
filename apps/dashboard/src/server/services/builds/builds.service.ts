import "server-only";
import { z } from "zod";
import { BaseService, type BaseServiceDeps } from "@/server/api/base-service";
import { endpoint } from "@/server/api/endpoint";
import { id, listOf } from "@/server/api/schema-kit";

/** Source : `buildDto` (routes/builds.ts). */
const build = z.object({
  id: z.string(),
  status: z.string(),
  versionCode: z.number().nullable(),
  versionName: z.string().nullable(),
  sha256: z.string().nullable(),
  apkUrl: z.string().nullable(),
  createdAt: z.string().nullable(),
  updatedAt: z.string().nullable(),
});
export type Build = z.infer<typeof build>;

const appParams = z.object({ appId: id });
const triggerBody = z.object({ versionName: z.string().trim().min(1).max(40).optional() });

export type ListBuildsInput = { appId: string };
export type TriggerBuildInput = { appId: string } & z.input<typeof triggerBody>;

/** Dossier API : `/v1/admin/apps` (sous-ressource `builds`). */
export class BuildsService extends BaseService {
  private static readonly endpoints = {
    list: endpoint({ method: "GET", path: "/:appId/builds", params: appParams, response: listOf(build) }),
    // 202 : le build est en file ; le suivi se fait par `listBuilds`.
    trigger: endpoint({
      method: "POST",
      path: "/:appId/builds",
      params: appParams,
      body: triggerBody,
      response: z.object({ buildId: z.string(), status: z.string() }),
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

  triggerBuild(input: TriggerBuildInput) {
    const { appId, ...body } = input;
    return this.call(BuildsService.endpoints.trigger, { params: { appId }, body });
  }
}
