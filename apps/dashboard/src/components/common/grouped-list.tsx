import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Listes groupées « inset grouped » (règles §4) : elles remplacent les cartes.
 * `GroupedList` empile des sections à 32 px ; `GroupedSection` = en-tête (footnote),
 * corps sur fond cellule arrondi 16 px, pied (footnote). Ni bordure ni ombre :
 * la séparation vient du ton (fond groupé / cellule) et de l'espace.
 */
export function GroupedList({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex flex-col gap-8", className)}>{children}</div>;
}

export function GroupedSection({
  title,
  titleId,
  action,
  footer,
  children,
  className,
  bodyClassName,
  inset = true,
}: {
  /** En-tête de section, casse de phrase. Devient le nom accessible de la section. */
  title?: ReactNode;
  titleId?: string;
  /** Action d'en-tête (lien « Tout voir », bouton plain), alignée à la fin. */
  action?: ReactNode;
  /** Explication sous la section (conséquence d'un réglage, portée d'un calcul). */
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  /** `false` : corps sans fond (bande de chiffres, segmented control). */
  inset?: boolean;
}) {
  return (
    <section aria-labelledby={title ? titleId : undefined} className={cn("flex min-w-0 flex-col gap-2", className)}>
      {title || action ? <SectionHeader id={titleId} action={action}>{title}</SectionHeader> : null}
      <div className={cn(inset && "overflow-hidden rounded-section bg-card", bodyClassName)}>{children}</div>
      {footer ? <SectionFooter>{footer}</SectionFooter> : null}
    </section>
  );
}

export function SectionHeader({ id, action, children }: { id?: string; action?: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex min-h-6 items-end justify-between gap-3 px-4">
      <h2 id={id} className="text-footnote font-medium text-muted-foreground">
        {children}
      </h2>
      {action ? <div className="flex shrink-0 items-center gap-1">{action}</div> : null}
    </div>
  );
}

export function SectionFooter({ children }: { children: ReactNode }) {
  return <p className="px-4 text-footnote text-muted-foreground">{children}</p>;
}
