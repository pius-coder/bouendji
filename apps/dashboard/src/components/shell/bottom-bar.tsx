"use client";

import { Icon } from "@/components/common/icon";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { AppSheet } from "@/components/common/app-sheet";
import { ListRow } from "@/components/common/list-row";
import { cn } from "@/lib/utils";
import { NavGlyph } from "./nav-icon";
import { isActivePath, type NavItem, type NavModel } from "./nav-model";

const MORE_LABEL = "Plus";

/**
 * Barre d’onglets basse (< 1024 px), HIG tab bars : 5 entrées au plus (« Plus » compris),
 * icône + libellé d'un mot toujours visibles, actif = couleur d'accent + graisse,
 * jamais désactivée ni cachée. Verre (chrome), zone sûre iOS, cibles ≥ 44 px.
 * « Plus » ouvre une feuille avec les autres sections en liste groupée.
 */
export function BottomBar({ nav }: { nav: NavModel }) {
  const pathname = usePathname();
  // La feuille « Plus » se ferme d’elle-même quand la route change (ouverte = pour CETTE route).
  const [openedOn, setOpenedOn] = useState<string | null>(null);
  const open = openedOn === pathname;
  const setOpen = (next: boolean) => setOpenedOn(next ? pathname : null);
  const moreActive = nav.more.some((item) => isActivePath(pathname, item.href));
  const cell =
    "flex min-h-11 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl text-caption-2 font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.96] transition-[scale,color] duration-150";

  return (
    <>
      <nav
        aria-label="Navigation principale"
        className="fixed inset-x-0 bottom-0 z-30 flex items-stretch gap-1 rounded-t-2xl border-t border-border bg-surface px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] lg:hidden"
        style={{ minHeight: "var(--bottombar-h)" }}
      >
        {nav.primary.map((item) => (
          <TabLink key={item.href} item={item} active={isActivePath(pathname, item.href)} className={cell} />
        ))}
        {nav.more.length > 0 ? (
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-haspopup="dialog"
            aria-current={moreActive ? "page" : undefined}
            className={cn(cell, moreActive ? "text-accent-text font-semibold" : "text-muted-foreground")}
          >
            <Icon name="more" className="size-6" filled={moreActive} />
            {MORE_LABEL}
          </button>
        ) : null}
      </nav>
      <AppSheet open={open} onOpenChange={setOpen} title={MORE_LABEL} cancelLabel="Fermer">
        <div className="overflow-hidden rounded-section bg-card">
          {nav.more.map((item) => (
            <ListRow
              key={item.href}
              href={item.href}
              title={item.label}
              selected={isActivePath(pathname, item.href)}
              leading={<NavGlyph name={item.icon} className="text-accent-text" />}
            />
          ))}
        </div>
      </AppSheet>
    </>
  );
}

function TabLink({ item, active, className }: { item: NavItem; active: boolean; className: string }) {
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(className, active ? "font-semibold text-accent-text" : "text-muted-foreground")}
    >
      <NavGlyph name={item.icon} className="size-6" active={active} />
      {item.label}
    </Link>
  );
}

