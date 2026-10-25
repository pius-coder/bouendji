"use client";

import { Icon } from "./icon";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Recherche en ligne (HIG search-fields › inline) : loupe au début, effacement à la fin,
 * recherche dès la frappe avec un délai (`debounceMs`, 300 par défaut). Le libellé est
 * porté par `label` (lu par le lecteur d'écran) ; le placeholder dit la portée.
 * Contrôlé par la valeur de l'URL : `value` est la valeur courante, `onSearch` l'écrit.
 */
export function SearchField({
  value,
  onSearch,
  label,
  placeholder = "Rechercher",
  debounceMs = 300,
  className,
}: {
  value: string;
  onSearch: (next: string) => void;
  label: string;
  placeholder?: string;
  debounceMs?: number;
  className?: string;
}) {
  const [draft, setDraft] = useState(value);
  const [synced, setSynced] = useState(value);
  // L'URL a changé ailleurs (bouton « Effacer les filtres », retour arrière) : on suit.
  if (value !== synced) {
    setSynced(value);
    setDraft(value);
  }
  const latest = useRef(onSearch);
  useEffect(() => {
    latest.current = onSearch;
  });
  useEffect(() => {
    if (draft === value) return;
    const timer = window.setTimeout(() => latest.current(draft.trim()), debounceMs);
    return () => window.clearTimeout(timer);
  }, [draft, value, debounceMs]);

  return (
    <div
      role="search"
      className={cn(
        "flex h-11 min-w-0 items-center gap-2 rounded-field bg-fill px-3 focus-within:ring-2 focus-within:ring-ring md:h-9",
        className,
      )}
    >
      <Icon name="search" className="size-4 shrink-0 text-muted-foreground" />
      <input
        type="search"
        aria-label={label}
        value={draft}
        placeholder={placeholder}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") latest.current(draft.trim());
          if (event.key === "Escape" && draft) setDraft("");
        }}
        enterKeyHint="search"
        className="h-full min-w-0 flex-1 bg-transparent text-foreground outline-none placeholder:text-placeholder [&::-webkit-search-cancel-button]:appearance-none"
      />
      {draft ? (
        <button
          type="button"
          aria-label="Effacer la recherche"
          onClick={() => {
            setDraft("");
            latest.current("");
          }}
          className="-me-1 flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground/70 outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Icon name="close-circle" className="size-4 fill-current stroke-fill" />
        </button>
      ) : null}
    </div>
  );
}
