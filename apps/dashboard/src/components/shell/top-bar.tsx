"use client";

import type { ReactNode } from "react";
import { Icon } from "@/components/common/icon";
import { useCollapsedTitle } from "@/components/common/page-chrome";
import { RoleGuideSheet } from "@/components/guide/role-guide";
import { triggerCommandPalette } from "@/components/shell/command-palette";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Barre du haut (chrome, verre), collée en haut de la zone de contenu (< 1024 px).
 * Inclut le sélecteur de communauté, le titre replié, la recherche rapide, le guide et le menu compte.
 */
export function TopBar({ leading, trailing }: { leading?: ReactNode; trailing?: ReactNode }) {
  const title = useCollapsedTitle();
  return (
    <div
      className={cn(
        "z-20 grid shrink-0 min-h-[calc(var(--topbar-h)+env(safe-area-inset-top))] grid-cols-[1fr_auto_1fr] items-center gap-2 px-2 pt-[env(safe-area-inset-top)] md:px-4 lg:hidden",
        "bg-frame transition-shadow duration-150",
        "border-b", title ? "border-separator" : "border-transparent",
      )}
    >
      <div className="flex min-w-0 items-center gap-1">
        <div className="min-w-0 lg:hidden">{leading}</div>
      </div>
      <p
        aria-hidden={!title}
        className={cn(
          "max-w-[42vw] truncate text-headline text-foreground transition-opacity duration-150",
          title ? "opacity-100" : "opacity-0",
        )}
      >
        {title ?? ""}
      </p>
      <div className="flex items-center justify-end gap-1 lg:hidden">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Rechercher"
          onClick={triggerCommandPalette}
        >
          <Icon name="search" className="size-4" />
        </Button>
        <RoleGuideSheet />
        {trailing}
      </div>
    </div>
  );
}
