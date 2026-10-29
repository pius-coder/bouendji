"use client";

import { useTheme } from "next-themes";
import { Icon } from "@/components/common/icon";

const OPTIONS = [
  { value: "system", label: "Automatique", icon: "monitor" },
  { value: "light", label: "Clair", icon: "sun" },
  { value: "dark", label: "Sombre", icon: "moon" },
] as const;

/** Thème de la console (le choix est gardé par next-themes, par navigateur). */
export function AppearanceForm() {
  const { theme, setTheme } = useTheme();
  return (
    <div className="flex max-w-lg flex-col gap-3">
      <p id="theme-label" className="text-subhead font-semibold">
        Thème
      </p>
      <div role="radiogroup" aria-labelledby="theme-label" className="grid grid-cols-3 gap-2">
        {OPTIONS.map((option) => {
          const selected = theme === option.value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setTheme(option.value)}
              className={`flex flex-col items-center gap-2 rounded-xl border px-3 py-4 text-subhead font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                selected ? "border-transparent bg-accent-soft text-accent-text shadow-card" : "border-transparent bg-group text-foreground"
              }`}
            >
              <Icon name={option.icon} className="size-6" />
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
