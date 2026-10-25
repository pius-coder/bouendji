import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Groupe gris contenant des cartes blanches (Chariow, Analytiques). Le titre est
 * STATIQUE ; seul le contenu dynamique passe dans un Suspense, à l'intérieur.
 */
export function Section({
  title,
  description,
  actions,
  children,
  className,
}: {
  title?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("flex flex-col gap-4 rounded-2xl bg-group p-4", className)}>
      {title || actions ? (
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div className="min-w-0">
            {title ? <h2 className="text-title-3 font-medium tracking-tight text-foreground">{title}</h2> : null}
            {description ? <p className="text-footnote text-muted-foreground">{description}</p> : null}
          </div>
          {actions}
        </div>
      ) : null}
      {children}
    </section>
  );
}

/** Carte blanche posée dans une section ou directement dans la page. */
export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("rounded-xl border border-border bg-card p-6", className)}>{children}</div>;
}
