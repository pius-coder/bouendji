"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/common/icon";
import { RoleGuideSheet, type GuideRoleKey } from "@/components/guide/role-guide";
import { Button } from "@/components/ui/button";
import { platformRolesOf, roleIn } from "@/lib/roles";
import { cn } from "@/lib/utils";
import type { AdminMe } from "@/server/services/admin-auth/admin-auth.schema";
import { BottomBar } from "./bottom-bar";
import { triggerCommandPalette } from "./command-palette";
import { CommunitySwitcher, type CommunityOption } from "./community-switcher";
import { NavGlyph } from "./nav-icon";
import { allSections, buildNav, isActivePath, resolveSection } from "./nav-model";
import { useActiveCommunityId } from "./use-active-community";
import { UserMenu } from "./user-menu";

/**
 * Navigation du shell (D106) : architecture conservée — rail de sections,
 * sous-menu, bande de section ; mobile : puces de section, barre basse.
 * Rendu Chariow (D108) : posé sur le fond gris, sans bordure ; l'actif = fond
 * gris `#e5e7e8` + icône pleine dans la couleur du thème (là où Chariow met son jaune).
 * Client uniquement pour lire l'URL (`usePathname`, `useParams`) : les données
 * arrivent en props depuis les blocs serveur de `shell-nav-section.tsx`.
 */
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
  const nav = buildNav(me, activeId);
  const sections = allSections(nav);
  const { section, item } = resolveSection(sections, pathname);
  const role = roleIn(me, activeId);
  const guideRole = resolveGuideRole(me, activeId);
  return { pathname, activeId, nav, sections, section, item, role, guideRole };
}

/** Barre latérale unique (≥ 1024 px) : logo, sélecteur de communauté, 5 sections (ou avec groupe plateforme pour l'owner), compte en bas. */
export function ShellSidebar(props: ShellNavProps) {
  const { activeId, sections, section, role } = useShellNav(props);
  const platform = platformRolesOf(props.me);
  const isOwner = platform.includes("owner");

  const communitySections = sections.filter((s) => s.key !== "plateforme" && s.key !== "reseau");
  const platformSections = sections.filter((s) => s.key === "plateforme" || s.key === "reseau");

  return (
    <aside aria-label="Navigation principale" className="m-3 me-4 hidden h-[calc(100%-1.5rem)] w-64 shrink-0 flex-col gap-5 overflow-hidden rounded-[1.5rem] bg-sidebar p-3 text-sidebar-foreground shadow-[0_20px_50px_rgba(15,23,42,0.22)] lg:flex">
      <div className="flex flex-col gap-2.5">
        <div className="flex items-center gap-3 px-2 pt-1">
          <Link
            href="/"
            aria-label="Accueil de la console"
            className="grid size-10 place-items-center rounded-xl bg-accent-gradient text-white shadow-[0_8px_24px_color-mix(in_srgb,var(--accent-from)_35%,transparent)] outline-none transition-transform duration-150 active:scale-[0.96] focus-visible:ring-2 focus-visible:ring-ring"
          >
            <NavGlyph name="shield" className="size-5" active />
          </Link>
          <div className="min-w-0 flex-1">
            <span className="block truncate text-subhead font-bold tracking-tight text-white">Bouendji</span>
            <span className="block truncate text-caption-2 text-sidebar-foreground">Espace de gestion</span>
          </div>
        </div>
        <CommunitySwitcher communities={props.communities} activeId={activeId} role={role} />
      </div>

      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto pe-1">
        <div className="flex flex-col gap-0.5">
          {communitySections.map((s) => {
            const active = s.key === section?.key;
            return (
              <Link
                key={s.key}
                href={s.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-11 items-center gap-3 rounded-xl px-3 text-callout outline-none transition-[background-color,color,box-shadow] duration-150 focus-visible:ring-2 focus-visible:ring-ring",
                  active
                    ? "bg-white/12 font-semibold text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]"
                    : "text-sidebar-foreground hover:bg-white/[0.07] hover:text-white",
                )}
              >
                <NavGlyph name={s.icon} active={active} className={cn("size-5 shrink-0", active ? "text-white" : "text-sidebar-foreground")} />
                <span className="truncate">{s.label}</span>
              </Link>
            );
          })}
        </div>

        {platformSections.length > 0 ? (
          <div className="mt-3 flex flex-col gap-0.5 border-t border-white/10 pt-3">
            {isOwner ? (
              <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-sidebar-foreground/70">
                Plateforme
              </p>
            ) : null}
            {platformSections.map((s) => {
              const active = s.key === section?.key;
              return (
                <Link
                  key={s.key}
                  href={s.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex h-11 items-center gap-3 rounded-xl px-3 text-callout outline-none transition-[background-color,color,box-shadow] duration-150 focus-visible:ring-2 focus-visible:ring-ring",
                    active
                      ? "bg-white/12 font-semibold text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]"
                      : "text-sidebar-foreground hover:bg-white/[0.07] hover:text-white",
                  )}
                >
                  <NavGlyph name={s.icon} active={active} className={cn("size-5 shrink-0", active ? "text-white" : "text-sidebar-foreground")} />
                  <span className="truncate">{s.label}</span>
                </Link>
              );
            })}
          </div>
        ) : null}
      </nav>

      <div className="border-t border-white/10 px-1 pt-2">
        <UserMenu name={props.me.name} email={props.me.email} side="right" />
      </div>
    </aside>
  );
}

