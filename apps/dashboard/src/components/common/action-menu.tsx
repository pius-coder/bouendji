"use client";

import { Icon } from "./icon";
import Link from "next/link";
import type { ReactNode } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { NavBarButton } from "./nav-bar-button";

export interface MenuAction {
  label: string;
  icon?: ReactNode;
  /** Navigation. */
  href?: string;
  onSelect?: () => void;
  /** En fin de menu, en rouge ; l'irréversible ouvre ensuite une `ConfirmAlert`. */
  destructive?: boolean;
  /** Masqué si indisponible dans ce contexte (HIG context-menus : « hide, don't dim »). */
  hidden?: boolean;
}

/**
 * Actions d'un élément (bouton « … ») : HIG pull-down / context menus. Groupes séparés
 * par un filet, destructif en dernier. Chaque action existe aussi ailleurs (détail).
 */
export function ActionMenu({
  actions,
  label = "Actions",
  title,
  trigger,
  align = "end",
  className,
}: {
  actions: readonly MenuAction[];
  label?: string;
  /** Titre du menu, seulement s'il clarifie (ex. « 3 appareils sélectionnés »). */
  title?: string;
  trigger?: ReactNode;
  align?: "start" | "end";
  className?: string;
}) {
  const visible = actions.filter((a) => !a.hidden);
  const regular = visible.filter((a) => !a.destructive);
  const destructive = visible.filter((a) => a.destructive);
  if (visible.length === 0) return null;
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        {trigger ?? (
          <NavBarButton label={label} className={cn("text-muted-foreground", className)} onClick={(e) => e.stopPropagation()}>
            <Icon name="more" />
          </NavBarButton>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="min-w-56 rounded-[14px] p-1" onClick={(e) => e.stopPropagation()}>
        {title ? <DropdownMenuLabel className="text-footnote font-normal text-muted-foreground">{title}</DropdownMenuLabel> : null}
        <DropdownMenuGroup>{regular.map((a) => <MenuItem key={a.label} action={a} />)}</DropdownMenuGroup>
        {destructive.length > 0 && regular.length > 0 ? <DropdownMenuSeparator /> : null}
        {destructive.length > 0 ? <DropdownMenuGroup>{destructive.map((a) => <MenuItem key={a.label} action={a} />)}</DropdownMenuGroup> : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function MenuItem({ action }: { action: MenuAction }) {
  const className = cn(
    "min-h-11 gap-3 rounded-[10px] px-3 text-body md:min-h-9 md:text-subhead [&_svg]:size-[1.125rem]",
    action.destructive && "text-destructive focus:text-destructive [&_svg]:text-destructive",
  );
  if (action.href) {
    return (
      <DropdownMenuItem asChild className={className}>
        <Link href={action.href}>
          <span className="flex-1">{action.label}</span>
          {action.icon}
        </Link>
      </DropdownMenuItem>
    );
  }
  return (
    <DropdownMenuItem className={className} onSelect={action.onSelect}>
      <span className="flex-1">{action.label}</span>
      {action.icon}
    </DropdownMenuItem>
  );
}
