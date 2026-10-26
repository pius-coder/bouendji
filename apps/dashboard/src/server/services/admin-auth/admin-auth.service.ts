import "server-only";
import { z } from "zod";
import { BaseService, type BaseServiceDeps } from "@/server/api/base-service";
import { endpoint } from "@/server/api/endpoint";
import {
  adminMe,
  loginBody,
  loginResult,
  passwordChangeBody,
  sessionList,
  sessionToken,
  updateMeBody,
} from "./admin-auth.schema";

export type LoginInput = z.input<typeof loginBody>;
export type UpdateMeInput = z.input<typeof updateMeBody>;
export type PasswordChangeInput = z.input<typeof passwordChangeBody>;

const sessionId = z.object({ id: z.string().min(1) });

/**
 * Dossier API : `/v1/admin`. Connexion, déconnexion, compte (profil, mot de passe,
 * sessions) : contrat chantier-vague1 §6.
 */
export class AdminAuthService extends BaseService {
  private static readonly endpoints = {
    // Clé console seule : le JWT n'existe pas encore.
    login: endpoint({ method: "POST", path: "/auth/login", admin: "key", body: loginBody, response: loginResult }),
    // Révoque la session courante ; 204.
    logout: endpoint({ method: "POST", path: "/auth/logout" }),
    me: endpoint({ method: "GET", path: "/me", response: adminMe }),
    updateMe: endpoint({ method: "PATCH", path: "/me", body: updateMeBody, response: adminMe, refreshAfter: true }),
    // Nouvelle session ; les autres sont révoquées côté API.
    changePassword: endpoint({
      method: "POST",
      path: "/me/password",
      body: passwordChangeBody,
      response: sessionToken,
    }),
    listSessions: endpoint({ method: "GET", path: "/me/sessions", response: sessionList }),
    revokeSession: endpoint({
      method: "DELETE",
      path: "/me/sessions/:id",
      params: sessionId,
      refreshAfter: true,
    }),
    revokeOtherSessions: endpoint({
      method: "DELETE",
      path: "/me/sessions",
      query: z.object({ scope: z.literal("others") }),
      refreshAfter: true,
    }),
  } as const;

  constructor(deps: BaseServiceDeps) {
    super(deps, { basePath: "/v1/admin" });
  }

  login(input: LoginInput) {
    return this.call(AdminAuthService.endpoints.login, { body: input });
  }

  /** Révoque la session courante. L'appelant efface le cookie même si l'appel échoue. */
  logout() {
    return this.call(AdminAuthService.endpoints.logout);
  }

  getMe() {
    return this.call(AdminAuthService.endpoints.me);
  }

  updateMe(input: UpdateMeInput) {
    return this.call(AdminAuthService.endpoints.updateMe, { body: input });
  }

  changePassword(input: PasswordChangeInput) {
    return this.call(AdminAuthService.endpoints.changePassword, { body: input });
  }

  listSessions() {
    return this.call(AdminAuthService.endpoints.listSessions);
  }

  revokeSession(id: string) {
    return this.call(AdminAuthService.endpoints.revokeSession, { params: { id } });
  }

  revokeOtherSessions() {
    return this.call(AdminAuthService.endpoints.revokeOtherSessions, { query: { scope: "others" } });
  }
}
