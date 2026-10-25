import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { formatChartValue, type ChartFormat } from "@/lib/chart-format";
import { AreaChart, BarList, ChartLegend, type ChartPoint, type ChartSeries } from "./charts";

/**
 * Bande de tendance (orya `AdminInsightBand`) : période + légende avec totaux, aires
 * en « vagues » (série principale épaisse), répartition en barres à côté (conteneur ≥ 48 rem, requête de conteneur)
 * ou dessous. Server-safe : props sérialisables seulement (`format`, pas de fonction).
 * Sans aucune valeur sur la période : état vide explicite, pas de courbe plate trompeuse.
 */
export function InsightBand({
  period,
  series,
  data,
  totals,
  format = "number",
  breakdown,
  label,
  note,
  height = 112,
  className,
}: {
  /** Contrôle de période (ex. `PeriodSwitch`), client. */
  period?: ReactNode;
  series: readonly (ChartSeries & { format?: ChartFormat })[];
  data: readonly ChartPoint[];
  totals: Record<string, number>;
  format?: ChartFormat;
  breakdown?: { title: string; items: readonly { id: string; label: string; value: number }[]; format?: ChartFormat };
  label: string;
  /** Portée réelle du calcul (listes plafonnées par l'API). */
  note?: string;
  height?: number;
  className?: string;
}) {
  const hasData = data.some((p) => series.some((s) => (p.values[s.key] ?? 0) > 0));
  return (
    <div className={cn("@container rounded-section bg-card p-4", className)}>
    <div className="flex min-w-0 flex-col gap-4 @3xl:flex-row @3xl:items-stretch @3xl:gap-6">
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {period}
          <ChartLegend
            items={series.map((s) => ({
              label: s.label,
              color: s.color,
              heavy: s.heavy,
              value: formatChartValue(totals[s.key] ?? 0, s.format ?? format),
            }))}
          />
        </div>
        {hasData ? (
          <AreaChart data={data} series={series} height={height} label={label} format={format} />
        ) : (
          <p className="flex items-center text-subhead text-muted-foreground" style={{ height }}>
            Aucune activité sur la période.
          </p>
        )}
        {note ? <p className="text-footnote text-muted-foreground">{note}</p> : null}
      </div>
      {breakdown ? (
        <section aria-label={breakdown.title} className="flex min-w-0 flex-col gap-2 @3xl:w-72 @3xl:shrink-0">
          <h3 className="text-footnote font-semibold text-muted-foreground">{breakdown.title}</h3>
          <BarList items={breakdown.items} format={breakdown.format ?? format} label={breakdown.title} />
        </section>
      ) : null}
    </div>
    </div>
  );
}

export function InsightBandSkeleton({ height = 112 }: { height?: number }) {
  return (
    <div role="status" aria-label="Chargement de la tendance" className="flex flex-col gap-3 rounded-section bg-card p-4">
      <span aria-hidden className="h-6 w-64 animate-pulse rounded-full bg-fill" />
      <span aria-hidden className="w-full animate-pulse rounded-[12px] bg-fill" style={{ height }} />
    </div>
  );
}
