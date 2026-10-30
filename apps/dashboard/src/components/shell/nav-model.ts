import { can, platformRolesOf, type RoleSource } from "@/lib/roles";

export type NavIcon =
  | "home"
  | "users"
  | "tag"
  | "wallet"
  | "building"
  | "shield"
  | "server"
  | "smartphone"
  | "receipt"
  | "history"
  | "file-download"
  | "download"
  | "more";

export interface NavItem {
  href: string;
  label: string;
  icon: NavIcon;
}

/**
 * Sections du shell (chantier vague 1, R2). Accueil, Abonnés, Offres et Argent vivent
 * dans la barre basse ; Communauté, Plateforme et Réseau derrière « Plus ».
 */
export type SectionKey = "accueil" | "abonnes" | "offres" | "argent" | "communaute" | "plateforme" | "reseau";

export interface NavSection {
  key: SectionKey;
  label: string;
  description: string;
  icon: NavIcon;
  /** Destination de la section (premier écran accessible). */
  href: string;
  /** Écrans de la section, visibles selon le rôle et la communauté active. */
  items: NavItem[];
}

export interface NavModel {
  /** Barre basse : 4 sections au plus ; « Plus » est la 5e entrée, toujours présente. */
  bar: NavSection[];
  /** Derrière « Plus » : Communauté, Plateforme, Réseau (selon le rôle). */
  more: NavSection[];
  /** « Mon compte » : menu utilisateur et feuille « Plus ». */
  account: NavItem;
}

export const MORE_LABEL = "Plus";
export const ACCOUNT_ITEM: NavItem = { href: "/compte", label: "Mon compte", icon: "users" };

/** Toutes les sections (rail desktop), dans l'ordre d'affichage. */
export function allSections(nav: NavModel): NavSection[] {
  return [...nav.bar, ...nav.more];
}

const META: Record<SectionKey, { label: string; description: string; icon: NavIcon }> = {
  accueil: { label: "Accueil", description: "Chiffres du jour et ce qui attend une action.", icon: "home" },
  abonnes: { label: "Abonnés", description: "Abonnés, appareils, commandes et fichiers de secours.", icon: "users" },
  offres: { label: "Offres", description: "Forfaits et application de la communauté.", icon: "tag" },
  argent: { label: "Argent", description: "Commissions et versements.", icon: "wallet" },
  communaute: { label: "Communauté", description: "Équipe, journal et réglages de la communauté active.", icon: "building" },
  plateforme: { label: "Plateforme", description: "Communautés, administrateurs, builds et tarifs.", icon: "shield" },
  reseau: { label: "Réseau", description: "Créneaux de nuit, serveurs 3x-ui et historique.", icon: "server" },
};

/**
 * Navigation calculée pour la communauté ACTIVE (jamais l'union des rôles).
 * `communityId` nul : seules les sections globales restent (Accueil, Argent, Plateforme, Réseau).
 * Le rôle choisit ce qui s'affiche ; l'API refuse le reste (403).
 */
export function buildNav(me: RoleSource, communityId: string | null): NavModel {
  const scoped = (path: string) => `/${communityId}/${path}`;
  const platform = platformRolesOf(me);
  const inCommunity = communityId !== null;

  const section = (key: SectionKey, entries: readonly (NavItem | null)[]): NavSection => {
    const items = entries.filter((item): item is NavItem => item !== null);
    return { key, ...META[key], href: items[0]?.href ?? "/", items };
  };

  const accueil = section("accueil", [{ href: "/", label: "Accueil", icon: "home" }]);

  const abonnes = section(
    "abonnes",
    [
      inCommunity && can(me, "members.read", communityId) ? { href: scoped("subscribers"), label: "Abonnés", icon: "users" as const } : null,
      inCommunity && can(me, "members.read", communityId) ? { href: scoped("devices"), label: "Appareils", icon: "smartphone" as const } : null,
      inCommunity && can(me, "orders.read", communityId) ? { href: scoped("orders"), label: "Commandes", icon: "receipt" as const } : null,
      inCommunity && can(me, "devices.offline", communityId) ? { href: scoped("offline"), label: "Fichiers de secours", icon: "file-download" as const } : null,
    ],
  );

  const offres = section(
    "offres",
    [
      inCommunity && can(me, "plans.read", communityId) ? { href: scoped("plans"), label: "Forfaits", icon: "tag" as const } : null,
      inCommunity && can(me, "plans.manage", communityId) ? { href: scoped("builds"), label: "Application", icon: "download" as const } : null,
    ],
  );

  // « Versements » est une page globale (`/payouts`) : même périmètre que la page.
  const argent = section(
    "argent",
    [
      can(me, "payouts.read", null) ? { href: "/payouts", label: "Versements", icon: "wallet" as const } : null,
      inCommunity && can(me, "money.read", communityId) ? { href: scoped("commissions"), label: "Commissions", icon: "receipt" as const } : null,
      // 105 : accès accordés à la main, dus à la plateforme jusqu'au versement.
      inCommunity && can(me, "manual_grants.manage", communityId) ? { href: scoped("manual-grants"), label: "Impayés", icon: "wallet" as const } : null,
    ],
  );

  const communaute = section(
    "communaute",
    [
      inCommunity && can(me, "staff.manage", communityId) ? { href: scoped("members"), label: "Équipe & Réglages", icon: "shield" as const } : null,
      inCommunity && can(me, "audit.read", communityId) ? { href: scoped("audit"), label: "Journal", icon: "history" as const } : null,
    ],
  );

  const plateforme = section(
    "plateforme",
    platform.includes("owner")
      ? [
          { href: "/communities", label: "Communautés", icon: "building" as const },
          { href: "/admins", label: "Administrateurs", icon: "shield" as const },
          { href: "/pricing", label: "Tarifs et marges", icon: "tag" as const },
          { href: "/coupons", label: "Types de coupon", icon: "tag" as const },
          // 106 : opérateurs de paiement (Orange Money, MTN MoMo), réglage owner.
          { href: "/payments", label: "Paiements", icon: "wallet" as const },
        ]
      : [],
  );

  const reseau = section(
    "reseau",
    platform.includes("owner") || platform.includes("reseau") ? [{ href: "/network", label: "Serveurs", icon: "server" as const }] : [],
  );

  const bar = [accueil, abonnes, offres, argent].filter((s) => s.items.length > 0);
  const more = [communaute, plateforme, reseau].filter((s) => s.items.length > 0);
  return { bar, more, account: ACCOUNT_ITEM };
}

export function isActivePath(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

/** Section et écran actifs d'après l'URL (le plus long préfixe gagne). */
export function resolveSection(
  sections: readonly NavSection[],
  pathname: string,
): { section: NavSection | null; item: NavItem | null } {
  let best: { section: NavSection; item: NavItem } | null = null;
  for (const section of sections) {
    for (const item of section.items) {
      if (isActivePath(pathname, item.href) && (!best || item.href.length > best.item.href.length)) best = { section, item };
    }
  }
  if (best) return best;
  const fallback = sections.find((s) => isActivePath(pathname, s.href)) ?? null;
  return { section: fallback, item: null };
}
