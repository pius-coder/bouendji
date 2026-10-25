"use client";

import type { ReactNode } from "react";
import { useCollapsedTitle } from "@/components/common/page-chrome";
import { cn } from "@/lib/utils";

/**
 * Barre du haut (chrome, verre), collée en haut de la zone de contenu. Début :
 * sélecteur de communauté (< 1024 px, `leading`). Centre : titre compact quand le grand
 * titre de la page est sorti de l'écran. Fin : compte (< 1024 px ; au-delà il est dans le rail). Pas de fond plein : un filet
 * n'apparaît que lorsque le titre est replié (effet de bord de défilement).
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
          "max-w-[50vw] truncate text-headline text-foreground transition-opacity duration-150",
          title ? "opacity-100" : "opacity-0",
        )}
      >
        {title ?? ""}
      </p>
      <div className="flex items-center justify-end gap-1 lg:hidden">{trailing}</div>
    </div>
  );
}
