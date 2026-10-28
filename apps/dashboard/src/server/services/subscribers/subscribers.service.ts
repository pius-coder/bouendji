import "server-only";
import { BaseService, type BaseServiceDeps } from "@/server/api/base-service";
import { endpoint } from "@/server/api/endpoint";
import { listOf } from "@/server/api/schema-kit";
import { communityIdParams } from "../communities/communities.schema";
import { searchQuery, searchResult, subscriber, subscriberDetail, userIdParams } from "./subscribers.schema";

export type ListSubscribersInput = { communityId: string };

/** Dossier API : `/v1/admin/communities` (liste) et `/v1/admin/users` + `/v1/admin/search` (R3). */
export class SubscribersService extends BaseService {
  private static readonly endpoints = {
    list: endpoint({
      method: "GET",
      path: "/:communityId/users",
      params: communityIdParams,
      response: listOf(subscriber),
    }),
    get: endpoint({
      method: "GET",
      basePath: "/v1/admin/users",
      path: "/:userId",
      params: userIdParams,
      response: subscriberDetail,
    }),
    search: endpoint({
      method: "GET",
      basePath: "/v1/admin",
      path: "/search",
      query: searchQuery,
      response: searchResult,
    }),
  } as const;

  constructor(deps: BaseServiceDeps) {
    super(deps, { basePath: "/v1/admin/communities" });
  }

  async listSubscribers(input: ListSubscribersInput) {
    return (await this.call(SubscribersService.endpoints.list, { params: input })).items;
  }

  getSubscriber(userId: string) {
    return this.call(SubscribersService.endpoints.get, { params: { userId } });
  }

  search(q: string) {
    return this.call(SubscribersService.endpoints.search, { query: { q } });
  }
}
