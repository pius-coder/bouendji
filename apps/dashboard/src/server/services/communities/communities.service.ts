import "server-only";
import { BaseService, type BaseServiceDeps } from "@/server/api/base-service";
import { endpoint } from "@/server/api/endpoint";
import { listOf } from "@/server/api/schema-kit";
import {
  type CommunityCreate,
  type CommunityUpdate,
  type MembershipCreate,
  type MembershipUpdate,
  community,
  communityCreateBody,
  communityIdParams,
  communitySummary,
  communityUpdateBody,
  membership,
  membershipCreateBody,
  membershipIdParams,
  membershipUpdateBody,
} from "./communities.schema";

export type CreateCommunityInput = CommunityCreate;
export type UpdateCommunityInput = { communityId: string } & CommunityUpdate;
export type ListMembersInput = { communityId: string };
export type AddMemberInput = { communityId: string } & MembershipCreate;
export type UpdateMemberInput = { membershipId: string } & MembershipUpdate;
export type RemoveMemberInput = { membershipId: string };

/** Dossier API : `/v1/admin/communities` (communautés et leurs membres). */
export class CommunitiesService extends BaseService {
  private static readonly endpoints = {
    list: endpoint({ method: "GET", path: "/", response: listOf(community) }),
    get: endpoint({ method: "GET", path: "/:communityId", params: communityIdParams, response: community }),
    summary: endpoint({
      method: "GET",
      path: "/:communityId/summary",
      params: communityIdParams,
      response: communitySummary,
    }),
    create: endpoint({
      method: "POST",
      path: "/",
      body: communityCreateBody,
      response: community,
      idempotent: true,
      refreshAfter: true,
    }),
    update: endpoint({
      method: "PATCH",
      path: "/:communityId",
      params: communityIdParams,
      body: communityUpdateBody,
      response: community,
      refreshAfter: true,
    }),
    listMembers: endpoint({
      method: "GET",
      path: "/:communityId/memberships",
      params: communityIdParams,
      response: listOf(membership),
    }),
    addMember: endpoint({
      method: "POST",
      path: "/:communityId/memberships",
      params: communityIdParams,
      body: membershipCreateBody,
      response: membership,
      refreshAfter: true,
    }),
    // Autre dossier de l'API : `/v1/admin/memberships/{id}`.
    updateMember: endpoint({
      method: "PATCH",
      basePath: "/v1/admin/memberships",
      path: "/:membershipId",
      params: membershipIdParams,
      body: membershipUpdateBody,
      response: membership,
      refreshAfter: true,
    }),
    removeMember: endpoint({
      method: "DELETE",
      basePath: "/v1/admin/memberships",
      path: "/:membershipId",
      params: membershipIdParams,
      refreshAfter: true,
    }),
  } as const;

  constructor(deps: BaseServiceDeps) {
    super(deps, { basePath: "/v1/admin/communities" });
  }

  async listCommunities() {
    return (await this.call(CommunitiesService.endpoints.list)).items;
  }

  getCommunity(input: { communityId: string }) {
    return this.call(CommunitiesService.endpoints.get, { params: input });
  }

  getSummary(input: { communityId: string }) {
    return this.call(CommunitiesService.endpoints.summary, { params: input });
  }

  createCommunity(input: CreateCommunityInput) {
    return this.call(CommunitiesService.endpoints.create, { body: input });
  }

  updateCommunity(input: UpdateCommunityInput) {
    const { communityId, ...body } = input;
    return this.call(CommunitiesService.endpoints.update, { params: { communityId }, body });
  }

  async listMembers(input: ListMembersInput) {
    return (await this.call(CommunitiesService.endpoints.listMembers, { params: input })).items;
  }

  addMember(input: AddMemberInput) {
    const { communityId, ...body } = input;
    return this.call(CommunitiesService.endpoints.addMember, { params: { communityId }, body });
  }

  updateMember(input: UpdateMemberInput) {
    const { membershipId, ...body } = input;
    return this.call(CommunitiesService.endpoints.updateMember, { params: { membershipId }, body });
  }

  removeMember(input: RemoveMemberInput) {
    return this.call(CommunitiesService.endpoints.removeMember, { params: input });
  }
}
