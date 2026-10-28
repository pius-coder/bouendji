"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/common/icon";
import { RoleGuideSheet, type GuideRoleKey } from "@/components/guide/role-guide";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { platformRolesOf, ROLE_LABEL, roleIn } from "@/lib/roles";
import { cn } from "@/lib/utils";
import type { AdminMe } from "@/server/services/admin-auth/admin-auth.schema";
import { BottomBar } from "./bottom-bar";
import { triggerCommandPalette } from "./command-palette";
import { CommunitySwitcher, type CommunityOption } from "./community-switcher";
import { NavGlyph } from "./nav-icon";
import { allSections, buildNav, resolveSection, type NavSection } from "./nav-model";
import { useActiveCommunityId } from "./use-active-community";
import { UserMenu } from "./user-menu";

interface ShellNavProps {
  me: AdminMe;
  communities: readonly CommunityOption[];
}

function resolveGuideRole(me: AdminMe, activeId: string | null): GuideRoleKey {
  const p = platformRolesOf(me);
  if (p.includes("owner")) return "owner";
  if (p.includes("reseau")) return "reseau";
  const local = roleIn(me, activeId);
  if (local === "support") return "support";
  if (local === "finance") return "finance";
  return "community_admin";
}

function useShellNav({ me, communities }: ShellNavProps) {
  const pathname = usePathname();
  const activeId = useActiveCommunityId(communities.map((c) => c.id));
  const activeCommunity = communities.find((c) => c.id === activeId) ?? communities[0] ?? null;
  const nav = buildNav(me, activeId);
  const sections = allSections(nav);
  const { section, item } = resolveSection(sections, pathname);
  const role = roleIn(me, activeId);
  const guideRole = resolveGuideRole(me, activeId);
  return { pathname, activeId, activeCommunity, nav, sections, section, item, role, guideRole };
}

/**
 * Barre latérale unique (Refonte v2, ≥ 1024 px) :
 * - Une seule entrée par sujet (Accueil, Abonnés, Offres, Argent, Communauté ;
 *   groupe Plateforme & Réseau pour l'owner / membre Réseau).
 * - Les sous-vues vivent dans les onglets horizontaux (`PageTabs`) de chaque page sujet,
 *   jamais dans un second sous-menu latéral.
 */
export function ShellSidebar(props: ShellNavProps) {
  const { pathname, activeId, sections, section, role } = useShellNav(props);
  const communitySections = sections.filter(
    (s) => s.key === "accueil" || s.key === "abonnes" || s.key === "offres" || s.key === "argent" || s.key === "communaute",
  );
  const platformSections = sections.filter((s) => s.key === "plateforme" || s.key === "reseau");
  const isOnboarding = pathname.startsWith("/onboarding");

  return (
    <aside
      aria-label="Navigation principale"
      className="hidden h-full w-64 shrink-0 flex-col justify-between gap-4 border-e border-separator/60 px-3.5 py-4 lg:flex"
    >
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
        {/* Identité Bouendji */}
        <div className="flex items-center justify-between gap-2 px-1">
          <Link
            href="/"
            className="flex items-center gap-2.5 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground shadow-xs">
              <NavGlyph name="shield" className="size-5" active />
            </span>
            <div className="min-w-0">
              <p className="truncate text-subhead font-bold tracking-tight text-foreground">
                Bouendji
              </p>
              <p className="truncate text-caption text-muted-foreground">
                {role ? ROLE_LABEL[role] : "Console Admin"}
              </p>
            </div>
          </Link>
        </div>

        {/* Sélecteur de communauté */}
        {props.communities.length > 0 ? (
          <CommunitySwitcher communities={props.communities} activeId={activeId} role={role} />
        ) : null}

        {/* Groupe Sujets Communauté */}
        {communitySections.length > 0 ? (
          <nav aria-label="Sujets de la communauté" className="flex flex-col gap-1">
            <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Espace communauté
            </p>
            {communitySections.map((s) => (
              <SidebarSubjectLink
                key={s.key}
                section={s}
                active={!isOnboarding && s.key === section?.key}
              />
            ))}
          </nav>
        ) : null}

        {/* Groupe Plateforme & Réseau */}
        {platformSections.length > 0 ? (
          <nav aria-label="Plateforme et exploitation" className="flex flex-col gap-1">
            <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Plateforme & Réseau
            </p>
            {platformSections.map((s) => (
              <SidebarSubjectLink
                key={s.key}
                section={s}
                active={!isOnboarding && s.key === section?.key}
              />
            ))}
          </nav>
        ) : null}

        {/* Accès direct à l'assistant de configuration 6 étapes */}
        <div className="mt-auto pt-2">
          <Link
            href="/onboarding"
            aria-current={isOnboarding ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-xl border px-3 py-2.5 text-subhead transition-colors",
              isOnboarding
                ? "border-foreground bg-foreground text-background font-semibold"
                : "border-separator bg-surface/70 text-foreground hover:bg-group-strong",
            )}
          >
            <Icon name="tag" className="size-4 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-footnote font-semibold">Assistant 6 étapes</p>
              <p className={cn("truncate text-[11px]", isOnboarding ? "text-background/80" : "text-muted-foreground")}>
                Marque, thème, forfaits & APK
              </p>
            </div>
          </Link>
        </div>
      </div>

      {/* Compte en bas */}
      <div className="border-t border-separator/60 pt-3">
        <div className="flex items-center justify-between gap-2 px-1">
          <UserMenu name={props.me.name} email={props.me.email} side="right" />
          <Link
            href="/compte"
            className="min-w-0 flex-1 truncate text-start text-footnote font-medium text-muted-foreground hover:text-foreground"
          >
            <p className="truncate font-semibold text-foreground">{props.me.name || "Mon compte"}</p>
            <p className="truncate text-caption text-muted-foreground">Profil, sécurité & sessions</p>
          </Link>
        </div>
      </div>
    </aside>
  );
}

