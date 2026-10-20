/**
 * Normalisation des réponses de l'API.
 *
 * Tout arrive en `unknown` : chaque champ est relu un par un, avec une liste
 * blanche explicite. Un champ inconnu — ou ajouté plus tard côté serveur — est
 * ignoré plutôt que rendu. C'est ce qui empêche un identifiant de tunnel de
 * finir dans le DOM par accident.
 */
import type {
  AdminIdentity,
  AuditEntry,
  Commission,
  Community,
  Device,
  EndpointRow,
  Membership,
  MembershipSummary,
  Order,
  PlatformRole,
  PoolSnapshot,
  StaffRole,
} from "./types";
import { STAFF_ROLES } from "./types";

export type Dict = Record<string, unknown>;

export function asRecord(value: unknown): Dict | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Dict;
}

export function str(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

export function num(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function iso(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null;
  return Number.isFinite(Date.parse(value)) ? value : null;
}

export function list(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  const record = asRecord(payload);
  if (record && Array.isArray(record.items)) return record.items;
  return [];
}

function staffRole(value: unknown): StaffRole | null {
  return typeof value === "string" && (STAFF_ROLES as readonly string[]).includes(value)
    ? (value as StaffRole)
    : null;
}

export function normalizeAdmin(payload: unknown): AdminIdentity {
  const raw = asRecord(payload);
  if (!raw) throw new Error("L'API n'a pas renvoyé d'identité administrateur.");
  const memberships: MembershipSummary[] = [];
  if (Array.isArray(raw.memberships)) {
    for (const entry of raw.memberships) {
      const membership = asRecord(entry);
      if (!membership) continue;
      const communityId = str(membership.communityId);
      const role = staffRole(membership.role);
      if (!communityId || !role) continue;
      memberships.push({ communityId, role });
    }
  }
  const platformRole: PlatformRole = raw.platformRole === "owner" ? "owner" : "none";
  return {
    adminId: str(raw.adminId) || str(raw.id),
    email: str(raw.email),
    name: str(raw.name) || str(raw.email) || "Administrateur",
    platformRole,
    memberships,
  };
}

export function normalizeCommunity(raw: unknown): Community | null {
  const record = asRecord(raw);
  if (!record) return null;
  const id = str(record.id);
  if (!id) return null;
  return {
    id,
    name: str(record.name) || "Communauté sans nom",
    slug: str(record.slug),
    status: str(record.status) || "unknown",
    commissionBps: num(record.commissionBps),
    createdAt: iso(record.createdAt),
  };
}

export function normalizeMembership(raw: unknown): Membership {
  const record = asRecord(raw) ?? {};
  return {
    id: str(record.id),
    adminUserId: str(record.adminUserId),
    email: str(record.email),
    name: str(record.name),
    role: str(record.role),
    status: str(record.status) || "unknown",
    createdAt: iso(record.createdAt),
  };
}

export function normalizeOrder(raw: unknown): Order {
  const record = asRecord(raw) ?? {};
  return {
    id: str(record.id),
    status: str(record.status) || "unknown",
    currency: str(record.currency) || "XAF",
    amountXaf: num(record.amountXaf),
    commissionBps: num(record.commissionBps),
    commissionXaf: num(record.commissionXaf),
    createdAt: iso(record.createdAt),
    paidAt: iso(record.paidAt),
  };
}

export function normalizeCommission(raw: unknown): Commission {
  const record = asRecord(raw) ?? {};
  return {
    id: str(record.id),
    orderId: str(record.orderId),
    bps: num(record.bps),
    amountXaf: num(record.amountXaf),
    status: str(record.status) || "unknown",
    payoutId: str(record.payoutId) || null,
    createdAt: iso(record.createdAt),
    availableAt: iso(record.availableAt),
  };
}

/** Liste blanche stricte : aucun identifiant, hôte, port ou credential. */
export function normalizeEndpoint(raw: unknown): EndpointRow {
  const record = asRecord(raw) ?? {};
  return {
    label: str(record.label) || "Nœud sans libellé",
    region: str(record.region),
    capacity: num(record.capacity),
    inUse: num(record.inUse),
    status: str(record.status) || "unknown",
    health: str(record.health) || "unknown",
    latencyMs: num(record.latencyMs),
    lastSeenAt: iso(record.lastSeenAt),
    expiresAt: iso(record.expiresAt),
  };
}

export function normalizePool(payload: unknown): PoolSnapshot {
  const record = asRecord(payload);
  const endpoints = record && Array.isArray(record.endpoints) ? record.endpoints.map(normalizeEndpoint) : [];
  return {
    poolRevision: record ? num(record.poolRevision) : null,
    count: record ? num(record.count) : null,
    endpoints,
  };
}

export function normalizeDevice(raw: unknown): Device | null {
  const record = asRecord(raw);
  if (!record) return null;
  const deviceId = str(record.deviceId);
  if (!deviceId) return null;
  return {
    deviceId,
    name: str(record.name) || "Appareil sans nom",
    platform: str(record.platform),
    status: str(record.status) || "unknown",
    lastSeenAt: iso(record.lastSeenAt),
    revokedAt: iso(record.revokedAt),
    createdAt: iso(record.createdAt),
  };
}

export function normalizeAudit(raw: unknown): AuditEntry {
  const record = asRecord(raw) ?? {};
  return {
    id: str(record.id),
    action: str(record.action) || "—",
    actorRole: str(record.actorRole) || "—",
    targetType: str(record.targetType) || "—",
    communityId: str(record.communityId),
    createdAt: iso(record.createdAt),
  };
}
