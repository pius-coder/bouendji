"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from "@/components/ui/drawer";
import { ListRow } from "@/components/common/list-row";
import { cn } from "@/lib/utils";
import { NavGlyph } from "./nav-icon";
import { isActivePath, MORE_LABEL, type NavModel, type NavSection } from "./nav-model";

/** Une section est active quand l'URL tombe dans l'un de ses écrans. */
function sectionActive(section: NavSection, pathname: string): boolean {
  return section.items.some((item) => isActivePath(pathname, item.href));
}

/**
 * Barre d’onglets basse (< 1024 px), HIG tab bars : 5 entrées au plus. Accueil, Abonnés,
 * Offres, Argent, puis « Plus » (toujours présent) qui ouvre un tiroir du bas avec
 * Communauté, Plateforme, Réseau et Mon compte. Actif = couleur d’accent + graisse.
 */
export function BottomBar({ nav }: { nav: NavModel }) {
  const pathname = usePathname();
  // Le tiroir « Plus » se ferme de lui-même quand la route change (ouvert = pour CETTE route).
  const [openedOn, setOpenedOn] = useState<string | null>(null);
  const open = openedOn === pathname;
  const setOpen = (next: boolean) => setOpenedOn(next ? pathname : null);
  const moreActive = nav.more.some((s) => sectionActive(s, pathname)) || isActivePath(pathname, nav.account.href);
  const cell =
    "flex min-h-11 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl text-caption-2 font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.96] transition-[scale,color] duration-150";

  return (
    <>
      <nav
        aria-label="Navigation principale"
        className="fixed inset-x-0 bottom-0 z-30 flex items-stretch gap-1 rounded-t-2xl border-t border-border bg-surface px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] lg:hidden"
        style={{ minHeight: "var(--bottombar-h)" }}
      >
        {nav.bar.map((section) => {
          const active = sectionActive(section, pathname);
          return (
            <Link
              key={section.key}
              href={section.href}
              aria-current={active ? "page" : undefined}
              className={cn(cell, active ? "font-semibold text-accent-text" : "text-muted-foreground")}
            >
              <NavGlyph name={section.icon} className="size-6" active={active} />
              {section.label}
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-current={moreActive ? "page" : undefined}
          className={cn(cell, moreActive ? "font-semibold text-accent-text" : "text-muted-foreground")}
        >
          <NavGlyph name="more" className="size-6" active={moreActive} />
          {MORE_LABEL}
        </button>
      </nav>
      <Drawer open={open} onOpenChange={setOpen} repositionInputs={false}>
        <DrawerContent className="max-h-[92dvh] bg-background data-[vaul-drawer-direction=bottom]:max-h-[92dvh] data-[vaul-drawer-direction=bottom]:rounded-t-[20px]">
          <DrawerTitle className="px-4 pt-4 pb-2 text-headline">{MORE_LABEL}</DrawerTitle>
          <DrawerDescription className="sr-only">Autres sections et compte</DrawerDescription>
          <div className="flex flex-col gap-4 overflow-y-auto overscroll-contain px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {nav.more.map((section) => (
              <div key={section.key} className="flex flex-col gap-1.5">
                <p className="px-1 text-footnote font-semibold text-muted-foreground">{section.label}</p>
                <div className="overflow-hidden rounded-section bg-card">
                  {section.items.map((item) => (
                    <ListRow
                      key={item.href}
                      href={item.href}
                      title={item.label}
                      selected={isActivePath(pathname, item.href)}
                      leading={<NavGlyph name={item.icon} className="text-accent-text" />}
                    />
                  ))}
                </div>
              </div>
            ))}
            <div className="overflow-hidden rounded-section bg-card">
              <ListRow
                href={nav.account.href}
                title={nav.account.label}
                selected={isActivePath(pathname, nav.account.href)}
                leading={<NavGlyph name={nav.account.icon} className="text-accent-text" />}
              />
            </div>
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}
