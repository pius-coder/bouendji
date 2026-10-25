import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type StatTone = "default" | "success" | "warning" | "danger";

export interface StatItem {
  label: string;
  value: ReactNode;
  /** Précision sous le chiffre (portée du calcul, comparaison). */
  hint?: ReactNode;
  tone?: StatTone;
}

const TONE: Record<StatTone, string> = {
  default: "text-foreground",
  success: "text-success-text",
  warning: "text-warning-text",
  danger: "text-destructive",
};

/**
 * Chiffres clés sans boîte (règles §4, orya `AdminStats` sans sa bordure) :
 * 2 à 4 valeurs sur une cellule, séparées par des filets. Le ton ne porte jamais
 * seul le sens : `hint` le dit en mots.
 */
export function StatStrip({ items, className }: { items: readonly StatItem[]; className?: string }) {
  return (
    <dl
      className={cn(
        "grid grid-cols-2 overflow-hidden rounded-section bg-card md:grid-cols-[repeat(auto-fit,minmax(11rem,1fr))]",
        className,
      )}
    >
      {items.map((item) => (
        <div
          key={item.label}
          className="flex min-w-0 flex-col gap-0.5 px-4 py-3.5 shadow-[inset_-1px_-1px_0_var(--separator)]"
        >
          <dt className="truncate text-footnote text-muted-foreground">{item.label}</dt>
          <dd className={cn("text-title-3 font-semibold tabular-nums", TONE[item.tone ?? "default"])}>{item.value}</dd>
          {item.hint ? <dd className="text-caption-1 text-muted-foreground">{item.hint}</dd> : null}
        </div>
      ))}
    </dl>
  );
}

export function StatStripSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div role="status" aria-label="Chargement des indicateurs" className="grid grid-cols-2 overflow-hidden rounded-section bg-card md:grid-cols-4">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} aria-hidden className="flex flex-col gap-2 px-4 py-3.5 shadow-[inset_-1px_-1px_0_var(--separator)]">
          <span className="h-3 w-20 animate-pulse rounded-full bg-fill" />
          <span className="h-5 w-16 animate-pulse rounded-full bg-fill" />
        </div>
      ))}
    </div>
  );
}

/** Variation en % contre la fenêtre précédente de même durée (orya `deltaPercent`). `null` : pas de base. */
export function deltaPercent(current: number, previous: number): number | null {
  if (!Number.isFinite(previous) || previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

/** Indice de variation : signe + texte (« +12 % vs période précédente »), jamais la couleur seule. */
export function Delta({ value, baseLabel = "vs période précédente" }: { value: number | null; baseLabel?: string }) {
  if (value === null) return <span className="text-muted-foreground">pas de comparaison</span>;
  return (
    <span className={cn("font-medium", value > 0 ? "text-success-text" : value < 0 ? "text-destructive" : "text-muted-foreground")}>
      {value > 0 ? "+" : value < 0 ? "−" : ""}
      {Math.abs(value)} % {baseLabel}
    </span>
  );
}
