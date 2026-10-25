import "server-only";
import type { z } from "zod";
import { BaseService, type BaseServiceDeps } from "@/server/api/base-service";
import { endpoint } from "@/server/api/endpoint";
import { adminMe, loginBody, loginResult } from "./admin-auth.schema";

export type LoginInput = z.input<typeof loginBody>;

/** Dossier API : `/v1/admin` (connexion et contexte du compte). */
export class AdminAuthService extends BaseService {
  private static readonly endpoints = {
    // Clé console seule : le JWT n'existe pas encore.
    login: endpoint({ method: "POST", path: "/auth/login", admin: "key", body: loginBody, response: loginResult }),
    me: endpoint({ method: "GET", path: "/me", response: adminMe }),
  } as const;

  constructor(deps: BaseServiceDeps) {
    super(deps, { basePath: "/v1/admin" });
  }

  login(input: LoginInput) {
    return this.call(AdminAuthService.endpoints.login, { body: input });
  }

  getMe() {
    return this.call(AdminAuthService.endpoints.me);
  }
}
