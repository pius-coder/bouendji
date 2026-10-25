"use client";

import { cn } from "@/lib/utils";

export interface ChipOption {
  value: string;
  label: string;
  /** Pastille de couleur avant le libellé (Chariow). */
  dot?: "success" | "warning" | "danger" | "info" | "neutral";
}

const DOT: Record<NonNullable<ChipOption["dot"]>, string> = {
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-destructive-solid",
  info: "bg-info-text",
  neutral: "bg-neutral-state",
};

/**
 * Puces de filtre (Chariow : pilules 32 px, pastille de couleur). Présentation
 * pure : la valeur vient des props, le changement remonte par `onChange`.
 * Active = fond gris #e5e7e8 (Chariow, D108). `""` = « Tous ».
 */
export function ChipFilter({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly ChipOption[];
  value: string;
  onChange?: (value: string) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none]">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={!onChange}
            onClick={() => onChange?.(o.value)}
            className={cn(
              "flex h-7 shrink-0 items-center gap-2 rounded-full px-4 text-caption-1 font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default",
              active ? "bg-group-strong text-foreground" : "bg-group text-foreground hover:bg-group-strong",
            )}
          >
            <span aria-hidden className={cn("size-1.5 rounded-full", DOT[o.dot ?? "neutral"])} />
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
