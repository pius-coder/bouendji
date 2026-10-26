"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { roleIn } from "@/lib/roles";
import { cn } from "@/lib/utils";
import type { AdminMe } from "@/server/services/admin-auth/admin-auth.schema";
import { BottomBar } from "./bottom-bar";
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

function useShellNav({ me, communities }: ShellNavProps) {
  const pathname = usePathname();
  const activeId = useActiveCommunityId(communities.map((c) => c.id));
  const nav = buildNav(me, activeId);
  const sections = allSections(nav);
  const { section, item } = resolveSection(sections, pathname);
  return { pathname, activeId, nav, sections, section, item, role: roleIn(me, activeId) };
}

/** Rail de sections (≥ 1024 px) : marque, une entrée par section (icône + libellé), compte en bas. */
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
                  active ? "bg-group-strong text-foreground" : "text-sidebar-foreground hover:bg-group-strong/70 hover:text-foreground",
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

/** Bande de section (≥ 1024 px), sur le fond gris au-dessus de la feuille : nom et rôle de la section. */
export function ShellSectionBand(props: ShellNavProps) {
  const { section, item } = useShellNav(props);
  if (!section) return null;
  return (
    <div className="hidden h-12 shrink-0 items-center gap-3 pe-4 lg:flex">
      <span className="grid size-8 place-items-center rounded-full bg-group-strong text-accent-text">
        <NavGlyph name={item?.icon ?? section.icon} className="size-[1.125rem]" active />
      </span>
      <div className="min-w-0">
        <p className="truncate text-subhead font-semibold text-foreground">{item?.label ?? section.label}</p>
        <p className="truncate text-caption-1 text-muted-foreground">{section.description}</p>
      </div>
    </div>
  );
}

/** Puces de section (< 1024 px) : les écrans de la section active, défilement horizontal. */
export function ShellSectionChips(props: ShellNavProps) {
  const { pathname, section } = useShellNav(props);
  if (!section || section.items.length < 2) return null;
  return (
    <nav aria-label={section.label} className="-mx-1 flex gap-2 overflow-x-auto px-4 pt-1 pb-3 [scrollbar-width:none] lg:hidden">
      {section.items.map((item) => {
        const active = isActivePath(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-footnote font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
              active ? "bg-group-strong text-foreground" : "bg-surface text-muted-foreground",
            )}
          >
            <span aria-hidden className={cn("size-1.5 rounded-full", active ? "bg-accent-from" : "bg-neutral-state")} />
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
