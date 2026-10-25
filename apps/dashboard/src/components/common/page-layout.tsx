import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Zone de contenu d'une page : largeur de lecture, marges 16 px mobile / 24–32 px
 * desktop, espace pour la barre d'onglets basse. Le shell fournit `<main>`.
 */
export function PageBody({ children, className, wide = false }: { children: ReactNode; className?: string; wide?: boolean }) {
  return (
    <div
      className={cn(
        "mx-auto flex w-full min-w-0 flex-col gap-8 px-4 pb-[calc(var(--bottombar-h)+env(safe-area-inset-bottom)+2rem)] md:px-6 lg:px-8 lg:pb-12",
        wide ? "max-w-[96rem]" : "max-w-6xl",
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * Vue scindée : contenu + panneau de détail (≥ 1280 px, colonne droite collante).
 * Sous 1280 px le panneau est une feuille plein écran (voir `DetailPanel`) et la
 * grille reste à une colonne.
 */
export function SplitView({ children, panel, className }: { children: ReactNode; panel?: ReactNode; className?: string }) {
  return (
    // La 2e colonne n’existe que si le panneau rend un <aside> (desktop) : décision CSS,
    // la page n’a pas besoin de savoir si un élément est ouvert (il est lu dans Suspense).
    <div className={cn("grid min-w-0 items-start gap-6 xl:has-[>aside]:grid-cols-[minmax(0,1fr)_minmax(22rem,26rem)]", className)}>
      <div className="flex min-w-0 flex-col gap-8">{children}</div>
      {panel}
    </div>
  );
}
