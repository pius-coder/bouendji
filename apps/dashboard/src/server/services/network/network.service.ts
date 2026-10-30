import "server-only";
import { BaseService, type BaseServiceDeps } from "@/server/api/base-service";
import { endpoint } from "@/server/api/endpoint";
import {
  deployKeyResponse,
  type EndpointHealth,
  endpointHealthBody,
  endpointHealthChange,
  endpointIdParams,
  endpointTestResponse,
  type ManualEndpoint,
  manualEndpointBody,
  manualEndpointCreated,
  type ManualVless,
  manualVlessBody,
  manualVlessCreated,
  nightSlotsHistoryResponse,
  nightSlotsResponse,
  nightSlotView,
  pool,
  slotIdParams,
  telegramTestResponse,
  purgeExpiredResponse,
  endpointStatusBody,
  endpointStatusChange,
  deleteEndpointResponse,
} from "./network.schema";
import {
  type XuiServerBody,
  xuiServerBody,
  xuiServerIdParams,
  xuiServerList,
  xuiServerOne,
  xuiTestResult,
  xuiDeleteResult,
} from "./xui.schema";

export type SetEndpointHealthInput = { endpointId: string } & EndpointHealth;
export type AddManualEndpointsInput = ManualEndpoint;

/** Dossier API : `/v1/admin` (réseau : `pool`, `endpoints`, `xui/servers`, `night-slots`, `telegram/test`). */
export class NetworkService extends BaseService {
  private static readonly endpoints = {
    pool: endpoint({ method: "GET", path: "/pool", response: pool }),
    setHealth: endpoint({
      method: "POST",
      path: "/endpoints/:endpointId/health",
      params: endpointIdParams,
      body: endpointHealthBody,
      response: endpointHealthChange,
      refreshAfter: true,
    }),
    addManual: endpoint({
      method: "POST",
      path: "/endpoints/manual",
      body: manualEndpointBody,
      response: manualEndpointCreated,
      idempotent: true,
      refreshAfter: true,
    }),
    addManualVless: endpoint({
      method: "POST",
      path: "/endpoints/manual",
      body: manualVlessBody,
      response: manualVlessCreated,
      idempotent: true,
      refreshAfter: true,
    }),
    xuiList: endpoint({ method: "GET", path: "/xui/servers", response: xuiServerList }),
    xuiCreate: endpoint({ method: "POST", path: "/xui/servers", body: xuiServerBody, response: xuiServerOne, refreshAfter: true }),
    xuiTest: endpoint({ method: "POST", path: "/xui/servers/:serverId/test", params: xuiServerIdParams, response: xuiTestResult }),
    deleteXui: endpoint({
      method: "DELETE",
      path: "/xui/servers/:serverId",
      params: xuiServerIdParams,
      response: xuiDeleteResult,
      refreshAfter: true,
    }),
    nightSlots: endpoint({ method: "GET", path: "/night-slots", response: nightSlotsResponse }),
    nightHistory: endpoint({ method: "GET", path: "/night-slots/history", response: nightSlotsHistoryResponse }),
    claimNightSlot: endpoint({
      method: "POST",
      path: "/night-slots/:slotId/claim",
      params: slotIdParams,
      response: nightSlotView,
      idempotent: true,
      refreshAfter: true,
    }),
    issueDeployKey: endpoint({
      method: "POST",
      path: "/night-slots/:slotId/deploy-key",
      params: slotIdParams,
      response: deployKeyResponse,
      refreshAfter: true,
    }),
    testTelegram: endpoint({
      method: "POST",
      path: "/telegram/test",
      response: telegramTestResponse,
    }),
    purgeExpired: endpoint({
      method: "POST",
      path: "/endpoints/purge-expired",
      response: purgeExpiredResponse,
      refreshAfter: true,
    }),
    setStatus: endpoint({
      method: "POST",
      path: "/endpoints/:endpointId/status",
      params: endpointIdParams,
      body: endpointStatusBody,
      response: endpointStatusChange,
      refreshAfter: true,
    }),
    deleteEndpoint: endpoint({
      method: "DELETE",
      path: "/endpoints/:endpointId",
      params: endpointIdParams,
      response: deleteEndpointResponse,
      refreshAfter: true,
    }),
    testEndpoint: endpoint({
      method: "POST",
      path: "/endpoints/:endpointId/test",
      params: endpointIdParams,
      response: endpointTestResponse,
      refreshAfter: true,
    }),
  } as const;

  constructor(deps: BaseServiceDeps) {
    super(deps, { basePath: "/v1/admin" });
  }

  getPool() {
    return this.call(NetworkService.endpoints.pool);
  }

  setEndpointHealth(input: SetEndpointHealthInput) {
    const { endpointId, ...body } = input;
    return this.call(NetworkService.endpoints.setHealth, { params: { endpointId }, body });
  }

  addManualEndpoints(input: AddManualEndpointsInput) {
    return this.call(NetworkService.endpoints.addManual, { body: input });
  }

  addManualVless(input: ManualVless) {
    return this.call(NetworkService.endpoints.addManualVless, { body: input });
  }

  async listXuiServers() {
    return (await this.call(NetworkService.endpoints.xuiList)).servers;
  }

  async createXuiServer(body: XuiServerBody) {
    return (await this.call(NetworkService.endpoints.xuiCreate, { body })).server;
  }

  testXuiServer(serverId: string) {
    return this.call(NetworkService.endpoints.xuiTest, { params: { serverId } });
  }

  deleteXuiServer(serverId: string) {
    return this.call(NetworkService.endpoints.deleteXui, { params: { serverId } });
  }

  getNightSlots() {
    return this.call(NetworkService.endpoints.nightSlots);
  }

  async getNightSlotsHistory() {
    return (await this.call(NetworkService.endpoints.nightHistory)).slots;
  }

  claimNightSlot(slotId: string) {
    return this.call(NetworkService.endpoints.claimNightSlot, { params: { slotId } });
  }

  issueDeployKey(slotId: string) {
    return this.call(NetworkService.endpoints.issueDeployKey, { params: { slotId } });
  }

  testTelegram() {
    return this.call(NetworkService.endpoints.testTelegram);
  }

  purgeExpiredEndpoints() {
    return this.call(NetworkService.endpoints.purgeExpired);
  }

  setEndpointStatus(input: { endpointId: string; status: "active" | "draining" | "expired" }) {
    const { endpointId, status } = input;
    return this.call(NetworkService.endpoints.setStatus, { params: { endpointId }, body: { status } });
  }

  deleteEndpoint(endpointId: string) {
    return this.call(NetworkService.endpoints.deleteEndpoint, { params: { endpointId } });
  }

  /** Sonde TCP à la demande : l'API ouvre une connexion réelle vers `host:port` (D147). */
  testEndpoint(endpointId: string) {
    return this.call(NetworkService.endpoints.testEndpoint, { params: { endpointId } });
  }
}
