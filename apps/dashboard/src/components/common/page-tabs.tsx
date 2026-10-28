"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

export interface PageTabItem {
  id: string;
  label: string;
  count?: number;
  badge?: string;
}

/**
 * Barre d'onglets horizontaux sous l'en-tête d'une page sujet (`?tab=...`).
 * Conserve le périmètre et permet le partage d'URL direct vers un onglet.
 */
export function PageTabs({
  tabs,
  activeTab,
  paramName = "tab",
  className,
}: {
  tabs: readonly PageTabItem[];
  activeTab: string;
  paramName?: string;
  className?: string;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const buildHref = (tabId: string) => {
    const next = new URLSearchParams(searchParams.toString());
    if (tabId === tabs[0]?.id) {
      next.delete(paramName);
    } else {
      next.set(paramName, tabId);
    }
    const qs = next.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  };

  return (
    <nav
      aria-label="Sections de la page"
      className={cn(
        "flex items-center gap-1 overflow-x-auto border-b border-separator pb-px",
        className,
      )}
    >
      {tabs.map((tab) => {
        const active = tab.id === activeTab;
        return (
          <Link
            key={tab.id}
            href={buildHref(tab.id)}
            scroll={false}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative inline-flex min-h-10 shrink-0 items-center gap-2 px-3.5 py-2 text-subhead font-medium transition-colors",
              active
                ? "text-foreground after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <span>{tab.label}</span>
            {tab.count !== undefined ? (
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.2 text-caption tabular-nums",
                  active ? "bg-foreground/10 text-foreground" : "bg-muted text-muted-foreground",
                )}
              >
                {tab.count}
              </span>
            ) : null}
            {tab.badge ? (
              <span className="rounded-full bg-warning/15 px-1.5 py-0.2 text-caption font-medium text-warning">
                {tab.badge}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
