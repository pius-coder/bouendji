import "server-only";
import { BaseService, type BaseServiceDeps } from "@/server/api/base-service";
import { endpoint } from "@/server/api/endpoint";
import { id, listOf } from "@/server/api/schema-kit";
import { z } from "zod";
import { type AdminCreate, adminAccount, adminCreateBody, adminCreated, adminResetResponse } from "./admins.schema";

export type CreateAdminInput = AdminCreate;

/** Dossier API : `/v1/admin/admins` (comptes d'administration, owner seulement côté API). */
export class AdminsService extends BaseService {
  private static readonly endpoints = {
    list: endpoint({ method: "GET", path: "/", response: listOf(adminAccount) }),
    create: endpoint({
      method: "POST",
      path: "/",
      body: adminCreateBody,
      response: adminCreated,
      idempotent: true,
      refreshAfter: true,
    }),
    resetPassword: endpoint({
      method: "POST",
      path: "/:adminId/reset-password",
      params: z.object({ adminId: id }),
      response: adminResetResponse,
      refreshAfter: true,
    }),
  } as const;

  constructor(deps: BaseServiceDeps) {
    super(deps, { basePath: "/v1/admin/admins" });
  }

  async listAdmins() {
    return (await this.call(AdminsService.endpoints.list)).items;
  }

  createAdmin(input: CreateAdminInput) {
    return this.call(AdminsService.endpoints.create, { body: input });
  }

  /** Owner : mot de passe provisoire renvoyé une fois ; l'admin doit le changer. */
  resetPassword(adminId: string) {
    return this.call(AdminsService.endpoints.resetPassword, { params: { adminId } });
  }
}
