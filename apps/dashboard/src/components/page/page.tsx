import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Contenu d'une page dans la feuille blanche du shell : marges Chariow, largeur
 * lisible centrée. Composant serveur, statique.
 */
export function PageContent({ children, wide = false, className }: { children: ReactNode; wide?: boolean; className?: string }) {
  return (
    <div className={cn("mx-auto flex w-full flex-col gap-7 px-4 pt-6 pb-12 md:px-8 md:pt-9 xl:px-10", wide ? "max-w-[1440px]" : "max-w-[1180px]", className)}>
      {children}
    </div>
  );
}

/**
 * Grand titre de page (iOS large title) + phrase + actions. STATIQUE (D104) :
 * jamais dans un Suspense ; une action qui dépend des données vient en `actions`
 * avec SA propre frontière.
 */
export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <header className="relative flex flex-wrap items-end justify-between gap-x-6 gap-y-4 border-b border-separator pb-6">
      <div className="min-w-0">
        <p className="mb-1 text-[0.6875rem] font-bold uppercase tracking-[0.16em] text-accent-text">Console Bouendji</p>
        <h1 className="text-title-1 font-semibold tracking-[-0.025em] text-foreground md:text-large-title">{title}</h1>
        {description ? <p className="mt-1.5 max-w-2xl text-subhead leading-relaxed text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2 pb-0.5">{actions}</div> : null}
    </header>
  );
}

/**
 * Barre d'outils collante (Chariow : sticky top-0, fond blanc, z-20, py-4) : reste
 * visible quand la surface défile. Sa hauteur est connue de la page, qui la passe
 * au tableau (`stickyTop`) pour coller l'en-tête juste dessous.
 */
export function Toolbar({ children }: { children: ReactNode }) {
  return <div className="sticky top-0 z-20 -mx-2 flex flex-col gap-3 rounded-2xl bg-glass px-2 py-3 backdrop-blur-xl md:-mx-3 md:px-3">{children}</div>;
}

/** Hauteurs de barre d'outils (px), pour l'en-tête collant du tableau. */
export const TOOLBAR_HEIGHT = { search: 72, chips: 60, searchAndChips: 112 } as const;
