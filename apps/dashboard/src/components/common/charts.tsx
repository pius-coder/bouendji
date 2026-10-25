"use client";

import { useId, useMemo, useState, type PointerEvent, type ReactNode } from "react";
import { formatChartValue, type ChartFormat } from "@/lib/chart-format";
import { cn } from "@/lib/utils";

export { formatChartValue, type ChartFormat };

/**
 * Graphiques du kit, repris d'orya (`admin-insight-band.tsx` : « vagues » d'aires,
 * légende, barres de répartition ; `overview-view.tsx` : courbe de revenus) en version
 * HIG sobre : aucune ombre, couleurs `--chart-*` (D83), libellés français, pas
 * d'animation. SVG maison (recharts non installable sur ce poste : réseau) ; chaque
 * graphique a un équivalent texte (tableau masqué) pour les lecteurs d'écran.
 */

export interface ChartSeries {
  key: string;
  label: string;
  /** Couleur CSS, ex. `var(--chart-1)`. */
  color: string;
  /** Série principale : trait épais + remplissage dégradé ; les autres croisent en fin. */
  heavy?: boolean;
}

export interface ChartPoint {
  /** Abscisse (jour ISO `YYYY-MM-DD`). */
  x: string;
  values: Record<string, number>;
}

const W = 600;


/** Catmull-Rom -> Bézier : courbe douce passant par chaque point (équivalent `type="natural"`). */
function smoothPath(points: readonly [number, number][]): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M${points[0][0]},${points[0][1]}`;
  let d = `M${points[0][0]},${points[0][1]}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    // Ordonnées des points de contrôle bornées au segment : la courbe ne plonge pas
    // sous zéro ni ne dépasse un pic (équivalent d’une interpolation monotone).
    const lo = Math.min(p1[1], p2[1]);
    const hi = Math.max(p1[1], p2[1]);
    const c1y = Math.min(hi, Math.max(lo, p1[1] + (p2[1] - p0[1]) / 6));
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = Math.min(hi, Math.max(lo, p2[1] - (p3[1] - p1[1]) / 6));
    d += ` C${c1x},${c1y} ${c2x},${c2y} ${p2[0]},${p2[1]}`;
  }
  return d;
}

const DAY_FMT = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" });
export function formatDay(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? iso : DAY_FMT.format(d);
}

/**
 * Aires empilées en « vagues » (orya) ou courbe unique avec axes (`axes`).
 * Survol / toucher : repère vertical pointillé + infobulle des valeurs du jour.
 */
