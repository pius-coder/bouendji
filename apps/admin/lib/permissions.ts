/**
 * Réplique exacte de la matrice `permitted()` de `apps/api/src/routes/admin.ts`
 * (lignes 159-207). L'interface ne fait que refléter une décision serveur :
 * masquer un écran est un confort, jamais une sécurité. Le serveur reste seul
 * juge et répond 403 en cas de désaccord.
 */
import type { AdminIdentity, ScreenId, StaffRole } from "./types";
import { roleLabel } from "./format";

export function isOwner(admin: AdminIdentity | null): boolean {
  return admin?.platformRole === "owner";
}

export function localRole(admin: AdminIdentity | null, communityId: string | null): StaffRole | null {
  if (!admin || !communityId) return null;
  return admin.memberships.find((membership) => membership.communityId === communityId)?.role ?? null;
}

export function hasAnyRole(admin: AdminIdentity | null, roles: readonly StaffRole[]): boolean {
  if (!admin) return false;
  return admin.memberships.some((membership) => roles.includes(membership.role));
}

function anyRole(admin: AdminIdentity | null, roles: readonly StaffRole[]): boolean {
  return hasAnyRole(admin, roles);
}

export type Capability =
  | "community.read"
  | "community.manage"
  | "membership.read"
  | "membership.write"
  | "member.read"
  | "order.read"
  | "commission.read"
  | "payout.create"
  | "endpoint.read"
  | "device.revoke"
  | "offline_bundle.issue"
  | "audit.read";

export function can(
  admin: AdminIdentity | null,
  capability: Capability,
  communityId: string | null,
): boolean {
  if (!admin) return false;
  if (isOwner(admin)) return true;
  const local = communityId ? localRole(admin, communityId) : null;

  switch (capability) {
    case "community.read":
      return communityId ? local !== null : admin.memberships.length > 0;
    case "community.manage":
      return false;
    case "membership.read":
    case "membership.write":
      return local === "community_admin";
    case "member.read":
      return local === "community_admin" || local === "support";
    case "order.read":
      return local !== null || anyRole(admin, ["finance"]);
    case "commission.read":
      return local === "community_admin" || local === "finance" || anyRole(admin, ["finance"]);
    case "payout.create":
      return local === "finance";
    case "endpoint.read":
      return anyRole(admin, ["community_admin", "support"]);
    case "device.revoke":
    case "offline_bundle.issue":
      return local === "community_admin" || local === "support";
    case "audit.read":
      return local === "community_admin";
    default:
      return false;
  }
}

/** Qui voit les montants : owner, community_admin (ses ventes), finance. */
export function seesMoney(admin: AdminIdentity | null, communityId: string | null): boolean {
  if (!admin) return false;
  if (isOwner(admin)) return true;
  const local = communityId ? localRole(admin, communityId) : null;
  return local === "community_admin" || local === "finance";
}

export function screenAllowed(admin: AdminIdentity | null, screen: ScreenId): boolean {
  if (!admin) return false;
  switch (screen) {
    case "overview":
    case "communities":
      return true;
    case "members":
      return isOwner(admin) || anyRole(admin, ["community_admin"]);
    case "orders":
      return isOwner(admin) || admin.memberships.length > 0;
    case "commissions":
      return isOwner(admin) || anyRole(admin, ["community_admin", "finance"]);
    case "devices":
      return isOwner(admin) || anyRole(admin, ["community_admin", "support"]);
    case "pool":
      return can(admin, "endpoint.read", null);
    case "audit":
      return isOwner(admin) || anyRole(admin, ["community_admin"]);
    default:
      return false;
  }
}

export function roleSummary(admin: AdminIdentity | null, communities: { id: string; name: string }[]): string {
  if (!admin) return "";
  if (isOwner(admin)) return "Propriétaire";
  const parts = admin.memberships.map((membership) => {
    const community = communities.find((entry) => entry.id === membership.communityId);
    const base = roleLabel(membership.role);
    return community ? `${base} — ${community.name}` : base;
  });
  return parts.join(" · ") || "Aucun périmètre";
}