function SidebarSubjectLink({ section, active }: { section: NavSection; active: boolean }) {
  return (
    <Link
      href={section.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-10 items-center gap-3 rounded-xl px-3 text-subhead outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
        active
          ? "bg-group-strong font-semibold text-foreground"
          : "text-sidebar-foreground hover:bg-group-strong/60 hover:text-foreground",
      )}
    >
      <NavGlyph
        name={section.icon}
        active={active}
        className={cn("size-5 shrink-0", active ? "text-accent-text" : "text-muted-foreground")}
      />
      <span className="truncate">{section.label}</span>
    </Link>
  );
}

/** Compatibilité d'export si référencé ailleurs. */
export const ShellRail = ShellSidebar;
export function ShellSubmenu(_props: ShellNavProps) {
  return null;
}
export function ShellSectionChips(_props: ShellNavProps) {
  return null;
}

/**
 * En-tête supérieur (Refonte v2, ≥ 1024 px) :
 * Fil d'Ariane (`Breadcrumb`) + Barre de recherche globale (`Ctrl K`) + Guide par rôle (`RoleGuideSheet`).
 */
export function ShellSectionBand(props: ShellNavProps) {
  const { pathname, section, activeId, activeCommunity, guideRole } = useShellNav(props);
  const isOnboarding = pathname.startsWith("/onboarding");
  const isAccount = pathname.startsWith("/compte");

  const currentLabel = isOnboarding
    ? "Assistant de configuration"
    : isAccount
      ? "Mon compte"
      : (section?.label ?? "Accueil");

  return (
    <div className="hidden h-13 shrink-0 items-center justify-between gap-4 px-2 pe-4 lg:flex">
      <div className="flex min-w-0 items-center gap-3">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="/">Bouendji</BreadcrumbLink>
            </BreadcrumbItem>
            {activeCommunity ? (
              <>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <span className="text-footnote font-medium text-muted-foreground">
                    {activeCommunity.name}
                  </span>
                </BreadcrumbItem>
              </>
            ) : null}
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{currentLabel}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </div>

      <div className="flex shrink-0 items-center gap-2.5">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={triggerCommandPalette}
          className="h-9 min-w-64 justify-between gap-3 bg-surface text-muted-foreground hover:text-foreground"
        >
          <span className="flex items-center gap-2 truncate">
            <Icon name="search" className="size-4 shrink-0" />
            <span className="truncate">Rechercher abonné, appareil, commande…</span>
          </span>
          <kbd className="rounded border border-separator bg-muted px-1.5 py-0.5 font-mono text-[10px]">
            Ctrl K
          </kbd>
        </Button>
        <RoleGuideSheet defaultRole={guideRole} communityId={activeId} />
      </div>
    </div>
  );
}

/** Barre d’onglets basse (< 1024 px). */
export function ShellBottomBar(props: ShellNavProps) {
  const { nav } = useShellNav(props);
  return <BottomBar nav={nav} />;
}

/** Sélecteur compact de la barre du haut mobile. */
export function MobileCommunitySwitcher(props: ShellNavProps) {
  const { activeId, role } = useShellNav(props);
  if (props.communities.length === 0) return null;
  return <CommunitySwitcher communities={props.communities} activeId={activeId} role={role} compact />;
}
