import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Contenu d'une page dans la feuille blanche du shell : marges Chariow, largeur
 * lisible centrée. Composant serveur, statique.
 */
export function PageContent({ children, wide = false, className }: { children: ReactNode; wide?: boolean; className?: string }) {
  return (
    <div className={cn("mx-auto flex w-full flex-col gap-6 px-4 pt-5 pb-10 md:px-8 md:pt-8", wide ? "max-w-[1280px]" : "max-w-[1100px]", className)}>
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
    <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
      <div className="min-w-0">
        <h1 className="text-title-1 font-bold tracking-tight text-foreground md:text-large-title">{title}</h1>
        {description ? <p className="mt-1 text-subhead text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

/**
 * Barre d'outils collante (Chariow : sticky top-0, fond blanc, z-20, py-4) : reste
 * visible quand la surface défile. Sa hauteur est connue de la page, qui la passe
 * au tableau (`stickyTop`) pour coller l'en-tête juste dessous.
 */
export function Toolbar({ children }: { children: ReactNode }) {
  return <div className="sticky top-0 z-20 -mx-4 -my-2 flex flex-col gap-3 bg-surface px-4 py-4 md:-mx-8 md:px-8">{children}</div>;
}

/** Hauteurs de barre d'outils (px), pour l'en-tête collant du tableau. */
export const TOOLBAR_HEIGHT = { search: 72, chips: 60, searchAndChips: 112 } as const;
