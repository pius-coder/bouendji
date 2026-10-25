"use client";

import { Icon } from "./icon";
import { useMemo, useState } from "react";
import { AppSheet } from "./app-sheet";
import { SearchField } from "./search-field";
import type { SelectOption } from "./select-field";
import { EmptyState } from "./states";

/**
 * Longue liste de choix (pays, membres, communautés) : feuille avec recherche
 * (HIG pickers › « very large set → list »). Un choix ferme la feuille.
 */
export function PickerSheet<T extends string>({
  open,
  onOpenChange,
  title,
  options,
  value,
  onValueChange,
  searchLabel = "Rechercher",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  options: readonly (SelectOption<T> & { detail?: string })[];
  value: T | "";
  onValueChange: (next: T) => void;
  searchLabel?: string;
}) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("fr");
    return q ? options.filter((o) => `${o.label} ${o.detail ?? ""}`.toLocaleLowerCase("fr").includes(q)) : options;
  }, [options, query]);

  return (
    <AppSheet open={open} onOpenChange={onOpenChange} title={title}>
      <div className="flex flex-col gap-3">
        <SearchField value={query} onSearch={setQuery} label={searchLabel} debounceMs={0} />
        {filtered.length === 0 ? (
          <EmptyState title="Aucun choix" query={query} />
        ) : (
          <ul className="overflow-hidden rounded-section bg-card" role="listbox" aria-label={title}>
            {filtered.map((o) => {
              const selected = o.value === value;
              return (
                <li key={o.value} role="option" aria-selected={selected}>
                  <button
                    type="button"
                    onClick={() => {
                      onValueChange(o.value);
                      onOpenChange(false);
                    }}
                    className="relative flex min-h-11 w-full items-center gap-3 px-4 py-2 text-start outline-none before:absolute before:inset-x-0 before:top-0 before:start-4 before:h-px before:bg-separator focus-visible:bg-accent [li:first-child>&]:before:hidden [@media(hover:hover)]:hover:bg-fill/60"
                  >
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-body md:text-subhead">{o.label}</span>
                      {o.detail ? <span className="truncate text-footnote text-muted-foreground">{o.detail}</span> : null}
                    </span>
                    {selected ? <Icon name="checkmark" className="size-5 text-accent-foreground" /> : null}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </AppSheet>
  );
}
