"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/common/icon";

const DEBOUNCE_MS = 300;

/**
 * Recherche (Chariow : champ 44 px, rayon 12, loupe à gauche). Champ local, puis
 * `onCommit` écrit l'URL 300 ms après la dernière frappe ; quand l'URL change
 * ailleurs, la saisie suit (état ajusté pendant le rendu, sans effet).
 */
export function SearchBox({
  label,
  placeholder,
  value,
  onCommit,
}: {
  label: string;
  placeholder: string;
  value: string;
  onCommit?: (value: string) => void;
}) {
  const [state, setState] = useState({ value, draft: value });
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  if (state.value !== value) setState({ value, draft: value });

  useEffect(() => () => clearTimeout(timer.current), []);

  function change(next: string) {
    setState((s) => ({ ...s, draft: next }));
    clearTimeout(timer.current);
    timer.current = setTimeout(() => onCommit?.(next), DEBOUNCE_MS);
  }

  return (
    <label className="flex h-11 w-full items-center gap-2.5 rounded-xl border border-input bg-card px-3.5 transition-[border-color,box-shadow] focus-within:border-ring focus-within:shadow-[0_0_0_3px_var(--accent-soft)] sm:h-10">
      <Icon name="search" className="size-[1.125rem] text-muted-foreground" />
      <input
        type="search"
        aria-label={label}
        placeholder={placeholder}
        value={state.draft}
        readOnly={!onCommit}
        onChange={(e) => change(e.target.value)}
        className="h-full min-w-0 flex-1 bg-transparent outline-none"
      />
    </label>
  );
}
