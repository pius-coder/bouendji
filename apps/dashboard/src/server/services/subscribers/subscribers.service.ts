import "server-only";
import { BaseService, type BaseServiceDeps } from "@/server/api/base-service";
import { endpoint } from "@/server/api/endpoint";
import { listOf } from "@/server/api/schema-kit";
import { communityIdParams } from "../communities/communities.schema";
import { subscriber } from "./subscribers.schema";

export type ListSubscribersInput = { communityId: string };

/** Dossier API : `/v1/admin/communities` (sous-ressource `users`). Plafonné à 100 par l'API. */
export class SubscribersService extends BaseService {
  private static readonly endpoints = {
    list: endpoint({
      method: "GET",
      path: "/:communityId/users",
      params: communityIdParams,
      response: listOf(subscriber),
    }),
  } as const;

  constructor(deps: BaseServiceDeps) {
    super(deps, { basePath: "/v1/admin/communities" });
  }

  async listSubscribers(input: ListSubscribersInput) {
    return (await this.call(SubscribersService.endpoints.list, { params: input })).items;
  }
}
