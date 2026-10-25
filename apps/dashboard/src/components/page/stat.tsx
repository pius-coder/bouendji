import type { ReactNode } from "react";
import { Icon, type IconName } from "@/components/common/icon";
import { cn } from "@/lib/utils";
import type { Tone } from "./icon-tile";

/** Chariow : carte grise #f5f6f6, sans ombre ; variantes très pâles (en attente, payés). */
const CARD: Record<"plain" | Tone, string> = {
  plain: "bg-group",
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
    <div className={cn("grid grid-cols-1 gap-2 sm:grid-cols-2 md:gap-3", columns === 3 && "lg:grid-cols-3", columns === 4 && "lg:grid-cols-4")}>
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
    <div className={cn("flex min-h-[158px] flex-col justify-between gap-3 rounded-2xl p-6", CARD[tone])}>
      {icon ? <Icon name={icon} className="size-6 text-foreground" /> : null}
      <div className="flex flex-col gap-1">
        <div className="text-[1.875rem] leading-9 font-bold tracking-[-0.02em] text-foreground tabular-nums">{children}</div>
        <p className="text-subhead text-sidebar-foreground">{label}</p>
        {hint ? <div className="text-caption-1 text-muted-foreground">{hint}</div> : null}
      </div>
    </div>
  );
}

/** Squelette de valeur : même hauteur que le chiffre, rien d'autre ne bouge. */
export function StatValueSkeleton() {
  return <span aria-hidden className="block h-8 w-24 animate-pulse rounded-lg bg-group-strong" />;
}
