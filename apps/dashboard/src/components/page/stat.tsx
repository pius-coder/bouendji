import type { ReactNode } from "react";
import { Icon, type IconName } from "@/components/common/icon";
import { cn } from "@/lib/utils";
import type { Tone } from "./icon-tile";

/** Chariow : carte grise #f5f6f6, sans ombre ; variantes très pâles (en attente, payés). */
const CARD: Record<"plain" | Tone, string> = {
  plain: "bg-card",
  accent: "bg-accent-soft",
  success: "bg-success-soft",
  warning: "bg-warning-soft",
  danger: "bg-danger-soft",
  info: "bg-info-soft",
  neutral: "bg-card",
};

/** Grille de cartes de chiffres. */
export function StatGrid({ children, columns = 4 }: { children: ReactNode; columns?: 2 | 3 | 4 }) {
  return (
    <div className={cn("grid grid-cols-1 gap-3 sm:grid-cols-2 md:gap-4", columns === 3 && "lg:grid-cols-3", columns === 4 && "lg:grid-cols-4")}>
      {children}
    </div>
  );
}

/**
 * Carte de chiffre (Chariow : valeur grande et serrée, libellé dessous). Libellé,
 * icône et cadre sont STATIQUES ; seule la valeur (`children`) arrive dans un
 * Suspense, par un composant serveur dédié (D104).
 */
export function StatCard({
  label,
  icon,
  tone = "plain",
  hint,
  children,
}: {
  label: string;
  icon?: IconName;
  tone?: "plain" | Tone;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={cn("group relative flex min-h-[168px] overflow-hidden rounded-[1.25rem] p-5 shadow-card transition-[box-shadow,translate] duration-150 hover:-translate-y-0.5 hover:shadow-card-hover md:p-6", CARD[tone])}>
      <div className="flex w-full flex-col justify-between gap-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-footnote font-semibold uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
          {icon ? <span className="grid size-9 place-items-center rounded-xl bg-accent-soft text-accent-text"><Icon name={icon} className="size-[1.125rem]" /></span> : null}
        </div>
        <div className="flex flex-col gap-1">
          <div className="text-[2rem] leading-9 font-bold tracking-[-0.035em] text-foreground tabular-nums">{children}</div>
          {hint ? <div className="text-caption-1 text-muted-foreground">{hint}</div> : null}
        </div>
      </div>
    </div>
  );
}

/** Squelette de valeur : même hauteur que le chiffre, rien d'autre ne bouge. */
export function StatValueSkeleton() {
  return <span aria-hidden className="block h-8 w-24 animate-pulse rounded-lg bg-group-strong" />;
}