export function AreaChart({
  data,
  series,
  height = 96,
  axes = false,
  label,
  format = "number",
  formatValue,
  formatX = formatDay,
  className,
}: {
  data: readonly ChartPoint[];
  series: readonly ChartSeries[];
  height?: number;
  /** Grille horizontale + étiquettes d'axes (graphique de section). */
  axes?: boolean;
  /** Nom accessible : ce que montre le graphique. */
  label: string;
  /** Format des valeurs (sérialisable). Ignoré si `formatValue` est fourni (composant client). */
  format?: ChartFormat;
  formatValue?: (value: number, key: string) => string;
  formatX?: (x: string) => string;
  className?: string;
}) {
  const fmt = formatValue ?? ((v: number) => formatChartValue(v, format));
  const fmtAxis = (v: number) => (formatValue ? formatValue(v, "") : formatChartValue(v, format, true));
  const gradientId = useId().replace(/:/g, "");
  const [hover, setHover] = useState<number | null>(null);
  const padTop = 6;
  const plotH = height - padTop - (axes ? 22 : 2);

  const scale = useMemo(() => {
    const max = Math.max(1, ...data.flatMap((p) => series.map((s) => p.values[s.key] ?? 0)));
    // Graduation « ronde » pour les axes : 1, 2 ou 5 × 10^n.
    const step = 10 ** Math.floor(Math.log10(max));
    const nice = [1, 2, 5, 10].map((m) => m * step).find((v) => v >= max) ?? max;
    return { max: axes ? nice : max };
  }, [data, series, axes]);

  const x = (i: number) => (data.length <= 1 ? W / 2 : (i / (data.length - 1)) * W);
  const y = (v: number) => padTop + plotH - (v / scale.max) * plotH;
  const drawOrder = [...series].reverse();
  const heavy = series.find((s) => s.heavy) ?? series[0];

  function onPointer(event: PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientX - rect.left) / rect.width;
    setHover(Math.max(0, Math.min(data.length - 1, Math.round(ratio * (data.length - 1)))));
  }

  const ticks = axes ? [0, 0.5, 1].map((t) => t * scale.max) : [];
  const xTicks = axes && data.length > 1 ? [0, Math.floor((data.length - 1) / 2), data.length - 1] : [];

  return (
    <figure className={cn("relative m-0 w-full min-w-0", className)}>
      <div
        className={cn("relative w-full", axes && "ps-12")}
        style={{ height }}
        onPointerMove={onPointer}
        onPointerDown={onPointer}
        onPointerLeave={() => setHover(null)}
      >
        <svg role="img" aria-label={label} viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" className="h-full w-full overflow-visible">
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--chart-fill)" stopOpacity={0.35} />
              <stop offset="100%" stopColor="var(--chart-fill)" stopOpacity={0} />
            </linearGradient>
          </defs>
          {ticks.map((t) => (
            <line key={t} x1={0} x2={W} y1={y(t)} y2={y(t)} stroke="var(--separator)" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
          ))}
          {drawOrder.map((s) => {
            const pts = data.map((p, i) => [x(i), y(p.values[s.key] ?? 0)] as [number, number]);
            const line = smoothPath(pts);
            const isHeavy = s.key === heavy?.key;
            return (
              <g key={s.key}>
                {isHeavy && pts.length > 1 ? (
                  <path d={`${line} L${W},${padTop + plotH} L0,${padTop + plotH} Z`} fill={`url(#${gradientId})`} stroke="none" />
                ) : null}
                <path
                  d={line}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={isHeavy ? 2.25 : 1.25}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                />
              </g>
            );
          })}
          {hover !== null ? (
            <line x1={x(hover)} x2={x(hover)} y1={padTop} y2={padTop + plotH} stroke="var(--muted-foreground)" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
          ) : null}
        </svg>
        {axes ? (
          <>
            {ticks.map((t) => (
              <span
                key={t}
                aria-hidden
                className="absolute start-0 w-11 -translate-y-1/2 text-end text-caption-2 text-muted-foreground tabular-nums"
                style={{ top: y(t) }}
              >
                {fmtAxis(t)}
              </span>
            ))}
            {xTicks.map((i, n) => (
              <span
                key={i}
                aria-hidden
                className={cn(
                  "absolute bottom-0 text-caption-2 text-muted-foreground",
                  n === 0 ? "start-12" : n === xTicks.length - 1 ? "end-0" : "start-[calc(50%+1.5rem)] -translate-x-1/2",
                )}
              >
                {formatX(data[i].x)}
              </span>
            ))}
          </>
        ) : null}
        {hover !== null && data[hover] ? (
          <div
            aria-hidden
            className="pointer-events-none absolute top-0 z-10 min-w-36 rounded-[12px] bg-popover px-3 py-2 text-footnote shadow-float"
            style={{
              insetInlineStart: `clamp(0px, calc(${(hover / Math.max(1, data.length - 1)) * 100}% - 4.5rem), calc(100% - 9rem))`,
            }}
          >
            <p className="mb-1 font-semibold text-foreground">{formatX(data[hover].x)}</p>
            {series.map((s) => (
              <p key={s.key} className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <span className="h-0.5 w-3 rounded-full" style={{ background: s.color }} />
                  {s.label}
                </span>
                <span className="font-medium text-foreground tabular-nums">{fmt(data[hover].values[s.key] ?? 0, s.key)}</span>
              </p>
            ))}
          </div>
        ) : null}
      </div>
      <table className="sr-only">
        <caption>{label}</caption>
        <thead>
          <tr>
            <th scope="col">Jour</th>
            {series.map((s) => (
              <th key={s.key} scope="col">
                {s.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((p) => (
            <tr key={p.x}>
              <th scope="row">{formatX(p.x)}</th>
              {series.map((s) => (
                <td key={s.key}>{fmt(p.values[s.key] ?? 0, s.key)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

/** Légende orya : trait épais pour la série principale, fin pour les autres, total à côté. */
export function ChartLegend({ items }: { items: readonly { label: string; color: string; heavy?: boolean; value?: ReactNode }[] }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1">
      {items.map((item) => (
        <li key={item.label} className="inline-flex items-center gap-1.5 text-footnote text-muted-foreground">
          <span aria-hidden className={cn("w-3 rounded-full", item.heavy ? "h-[3px]" : "h-px")} style={{ background: item.color }} />
          {item.label}
          {item.value !== undefined ? <span className="font-semibold text-foreground tabular-nums">{item.value}</span> : null}
        </li>
      ))}
    </ul>
  );
}

/** Mini-courbe sans axes (dans une ligne, une stat). Décorative si `label` absent. */
export function Sparkline({
  values,
  color = "var(--chart-1)",
  width = 72,
  height = 24,
  label,
}: {
  values: readonly number[];
  color?: string;
  width?: number;
  height?: number;
  label?: string;
}) {
  const max = Math.max(1, ...values);
  const pts = values.map((v, i) => [values.length <= 1 ? width / 2 : (i / (values.length - 1)) * width, height - 2 - (v / max) * (height - 4)] as [number, number]);
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className="shrink-0 overflow-visible"
    >
      <path d={smoothPath(pts)} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Répartition en barres horizontales (orya `Breakdown`) : 5 premières entrées, barre
 * proportionnelle au maximum, valeur à la fin. Une liste, pas un camembert.
 */
export function BarList({
  items,
  format = "number",
  limit = 5,
  empty = "Aucune donnée sur la période.",
  label,
}: {
  items: readonly { id: string; label: string; value: number; href?: string }[];
  format?: ChartFormat;
  limit?: number;
  empty?: string;
  label: string;
}) {
  const shown = items.slice(0, limit);
  const max = Math.max(1, ...shown.map((i) => i.value));
  if (shown.length === 0) return <p className="text-footnote text-muted-foreground">{empty}</p>;
  return (
    <ol aria-label={label} className="flex flex-col gap-1">
      {shown.map((item) => (
        <li key={item.id} className="relative flex h-8 items-center gap-2 overflow-hidden rounded-[8px] px-2 text-footnote">
          <span aria-hidden className="absolute inset-y-0 start-0 rounded-[8px] bg-accent" style={{ width: `${Math.max(4, (item.value / max) * 100)}%` }} />
          <span className="relative min-w-0 flex-1 truncate text-foreground">{item.label}</span>
          <span className="relative font-semibold text-foreground tabular-nums">{formatChartValue(item.value, format)}</span>
        </li>
      ))}
    </ol>
  );
}

/** Jauge de taux (orya : barres par rail) : libellé, valeur, barre. Le texte porte le sens. */
export function MeterRow({ label, valueLabel, ratio, tone = "accent" }: { label: string; valueLabel: string; ratio: number; tone?: "accent" | "danger" | "success" }) {
  const pct = Math.round(Math.max(0, Math.min(1, ratio)) * 100);
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2 text-subhead">
        <span className="text-foreground">{label}</span>
        <span className="text-footnote text-muted-foreground tabular-nums">{valueLabel}</span>
      </div>
      <div role="meter" aria-label={label} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} className="h-1.5 overflow-hidden rounded-full bg-fill">
        <span
          className={cn("block h-full rounded-full", tone === "danger" ? "bg-destructive" : tone === "success" ? "bg-success" : "bg-foreground")}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
