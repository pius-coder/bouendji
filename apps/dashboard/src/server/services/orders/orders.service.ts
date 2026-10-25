import "server-only";
import { BaseService, type BaseServiceDeps } from "@/server/api/base-service";
import { endpoint } from "@/server/api/endpoint";
import { listOf } from "@/server/api/schema-kit";
import { communityIdParams } from "../communities/communities.schema";
import {
  type CommissionsQuery,
  type OrdersQuery,
  commission,
  commissionsQuery,
  orderPage,
  ordersQuery,
} from "./orders.schema";

export type ListOrdersInput = { communityId: string } & OrdersQuery;
export type ListCommissionsInput = { communityId: string } & CommissionsQuery;

/** Dossier API : `/v1/admin/communities` (sous-ressources `orders` et `commissions`). */
export class OrdersService extends BaseService {
  private static readonly endpoints = {
    orders: endpoint({
      method: "GET",
      path: "/:communityId/orders",
      params: communityIdParams,
      query: ordersQuery,
      paginate: "cursor",
      response: orderPage,
    }),
    // `limit` seulement, pas de curseur côté API.
    commissions: endpoint({
      method: "GET",
      path: "/:communityId/commissions",
      params: communityIdParams,
      query: commissionsQuery,
      response: listOf(commission),
    }),
  } as const;

  constructor(deps: BaseServiceDeps) {
    super(deps, { basePath: "/v1/admin/communities" });
  }

  /** Page à curseur : `{ items, nextCursor? }`. */
  listOrders(input: ListOrdersInput) {
    const { communityId, ...query } = input;
    return this.call(OrdersService.endpoints.orders, { params: { communityId }, query });
  }

  async listCommissions(input: ListCommissionsInput) {
    const { communityId, ...query } = input;
    return (await this.call(OrdersService.endpoints.commissions, { params: { communityId }, query })).items;
  }
}
