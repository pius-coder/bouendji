import "server-only";
import { BaseService, type BaseServiceDeps } from "@/server/api/base-service";
import { endpoint } from "@/server/api/endpoint";
import {
  type EndpointHealth,
  endpointHealthBody,
  endpointHealthChange,
  endpointIdParams,
  type ManualEndpoint,
  manualEndpointBody,
  manualEndpointCreated,
  pool,
} from "./network.schema";

export type SetEndpointHealthInput = { endpointId: string } & EndpointHealth;
export type AddManualEndpointsInput = ManualEndpoint;

/** Dossier API : `/v1/admin` (réseau : `pool`, `endpoints/{id}/health`, `endpoints/manual`). */
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
    // Republier le même `group` remplace ses lignes : rejouer la requête ne duplique rien.
    addManual: endpoint({
      method: "POST",
      path: "/endpoints/manual",
      body: manualEndpointBody,
      response: manualEndpointCreated,
      idempotent: true,
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
}
