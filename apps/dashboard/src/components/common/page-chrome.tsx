"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";

interface ChromeState {
  title: string;
  /** Le grand titre est sorti de l'écran : la barre du haut affiche le titre compact. */
  collapsed: boolean;
}

const ChromeContext = createContext<{
  state: ChromeState;
  setState: (next: ChromeState) => void;
} | null>(null);

/** Fourni par le shell : relie le grand titre de la page à la barre du haut. */
export function PageChromeProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ChromeState>({ title: "", collapsed: false });
  return <ChromeContext.Provider value={{ state, setState }}>{children}</ChromeContext.Provider>;
}

/** Lu par la barre du haut du shell. */
export function useCollapsedTitle(): string | null {
  const ctx = useContext(ChromeContext);
  return ctx && ctx.state.collapsed ? ctx.state.title : null;
}

/**
 * Observe un repère placé sous le grand titre : quand il sort sous la barre du haut,
 * le titre passe dans la barre (HIG toolbars › « large title transitions to a standard
 * title as people begin scrolling »). Aucune animation de défilement.
 */
export function useLargeTitle(title: string) {
  const ctx = useContext(ChromeContext);
  const sentinel = useRef<HTMLDivElement | null>(null);
  const setState = ctx?.setState;

  useEffect(() => {
    const node = sentinel.current;
    if (!node || !setState) return;
    const topbar = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--topbar-h")) * 16 || 52;
    const observer = new IntersectionObserver(
      ([entry]) => setState({ title, collapsed: !entry.isIntersecting && entry.boundingClientRect.top < topbar }),
      { rootMargin: `-${topbar}px 0px 0px 0px` },
    );
    observer.observe(node);
    return () => {
      observer.disconnect();
      setState({ title: "", collapsed: false });
    };
  }, [title, setState]);

  return sentinel;
}
