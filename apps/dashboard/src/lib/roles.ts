import type { AdminMe } from "@/server/services/admin-auth/admin-auth.schema";

/**
 * Ce que l'écran AFFICHE selon le rôle. Aucune protection : Fastify recharge
 * rôles et appartenances à chaque requête et répond 403 (D78). Miroir de
 * `permitted()` dans `apps/api/src/routes/admin.ts` (relu, 2026-10-23).
 */
export type Role = "owner" | "community_admin" | "support" | "finance";

export const ROLE_LABEL: Record<Role, string> = {
  owner: "Propriétaire",
  community_admin: "Administrateur",
  support: "Support",
  finance: "Finance",
};

export type Capability =
  | "community.manage"
  | "community.read"
  | "plans.read"
  | "plans.manage"
  | "staff.manage"
  | "members.read"
  | "orders.read"
  | "money.read"
  | "devices.revoke"
  | "devices.offline"
  | "payouts.read"
  | "payouts.approve"
  | "payouts.create"
  | "payouts.operate"
  | "network.read"
  | "network.write"
  | "audit.read";

export function roleIn(me: AdminMe, communityId: string | null): Role | null {
  if (me.platformRole === "owner") return "owner";
  const entry = communityId ? me.memberships.find((m) => m.communityId === communityId) : undefined;
  return entry && isStaffRole(entry.role) ? entry.role : null;
}

function isStaffRole(value: string): value is Exclude<Role, "owner"> {
  return value === "community_admin" || value === "support" || value === "finance";
}

function anyRole(me: AdminMe, roles: readonly string[]): boolean {
  return me.memberships.some((m) => roles.includes(m.role));
}

export function can(me: AdminMe, capability: Capability, communityId: string | null): boolean {
  if (me.platformRole === "owner") return true;
  const local = roleIn(me, communityId);
  switch (capability) {
    case "community.manage":
      return false;
    case "community.read":
      // API `community.read` : une communauté précise exige une appartenance ; la liste, au moins une.
      return communityId ? local !== null : me.memberships.length > 0;
    case "plans.read":
      // community.read : tout rôle local (une communauté précise exige une appartenance).
      return local !== null;
    case "plans.manage":
    case "staff.manage":
      // plan.manage, membership.read/write : owner ou community_admin de la communauté.
      return local === "community_admin";
    case "members.read":
    case "devices.revoke":
    case "devices.offline":
      // member.read, device.revoke, offline_bundle.issue.
      return local === "community_admin" || local === "support";
    case "orders.read":
      // Écart connu, non tranché (voir knowledge/agents/dash-roles-haiku/notes/matrice.md) :
      // permitted() accorde `finance` hors périmètre, mais scopedCommunity() répond 403 sur
      // les routes `/communities/:id/orders`. Le dashboard suit la règle produit (ui-model.test.ts).
      return local !== null || anyRole(me, ["finance"]);
    case "money.read":
      // Route `/communities/:id/commissions` : scopedCommunity() exige une appartenance, donc local seulement.
      return local === "community_admin" || local === "finance";
    case "payouts.read":
    case "payouts.approve":
      // Miroir de commission.read / payout.approve (permitted()) : par communauté quand on la connaît,
      // sinon « dans au moins une communauté » (file globale, les boutons doivent passer la communauté du versement).
      if (communityId) return local === "community_admin" || anyRole(me, ["finance"]);
      return anyRole(me, ["community_admin", "finance"]);
    case "payouts.create":
      // payout.create : finance de la communauté (préparer un versement = encaisser pour elle).
      return local === "finance";
    case "payouts.operate":
      // payout.pay / confirm / resolve : finance, de la communauté ou d'une autre.
      return anyRole(me, ["finance"]);
    case "network.read":
      return anyRole(me, ["community_admin", "support"]);
    case "network.write":
      return false;
    case "audit.read":
      return local === "community_admin";
  }
}
