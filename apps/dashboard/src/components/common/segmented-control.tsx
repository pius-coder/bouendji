"use client";

import { useRef, type KeyboardEvent } from "react";
import { cn } from "@/lib/utils";

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
}

/**
 * Segmented control (HIG segmented-controls) : 2 à 5 segments de même largeur, texte
 * seul (noms), pour basculer entre sous-vues proches. Piste `fill`, segment actif
 * `cell` + graisse 600, SANS ombre. Clavier : flèches (radiogroup, tabindex roulant).
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onValueChange,
  label,
  className,
  pending = false,
  size = "md",
}: {
  options: readonly SegmentOption<T>[];
  value: T;
  onValueChange: (next: T) => void;
  /** Nom accessible du groupe (non affiché : les segments se suffisent). */
  label: string;
  className?: string;
  /** Rendu serveur en cours : la piste reste, le contenu suit. */
  pending?: boolean;
  /** `sm` : pastille compacte de bande d’en-tête (orya PeriodSwitch), cible élargie à 44 px. */
  size?: "md" | "sm";
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const index = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const step = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const dir = getComputedStyle(event.currentTarget).direction === "rtl" && (event.key === "ArrowRight" || event.key === "ArrowLeft") ? -step : step;
    const next = (index + dir + options.length) % options.length;
    onValueChange(options[next].value);
    refs.current[next]?.focus();
  }

  return (
    <div
      role="radiogroup"
      aria-label={label}
      aria-busy={pending || undefined}
      onKeyDown={onKeyDown}
      className={cn(
        "grid auto-cols-fr grid-flow-col gap-0.5 bg-fill p-0.5",
        size === "sm" ? "h-8 w-fit rounded-full" : "h-9 rounded-[10px]",
        className,
      )}
    >
      {options.map((option, i) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            ref={(node) => {
              refs.current[i] = node;
            }}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onValueChange(option.value)}
            className={cn(
              "relative min-w-0 truncate px-3 text-subhead outline-none transition-[background-color,color] duration-150",
              size === "sm" ? "rounded-full text-footnote tabular-nums after:-inset-y-1.5" : "rounded-[8px]",
              "after:absolute after:-inset-y-1 after:inset-x-0",
              "focus-visible:ring-2 focus-visible:ring-ring",
              active ? "bg-cell-elevated font-semibold text-foreground shadow-[0_1px_3px_rgba(20,27,52,0.12),0_0_0_0.5px_rgba(20,27,52,0.06)]" : "text-foreground/80 [@media(hover:hover)]:hover:text-foreground",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Sélecteur de période (orya `PeriodSwitch`) : segmented control compact, libellés
 * « 7 j », « 30 j »… Présentation seule : la page le relie à son paramètre d'URL.
 */
export function PeriodSwitch<T extends string>({
  options,
  value,
  onValueChange,
  pending,
  label = "Période",
}: {
  options: readonly SegmentOption<T>[];
  value: T;
  onValueChange: (next: T) => void;
  pending?: boolean;
  label?: string;
}) {
  return <SegmentedControl size="sm" label={label} options={options} value={value} onValueChange={onValueChange} pending={pending} />;
}
