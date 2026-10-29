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
    <section className={cn("flex flex-col gap-5 rounded-[1.25rem] bg-card p-5 shadow-card md:p-6", className)}>
      {title || actions ? (
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-separator pb-4">
          <div className="min-w-0">
            {title ? <h2 className="text-title-3 font-semibold tracking-[-0.015em] text-foreground">{title}</h2> : null}
            {description ? <p className="mt-1 max-w-3xl text-footnote leading-relaxed text-muted-foreground">{description}</p> : null}
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
  return <div className={cn("rounded-2xl bg-card p-6 shadow-card", className)}>{children}</div>;
}
