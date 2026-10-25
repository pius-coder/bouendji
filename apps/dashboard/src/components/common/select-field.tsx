"use client";

import { Icon } from "./icon";
import { useId } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export interface SelectOption<T extends string = string> {
  value: T;
  label: string;
}

/**
 * Pop-up button (HIG pop-up-buttons) : 3 à ~10 choix exclusifs, la valeur choisie
 * s'affiche sur le bouton, coche dans le menu. Au-delà : `PickerSheet`.
 */
function SelectMenu<T extends string>({
  value,
  options,
  onValueChange,
  triggerClassName,
  triggerLabel,
  labelledBy,
  placeholder = "Choisir",
}: {
  value: T | "";
  options: readonly SelectOption<T>[];
  onValueChange: (next: T) => void;
  triggerClassName: string;
  triggerLabel?: string;
  labelledBy?: string;
  placeholder?: string;
}) {
  const current = options.find((o) => o.value === value);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={triggerLabel}
        aria-labelledby={labelledBy}
        className={cn("flex items-center gap-1 outline-none focus-visible:ring-2 focus-visible:ring-ring", triggerClassName)}
      >
        <span className={cn("min-w-0 truncate", !current && "text-placeholder")}>{current?.label ?? placeholder}</span>
        <Icon name="sort" className="size-4 shrink-0 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-52 rounded-[14px] p-1">
        <DropdownMenuRadioGroup value={value} onValueChange={(next) => onValueChange(next as T)}>
          {options.map((o) => (
            <DropdownMenuRadioItem key={o.value} value={o.value} className="min-h-11 rounded-[10px] text-body md:min-h-9 md:text-subhead">
              {o.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Sélecteur autonome : libellé au-dessus, bouton à fond gris 44 px. */
export function SelectField<T extends string>({
  label,
  value,
  options,
  onValueChange,
  hint,
  placeholder,
  className,
}: {
  label: string;
  value: T | "";
  options: readonly SelectOption<T>[];
  onValueChange: (next: T) => void;
  hint?: string;
  placeholder?: string;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <span id={id} className="px-1 text-footnote font-medium text-muted-foreground">
        {label}
      </span>
      <SelectMenu
        value={value}
        options={options}
        onValueChange={onValueChange}
        labelledBy={id}
        placeholder={placeholder}
        triggerClassName="h-11 w-full justify-between rounded-field bg-fill px-3 text-start text-foreground"
      />
      {hint ? <p className="px-1 text-footnote text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/** Sélecteur DANS une ligne de liste : titre au début, valeur + chevrons à la fin. */
export function SelectRow<T extends string>({
  title,
  value,
  options,
  onValueChange,
  placeholder,
}: {
  title: string;
  value: T | "";
  options: readonly SelectOption<T>[];
  onValueChange: (next: T) => void;
  placeholder?: string;
}) {
  const id = useId();
  return (
    <div className="relative flex min-h-11 items-center gap-3 px-4 before:absolute before:inset-x-0 before:top-0 before:start-4 before:h-px before:bg-separator first:before:hidden">
      <span id={id} className="flex-1 text-body text-foreground md:text-subhead">
        {title}
      </span>
      <SelectMenu
        value={value}
        options={options}
        onValueChange={onValueChange}
        labelledBy={id}
        placeholder={placeholder}
        triggerClassName="-me-2 h-11 rounded-field px-2 text-body text-muted-foreground md:text-subhead"
      />
    </div>
  );
}

/** Variante compacte pour une barre d'outils (taille de page, densité). */
export function SelectChip<T extends string>({
  label,
  value,
  options,
  onValueChange,
}: {
  label: string;
  value: T;
  options: readonly SelectOption<T>[];
  onValueChange: (next: T) => void;
}) {
  return (
    <SelectMenu
      value={value}
      options={options}
      onValueChange={onValueChange}
      triggerLabel={label}
      triggerClassName="h-11 rounded-full bg-fill px-3 text-subhead text-foreground md:h-8"
    />
  );
}
