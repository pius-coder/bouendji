"use client";

import { Icon } from "@/components/common/icon";
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ACCENT_STORAGE_KEY, ACCENTS, DEFAULT_ACCENT, isAccent, type Accent } from "@/lib/accent";
import { ACCOUNT_ITEM } from "./nav-model";
import { logoutAction } from "@/server/actions/auth.action";

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

/** Thème d'accent lu sur <html data-accent>, posé avant le rendu par le script de démarrage. */
function readAccent(): Accent {
  const value = document.documentElement.dataset.accent;
  return isAccent(value) ? value : DEFAULT_ACCENT;
}

const accentListeners = new Set<() => void>();
function subscribeAccent(listener: () => void) {
  accentListeners.add(listener);
  return () => accentListeners.delete(listener);
}

function setAccent(next: Accent) {
  document.documentElement.dataset.accent = next;
  try {
    localStorage.setItem(ACCENT_STORAGE_KEY, next);
  } catch {
    // Stockage bloqué : le choix vaut pour la page ouverte.
  }
  accentListeners.forEach((l) => l());
}

const ITEM = "min-h-11 md:min-h-9";

/** Compte, couleur du thème, apparence, déconnexion. */
export function UserMenu({ name, email, side = "bottom" }: { name: string; email: string; side?: "bottom" | "right" }) {
  const { theme, setTheme } = useTheme();
  const accent = useSyncExternalStore(subscribeAccent, readAccent, () => DEFAULT_ACCENT);
  const queryClient = useQueryClient();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Compte : ${name}`}
        className="flex size-11 items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="flex size-9 items-center justify-center rounded-full bg-surface text-footnote font-semibold text-foreground shadow-card">
          {initials(name) || "?"}
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent side={side} align="end" className="w-64">
        <DropdownMenuLabel className="font-normal">
          <span className="block truncate text-subhead font-semibold">{name}</span>
          <span className="block truncate text-footnote text-muted-foreground">{email}</span>
        </DropdownMenuLabel>
        <DropdownMenuItem asChild className={ITEM}>
          <Link href={ACCOUNT_ITEM.href}>
            <Icon name="users" className="size-4" />
            {ACCOUNT_ITEM.label}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-footnote font-normal text-muted-foreground">Couleur</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={accent} onValueChange={(v) => isAccent(v) && setAccent(v)}>
          {ACCENTS.map((a) => (
            <DropdownMenuRadioItem key={a.value} value={a.value} className={ITEM} onSelect={(e) => e.preventDefault()}>
              <span aria-hidden className="size-4 rounded-full shadow-button" style={{ background: a.swatch }} />
              {a.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-footnote font-normal text-muted-foreground">Apparence</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={theme ?? "system"} onValueChange={setTheme}>
          <DropdownMenuRadioItem value="system" className={ITEM}>
            <Icon name="monitor" className="size-4" /> Système
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="light" className={ITEM}>
            <Icon name="sun" className="size-4" /> Clair
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark" className={ITEM}>
            <Icon name="moon" className="size-4" /> Sombre
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild className={`${ITEM} text-destructive`}>
          <form action={logoutAction} onSubmit={() => queryClient.clear()}>
            <button type="submit" className="flex w-full items-center gap-2">
              <Icon name="logout" className="size-4" />
              Se déconnecter
            </button>
          </form>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
