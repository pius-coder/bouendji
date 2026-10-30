import "server-only";
import { BaseService, type BaseServiceDeps } from "@/server/api/base-service";
import { endpoint } from "@/server/api/endpoint";
import {
  type GrantBody,
  grantBody,
  grantCreated,
  grantOptions,
  manualGrantList,
  owedList,
  owedQuery,
  settlementBody,
  settlementCreated,
  settlementIdParams,
  settlementList,
  settlementRefreshed,
  settlementsQuery,
  userIdParams,
} from "./manual-grants.schema";

/**
 * Dossier API : `/v1/admin` (105). Capacité `manual_grant.manage` côté API :
 * owner, ou `community_admin` de la communauté concernée.
 */
export class ManualGrantsService extends BaseService {
  private static readonly endpoints = {
    options: endpoint({
      method: "GET",
      path: "/users/:userId/manual-grants/options",
      params: userIdParams,
      response: grantOptions,
    }),
    listForUser: endpoint({
      method: "GET",
      path: "/users/:userId/manual-grants",
      params: userIdParams,
      response: manualGrantList,
    }),
    grant: endpoint({
      method: "POST",
      path: "/users/:userId/manual-grants",
      params: userIdParams,
      body: grantBody,
      response: grantCreated,
      // L'API enregistre l'Idempotency-Key : un même envoi ne crée qu'une dette.
      idempotent: true,
    }),
    owed: endpoint({
      method: "GET",
      path: "/manual-grants",
      query: owedQuery,
      response: owedList,
    }),
    settlements: endpoint({
      method: "GET",
      path: "/settlements",
      query: settlementsQuery,
      response: settlementList,
    }),
    createSettlement: endpoint({
      method: "POST",
      path: "/settlements",
      body: settlementBody,
      response: settlementCreated,
      idempotent: true,
    }),
    refreshSettlement: endpoint({
      method: "POST",
      path: "/settlements/:settlementId/refresh",
      params: settlementIdParams,
      response: settlementRefreshed,
      idempotent: true,
    }),
  } as const;

  constructor(deps: BaseServiceDeps) {
    super(deps, { basePath: "/v1/admin" });
  }

  options(userId: string) {
    return this.call(ManualGrantsService.endpoints.options, { params: { userId } });
  }

  async listForUser(userId: string) {
    return (await this.call(ManualGrantsService.endpoints.listForUser, { params: { userId } })).items;
  }

  /** `requestKey` : une clé par formulaire ouvert, pour qu'un double envoi ne crée qu'une dette. */
  grant(userId: string, body: GrantBody, requestKey?: string) {
    return this.call(ManualGrantsService.endpoints.grant, {
      params: { userId },
      body,
      ...(requestKey ? { idempotencyKey: requestKey } : {}),
    });
  }

  owed(communityId?: string) {
    return this.call(ManualGrantsService.endpoints.owed, { query: communityId ? { communityId } : {} });
  }

  async listSettlements(communityId?: string) {
    return (await this.call(ManualGrantsService.endpoints.settlements, { query: communityId ? { communityId } : {} })).items;
  }

  createSettlement(communityId: string) {
    return this.call(ManualGrantsService.endpoints.createSettlement, { body: { communityId } });
  }

  refreshSettlement(settlementId: string) {
    return this.call(ManualGrantsService.endpoints.refreshSettlement, { params: { settlementId } });
  }
}
