"use client";

import { Icon } from "@/components/common/icon";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ROLE_LABEL, type Role } from "@/lib/roles";
import { cn } from "@/lib/utils";

export interface CommunityOption {
  id: string;
  name: string;
}

const SWITCH_LABEL = "Changer de communauté";
const NO_COMMUNITY = "Aucune communauté";

/** Même écran dans l'autre communauté si l'URL en porte une ; sinon ses commandes. */
function targetHref(pathname: string, activeId: string | null, nextId: string): string {
  if (activeId && pathname.startsWith(`/${activeId}/`)) return pathname.replace(`/${activeId}/`, `/${nextId}/`);
  return `/${nextId}/orders`;
}

/**
 * Sélecteur de communauté (menu, pas une page). Montre la communauté active et le
 * rôle de l'utilisateur dans celle-ci. `compact` : barre du haut mobile.
 */
export function CommunitySwitcher({
  communities,
  activeId,
  role,
  compact = false,
}: {
  communities: readonly CommunityOption[];
  activeId: string | null;
  role: Role | null;
  compact?: boolean;
}) {
  const pathname = usePathname();
  const active = communities.find((c) => c.id === activeId);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`${SWITCH_LABEL} (actuelle : ${active?.name ?? NO_COMMUNITY})`}
        className={cn(
          "flex min-w-0 items-center gap-2 rounded-field text-start outline-none focus-visible:ring-2 focus-visible:ring-ring",
          compact ? "h-11 max-w-[13rem] px-1.5" : "h-12 w-full bg-white/[0.07] px-2 text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.09)] transition-colors hover:bg-white/[0.11]",
        )}
      >
        <span
          aria-hidden
          className={cn(
            "grid shrink-0 place-items-center rounded-lg bg-accent-gradient font-bold text-white",
            compact ? "size-7 text-caption-1" : "size-8 text-footnote",
          )}
        >
          {(active?.name ?? "?").slice(0, 1).toUpperCase()}
        </span>
        <span className="min-w-0 flex-1">
          <span className={cn("block truncate font-semibold", compact ? "text-foreground text-subhead" : "text-white text-subhead")}>
            {active?.name ?? NO_COMMUNITY}
          </span>
          {role && !compact ? <span className="block truncate text-caption-1 text-sidebar-foreground">{ROLE_LABEL[role]}</span> : null}
        </span>
        <Icon name="sort" className={cn("size-4 shrink-0", compact ? "text-muted-foreground" : "text-sidebar-foreground")} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel className="text-footnote font-normal text-muted-foreground">{SWITCH_LABEL}</DropdownMenuLabel>
        {communities.map((c) => (
          <DropdownMenuItem key={c.id} asChild className="min-h-11 md:min-h-9">
            <Link href={targetHref(pathname, activeId, c.id)}>
              <span className="flex-1 truncate">{c.name}</span>
              {c.id === activeId ? <Icon name="checkmark" className="size-4 text-accent-text" /> : null}
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