/** Rail de sections (≥ 1024 px) : conservé pour compatibilité. */
export function ShellRail(props: ShellNavProps) {
  const { sections, section } = useShellNav(props);
  return (
    <aside aria-label="Sections" className="hidden h-full w-[5.25rem] shrink-0 flex-col items-center gap-2 py-3 lg:flex">
      <Link
        href="/"
        aria-label="Accueil de la console"
        className="mb-2 grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <NavGlyph name="shield" className="size-6" active />
      </Link>
      <nav className="flex flex-1 flex-col items-center gap-1">
        {sections.map((s) => {
          const active = s.key === section?.key;
          return (
            <Link
              key={s.key}
              href={s.href}
              aria-current={active ? "true" : undefined}
              className={cn(
                "group flex w-[4.5rem] flex-col items-center gap-1 rounded-2xl py-2 text-caption-2 font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                active ? "font-semibold text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <span
                className={cn(
                  "grid h-9 w-12 place-items-center rounded-xl transition-colors",
                  active ? "bg-group-strong text-accent-text" : "group-hover:bg-group-strong",
                )}
              >
                <NavGlyph name={s.icon} className="size-[1.375rem]" active={active} />
              </span>
              {s.label}
            </Link>
          );
        })}
      </nav>
      <UserMenu name={props.me.name} email={props.me.email} side="right" />
    </aside>
  );
}

/** Sous-menu (≥ 1024 px) : communauté active (carte), puis les écrans de la section. */
export function ShellSubmenu(props: ShellNavProps) {
  const { pathname, activeId, section, role } = useShellNav(props);
  return (
    <aside aria-label="Écrans de la section" className="hidden h-full w-[15.5rem] shrink-0 flex-col gap-4 overflow-y-auto py-3 pe-4 lg:flex">
      <CommunitySwitcher communities={props.communities} activeId={activeId} role={role} />
      {section ? (
        <nav className="flex flex-col gap-0.5">
          <p className="px-3 pb-1.5 text-caption-1 font-semibold text-tertiary">{section.label}</p>
          {section.items.map((item) => {
            const active = isActivePath(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-[38px] items-center gap-3 rounded-md px-3 text-callout outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                  active ? "bg-group-strong font-medium text-foreground" : "text-sidebar-foreground hover:bg-group-strong/70 hover:text-foreground",
                )}
              >
                <NavGlyph name={item.icon} active={active} className={cn("size-5", active ? "text-accent-text" : "text-muted-foreground")} />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      ) : null}
    </aside>
  );
}

/** Bande de section (≥ 1024 px), sur le fond gris au-dessus de la feuille : nom et rôle de la section + Ctrl K + Guide. */
export function ShellSectionBand(props: ShellNavProps) {
  const { section, item, activeId, guideRole } = useShellNav(props);
  if (!section) return null;
  return (
    <div className="hidden h-16 shrink-0 items-center justify-between gap-4 pe-4 lg:flex">
      <div className="flex min-w-0 items-center gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent-text shadow-card">
          <NavGlyph name={item?.icon ?? section.icon} className="size-[1.125rem]" active />
        </span>
        <div className="min-w-0">
          <p className="truncate text-callout font-semibold text-foreground">{item?.label ?? section.label}</p>
          <p className="truncate text-caption-1 text-muted-foreground">{section.description}</p>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={triggerCommandPalette}
          className="h-9 min-w-64 justify-between gap-3 bg-surface text-muted-foreground shadow-card hover:text-foreground"
        >
          <span className="flex items-center gap-2 truncate">
            <Icon name="search" className="size-3.5 shrink-0" />
            <span className="truncate text-footnote">Rechercher abonné, appareil, commande…</span>
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

/** Onglets de la section active (desktop et mobile) : les écrans sous le titre, défilement horizontal. */
export function ShellSectionChips(props: ShellNavProps) {
  const { pathname, section } = useShellNav(props);
  if (!section || section.items.length < 2) return null;
  return (
    <nav aria-label={section.label} className="mx-2 mb-2 flex gap-1 overflow-x-auto rounded-xl bg-group p-1 [scrollbar-width:none] lg:mx-0 lg:me-4 lg:w-fit">
      {section.items.map((item) => {
        const active = isActivePath(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex h-9 shrink-0 items-center gap-2 rounded-lg px-3 text-footnote font-medium outline-none transition-[background-color,color,box-shadow] duration-150 focus-visible:ring-2 focus-visible:ring-ring",
              active
                ? "bg-surface font-semibold text-foreground shadow-card"
                : "text-muted-foreground hover:bg-surface/60 hover:text-foreground",
            )}
          >
            <NavGlyph name={item.icon} active={active} className={cn("size-3.5 shrink-0", active ? "text-accent-text" : "text-muted-foreground")} />
            {item.label}
          </Link>
        );
      })}
    </nav>
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
