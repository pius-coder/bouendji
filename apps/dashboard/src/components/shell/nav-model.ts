import { can } from "@/lib/roles";
import type { AdminMe } from "@/server/services/admin-auth/admin-auth.schema";

export type NavIcon = "tag" | "shield" | "home" | "users" | "smartphone" | "receipt" | "wallet" | "server" | "history" | "building" | "file-download" | "download";

export interface NavItem {
  href: string;
  label: string;
  icon: NavIcon;
}

/** Entrées de la barre basse (5 au plus, « Plus » compris) et du reste. */
export interface NavModel {
  primary: NavItem[];
  more: NavItem[];
}

const LABEL = {
  home: "Accueil",
  subscribers: "Abonnés",
  devices: "Appareils",
  orders: "Commandes",
  payouts: "Versements",
  network: "Réseau",
  audit: "Journal",
  plans: "Forfaits",
  members: "Membres",
  communities: "Communautés",
  commissions: "Commissions",
  offline: "Fichiers de secours",
  builds: "Applications",
  admins: "Administrateurs",
} as const;

/**
 * Navigation calculée pour la communauté ACTIVE (jamais l'union des rôles).
 * `communityId` nul : aucune communauté accessible, seules les entrées globales restent.
 * Le rôle choisit ce qui s'affiche ; l'API refuse le reste (403).
 */
export function buildNav(me: AdminMe, communityId: string | null): NavModel {
  const scoped = (path: string) => `/${communityId}/${path}`;
  const primary: NavItem[] = [{ href: "/", label: LABEL.home, icon: "home" }];
  const more: NavItem[] = [];

  if (communityId && can(me, "members.read", communityId)) {
    primary.push({ href: scoped("subscribers"), label: LABEL.subscribers, icon: "users" });
    primary.push({ href: scoped("devices"), label: LABEL.devices, icon: "smartphone" });
  }
  if (communityId && can(me, "orders.read", communityId)) {
    primary.push({ href: scoped("orders"), label: LABEL.orders, icon: "receipt" });
  }
  // « Versements » est une page globale (`/payouts`, sans communauté dans l'URL) : on teste le même périmètre que la page.
  if (can(me, "payouts.read", null)) {
    (primary.length < 4 ? primary : more).push({ href: "/payouts", label: LABEL.payouts, icon: "wallet" });
  }
  if (communityId && can(me, "money.read", communityId)) {
    more.push({ href: scoped("commissions"), label: LABEL.commissions, icon: "receipt" });
  }
  if (me.platformRole === "owner") {
    more.push({ href: "/communities", label: LABEL.communities, icon: "building" });
    more.push({ href: "/admins", label: LABEL.admins, icon: "shield" });
  }
  if (communityId && can(me, "plans.read", communityId)) {
    more.push({ href: scoped("plans"), label: LABEL.plans, icon: "tag" });
  }
  if (communityId && can(me, "devices.offline", communityId)) {
    more.push({ href: scoped("offline"), label: LABEL.offline, icon: "file-download" });
  }
  if (communityId && can(me, "plans.manage", communityId)) {
    more.push({ href: scoped("builds"), label: LABEL.builds, icon: "download" });
  }
  if (communityId && can(me, "staff.manage", communityId)) {
    more.push({ href: scoped("members"), label: LABEL.members, icon: "shield" });
  }
  if (can(me, "network.read", communityId)) {
    more.push({ href: "/network", label: LABEL.network, icon: "server" });
  }
  if (communityId && can(me, "audit.read", communityId)) {
    more.push({ href: scoped("audit"), label: LABEL.audit, icon: "history" });
  }
  return { primary, more };
}

export interface NavGroup {
  /** Titre du groupe dans la barre latérale (2e niveau au plus, HIG sidebars). */
  label: string;
  items: NavItem[];
}

/**
 * Barre latérale desktop : MÊMES entrées que la barre basse, rangées en deux groupes
 * (plateforme, puis communauté active). Aucune entrée n'existe d'un côté seulement.
 */
export function sidebarGroups(nav: NavModel, communityId: string | null, communityName: string | null): NavGroup[] {
  const all = [...nav.primary, ...nav.more];
  const scopedPrefix = communityId ? `/${communityId}/` : null;
  const global = all.filter((i) => !scopedPrefix || !i.href.startsWith(scopedPrefix));
  const scoped = scopedPrefix ? all.filter((i) => i.href.startsWith(scopedPrefix)) : [];
  const groups: NavGroup[] = [{ label: "Général", items: global }];
  if (scoped.length > 0) groups.push({ label: communityName ?? "Communauté", items: scoped });
  return groups;
}

export function isActivePath(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

/* -------------------------------------------------------------------------- */
/* Sections du shell (structure orya : rail de sections + sous-menu).          */
/* -------------------------------------------------------------------------- */

export type SectionKey = "pilot" | "community" | "money" | "platform";

export interface NavSection {
  key: SectionKey;
  label: string;
  description: string;
  icon: NavIcon;
  items: NavItem[];
}

const SECTION_META: Record<SectionKey, { label: string; description: string; icon: NavIcon }> = {
  pilot: { label: "Pilotage", description: "Vue d’ensemble, réseau et journal.", icon: "home" },
  community: { label: "Communauté", description: "Abonnés, appareils, ventes et équipe de la communauté active.", icon: "users" },
  money: { label: "Argent", description: "Commissions et versements.", icon: "wallet" },
  platform: { label: "Plateforme", description: "Communautés et comptes d'administration.", icon: "building" },
};

function sectionOf(item: NavItem, communityId: string | null): SectionKey {
  if (item.href === "/" || item.href === "/network" || item.href.endsWith("/audit")) return "pilot";
  if (item.href === "/payouts" || item.href.endsWith("/commissions")) return "money";
  if (item.href === "/communities" || item.href === "/admins") return "platform";
  if (communityId && item.href.startsWith(`/${communityId}/`)) return "community";
  return "pilot";
}

/**
 * Mêmes entrées que `buildNav`, rangées par section (rail desktop) : deux niveaux
 * au plus (section → écran), HIG sidebars. Les sections vides n'apparaissent pas.
 */
export function buildSections(nav: NavModel, communityId: string | null): NavSection[] {
  const order: SectionKey[] = ["pilot", "community", "money", "platform"];
  const items = [...nav.primary, ...nav.more];
  return order
    .map((key) => ({ key, ...SECTION_META[key], items: items.filter((i) => sectionOf(i, communityId) === key) }))
    .filter((s) => s.items.length > 0);
}

/** Section et écran actifs d'après l'URL (le plus long préfixe gagne). */
export function resolveSection(sections: readonly NavSection[], pathname: string): { section: NavSection | null; item: NavItem | null } {
  let best: { section: NavSection; item: NavItem } | null = null;
  for (const section of sections) {
    for (const item of section.items) {
      if (isActivePath(pathname, item.href) && (!best || item.href.length > best.item.href.length)) best = { section, item };
    }
  }
  return best ?? { section: sections[0] ?? null, item: null };
}
