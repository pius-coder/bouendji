import type { AdminMe } from "@/server/services/admin-auth/admin-auth.schema";

/**
 * Ce que l'écran AFFICHE selon le rôle. Aucune protection : Fastify recharge
 * rôles et appartenances à chaque requête et répond 403 (D78). Miroir de
 * `permitted()` dans `apps/api/src/routes/admin.ts` (relu, 2026-10-23), complété
 * par les capacités de la section 5 du chantier vague 1.
 *
 * Rôles plateforme cumulables : `owner`, `reseau`. `reseau` n'est lu que lorsque
 * l'API expose `platformRoles` (contrat R1, chantier §6) ; tant qu'il n'est pas
 * fusionné, seul `platformRole === "owner"` est connu.
 */
export type Role = "owner" | "reseau" | "community_admin" | "support" | "finance";
export type PlatformRole = "owner" | "reseau";

export const ROLE_LABEL: Record<Role, string> = {
  owner: "Propriétaire",
  reseau: "Réseau",
  community_admin: "Administrateur",
  support: "Support",
  finance: "Finance",
};

export type Capability =
  | "account.self"
  | "admin.invite"
  | "onboarding.self"
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
  | "night_slot.manage"
  | "build.request"
  | "build.approve"
  | "pricing.read"
  | "pricing.manage"
  | "xui.manage"
  | "presence.read"
  | "audit.read";

/** Ce qu'il faut pour décider : le contexte admin, `platformRoles` quand l'API le fournit. */
export type RoleSource = Pick<AdminMe, "platformRole" | "memberships"> & { platformRoles?: readonly string[] };

/** Rôles plateforme du compte (`owner` et/ou `reseau`). */
export function platformRolesOf(me: RoleSource): PlatformRole[] {
  const out: PlatformRole[] = [];
  if (me.platformRole === "owner" || me.platformRoles?.includes("owner")) out.push("owner");
  if (me.platformRoles?.includes("reseau")) out.push("reseau");
  return out;
}

/** Capacités que `reseau` reçoit, et rien d'autre (section 5 du chantier). */
const RESEAU_CAPABILITIES: ReadonlySet<Capability> = new Set<Capability>([
  "account.self",
  "network.read",
  "network.write",
  "night_slot.manage",
]);

export function roleIn(me: RoleSource, communityId: string | null): Role | null {
  const platform = platformRolesOf(me);
  if (platform.includes("owner")) return "owner";
  const entry = communityId ? me.memberships.find((m) => m.communityId === communityId) : undefined;
  if (entry && isStaffRole(entry.role)) return entry.role;
  return platform.includes("reseau") ? "reseau" : null;
}

function isStaffRole(value: string): value is Exclude<Role, "owner" | "reseau"> {
  return value === "community_admin" || value === "support" || value === "finance";
}

function anyRole(me: RoleSource, roles: readonly string[]): boolean {
  return me.memberships.some((m) => roles.includes(m.role));
}

export function can(me: RoleSource, capability: Capability, communityId: string | null): boolean {
  if (platformRolesOf(me).includes("owner")) return true;
  if (capability === "account.self") return true;
  if (platformRolesOf(me).includes("reseau") && RESEAU_CAPABILITIES.has(capability)) return true;
  const local = roleIn(me, communityId);
  switch (capability) {
    case "admin.invite":
    case "pricing.manage":
    case "xui.manage":
    case "build.approve":
    case "presence.read":
    case "community.manage":
      // Owner seul (le court-circuit ci-dessus le couvre ; ici, rien d'autre).
      return false;
    case "onboarding.self":
      // Admin sans communauté (premier accès) ou administrateur de la communauté active.
      return communityId ? local === "community_admin" : me.memberships.length === 0;
    case "build.request":
    case "pricing.read":
      return local === "community_admin";
    case "night_slot.manage":
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
