"use client";

import { useId, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Interrupteur DANS une ligne de liste (HIG toggles › iOS : « switch only in a list
 * row »). Le titre décrit l'état ACTIVÉ ; toute la ligne est cliquable (44 px).
 * Switch 51×31, vert système activé ; l'état se lit aussi par la position du bouton.
 */
export function SwitchRow({
  title,
  description,
  checked,
  onCheckedChange,
  disabled = false,
  pending = false,
}: {
  title: string;
  description?: ReactNode;
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  disabled?: boolean;
  pending?: boolean;
}) {
  const id = useId();
  return (
    <label
      htmlFor={id}
      className={cn(
        "relative flex min-h-11 cursor-pointer items-center gap-3 px-4 py-2",
        "before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:start-4 before:h-px before:bg-separator first:before:hidden",
        disabled && "cursor-not-allowed opacity-40",
      )}
    >
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-body text-foreground md:text-subhead">{title}</span>
        {description ? <span className="text-footnote text-muted-foreground">{description}</span> : null}
      </span>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-busy={pending || undefined}
        disabled={disabled || pending}
        onClick={() => onCheckedChange(!checked)}
        className={cn(
          "relative h-[31px] w-[51px] shrink-0 rounded-full outline-none transition-colors duration-200",
          "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card",
          checked ? "bg-success" : "bg-[rgba(120,120,128,0.32)]",
        )}
      >
        <span
          aria-hidden
          className={cn(
            "absolute top-[2px] start-[2px] size-[27px] rounded-full bg-white shadow-[0_0_0_0.5px_rgba(0,0,0,0.04)] transition-transform duration-200",
            checked && "translate-x-5 rtl:-translate-x-5",
          )}
        />
      </button>
    </label>
  );
}
