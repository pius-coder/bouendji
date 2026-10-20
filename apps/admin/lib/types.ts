/** Types des DTO réellement renvoyés par `apps/api/src/routes/admin.ts`. */

export type PlatformRole = "owner" | "none";

export type StaffRole = "community_admin" | "support" | "finance";

export const STAFF_ROLES: readonly StaffRole[] = ["community_admin", "support", "finance"];

export interface MembershipSummary {
  communityId: string;
  role: StaffRole;
}

export interface AdminIdentity {
  adminId: string;
  email: string;
  name: string;
  platformRole: PlatformRole;
  memberships: MembershipSummary[];
}

export interface Community {
  id: string;
  name: string;
  slug: string;
  status: string;
  commissionBps: number | null;
  createdAt: string | null;
}

export interface Membership {
  id: string;
  adminUserId: string;
  email: string;
  name: string;
  role: StaffRole | string;
  status: string;
  createdAt: string | null;
}

export interface Order {
  id: string;
  status: string;
  currency: string;
  amountXaf: number | null;
  commissionBps: number | null;
  commissionXaf: number | null;
  createdAt: string | null;
  paidAt: string | null;
}

export interface Commission {
  id: string;
  orderId: string;
  bps: number | null;
  amountXaf: number | null;
  status: string;
  payoutId: string | null;
  createdAt: string | null;
  availableAt: string | null;
}

/**
 * Projection volontairement pauvre : le pool de l'API ne contient déjà ni
 * UUID, ni chemin WebSocket, ni credential. La liste blanche garantit qu'un
 * champ ajouté plus tard ne peut pas atteindre le DOM par accident.
 */
export interface EndpointRow {
  label: string;
  region: string;
  capacity: number | null;
  inUse: number | null;
  status: string;
  health: string;
  latencyMs: number | null;
  lastSeenAt: string | null;
  expiresAt: string | null;
}

export interface Device {
  deviceId: string;
  name: string;
  platform: string;
  status: string;
  lastSeenAt: string | null;
  revokedAt: string | null;
  createdAt: string | null;
}

export interface AuditEntry {
  id: string;
  action: string;
  actorRole: string;
  targetType: string;
  communityId: string;
  createdAt: string | null;
}

export interface PoolSnapshot {
  poolRevision: number | null;
  count: number | null;
  endpoints: EndpointRow[];
}

export interface IssuedBundle {
  deviceName: string;
  bundleId: string;
  notAfter: string | null;
  singleUse: boolean;
  endpointCount: number | null;
  file: unknown;
}

export type ScreenId =
  | "overview"
  | "communities"
  | "members"
  | "orders"
  | "commissions"
  | "devices"
  | "pool"
  | "audit";
