import "server-only";
import { z } from "zod";
import { BaseService, type BaseServiceDeps } from "@/server/api/base-service";
import { endpoint } from "@/server/api/endpoint";
import { listOf } from "@/server/api/schema-kit";

/** Source : `auditDto` et `auditQuerySchema` (admin.ts). `limit` 1 à 200, défaut 50, pas de curseur. */
const auditEntry = z.object({
  id: z.string(),
  action: z.string(),
  actorId: z.string().nullable(),
  actorRole: z.string().nullable(),
  targetType: z.string().nullable(),
  targetId: z.string().nullable(),
  communityId: z.string().nullable(),
  ip: z.string().nullable(),
  before: z.unknown(),
  after: z.unknown(),
  createdAt: z.string().nullable(),
});
export type AuditEntry = z.infer<typeof auditEntry>;

const auditQuery = z.object({
  communityId: z.string().trim().max(190).optional(),
  limit: z.number().int().min(1).max(200).optional(),
});
export type ListAuditEntriesInput = z.input<typeof auditQuery>;

/** Dossier API : `/v1/admin/audit-log`. */
export class AuditService extends BaseService {
  private static readonly endpoints = {
    list: endpoint({ method: "GET", path: "/", query: auditQuery, response: listOf(auditEntry) }),
  } as const;

  constructor(deps: BaseServiceDeps) {
    super(deps, { basePath: "/v1/admin/audit-log" });
  }

  async listAuditEntries(input: ListAuditEntriesInput = {}) {
    return (await this.call(AuditService.endpoints.list, { query: input })).items;
  }
}
