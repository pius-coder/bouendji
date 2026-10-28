import "server-only";
import { BaseService, type BaseServiceDeps } from "@/server/api/base-service";
import { endpoint } from "@/server/api/endpoint";
import { listOf } from "@/server/api/schema-kit";
import { communityIdParams } from "../communities/communities.schema";
import {
  type OfflineIssue,
  device,
  deviceDetail,
  deviceIdParams,
  deviceRevoked,
  offlineBundleIssued,
  offlineIssueBody,
  offlineList,
  offlineListQuery,
} from "./devices.schema";

export type ListDevicesInput = { communityId: string };
export type RevokeDeviceInput = { deviceId: string };
export type IssueOfflineBundleInput = { deviceId: string } & OfflineIssue;
export type ListOfflineBundlesInput = { deviceId?: string };

/** Dossier API : `/v1/admin/devices` (fiche, révocation, fichiers hors-ligne). La liste vit sous les communautés (100 derniers). */
export class DevicesService extends BaseService {
  private static readonly endpoints = {
    // Autre dossier de l'API.
    list: endpoint({
      method: "GET",
      basePath: "/v1/admin/communities",
      path: "/:communityId/devices",
      params: communityIdParams,
      response: listOf(device),
    }),
    get: endpoint({
      method: "GET",
      path: "/:deviceId",
      params: deviceIdParams,
      response: deviceDetail,
    }),
    revoke: endpoint({
      method: "POST",
      path: "/:deviceId/revoke",
      params: deviceIdParams,
      response: deviceRevoked,
      idempotent: true,
      refreshAfter: true,
    }),
    issueOffline: endpoint({
      method: "POST",
      path: "/:deviceId/offline-bundles",
      params: deviceIdParams,
      body: offlineIssueBody,
      response: offlineBundleIssued,
      idempotent: true,
      refreshAfter: true,
    }),
    // Autre dossier de l'API ; réponse `{ bundles }` (et non `items`), 50 derniers.
    listOffline: endpoint({
      method: "GET",
      basePath: "/v1/admin/offline-bundles",
      path: "/",
      query: offlineListQuery,
      response: offlineList,
    }),
  } as const;

  constructor(deps: BaseServiceDeps) {
    super(deps, { basePath: "/v1/admin/devices" });
  }

  async listDevices(input: ListDevicesInput) {
    return (await this.call(DevicesService.endpoints.list, { params: input })).items;
  }

  getDevice(deviceId: string) {
    return this.call(DevicesService.endpoints.get, { params: { deviceId } });
  }

  revokeDevice(input: RevokeDeviceInput) {
    return this.call(DevicesService.endpoints.revoke, { params: input });
  }

  issueOfflineBundle(input: IssueOfflineBundleInput) {
    const { deviceId, ...body } = input;
    return this.call(DevicesService.endpoints.issueOffline, { params: { deviceId }, body });
  }

  async listOfflineBundles(input: ListOfflineBundlesInput = {}) {
    return (await this.call(DevicesService.endpoints.listOffline, { query: input })).bundles;
  }
}
