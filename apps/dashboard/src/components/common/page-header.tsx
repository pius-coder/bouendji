"use client";

import { Icon } from "./icon";
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { ActionMenu, type MenuAction } from "./action-menu";
import { useLargeTitle } from "./page-chrome";

/**
 * En-tête de page (règles §3) : grand titre iOS (34 px mobile, 28 px desktop) qui se
 * replie dans la barre du haut au défilement ; UNE action principale à la fin
 * (`action`, un `Button variant="prominent"`) ; actions secondaires dans « … » (`menu`).
 * Titre < 15 caractères, jamais le nom de l'application. Un seul `h1` par page.
 */
export function PageHeader({
  title,
  subtitle,
  action,
  menu,
  back,
  children,
  className,
}: {
  title: string;
  subtitle?: ReactNode;
  action?: ReactNode;
  /** Actions secondaires (liens seulement depuis un composant serveur). */
  menu?: readonly MenuAction[];
  /** Retour vers le parent : chevron seul + libellé du parent (jamais « Retour »). */
  back?: { href: string; label: string };
  /** Contrôles sous le titre (segmented control de période, sélecteur). */
  children?: ReactNode;
  className?: string;
}) {
  const sentinel = useLargeTitle(title);
  return (
    <header className={cn("flex flex-col gap-3 pt-2 md:pt-4", className)}>
      {back ? (
        <Link
          href={back.href}
          className="-ms-2 inline-flex h-11 w-fit items-center gap-0.5 rounded-full pe-3 ps-1 text-body text-accent-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Icon name="chevron-left" className="size-6 rtl:rotate-180" />
          {back.label}
        </Link>
      ) : null}
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-large-title font-semibold tracking-tight text-foreground md:text-[1.75rem] md:leading-[2.125rem]">{title}</h1>
          {subtitle ? <p className="mt-0.5 text-subhead text-muted-foreground">{subtitle}</p> : null}
        </div>
        {action || menu?.length ? (
          <div className="flex shrink-0 items-center gap-1 pb-0.5">
            {menu?.length ? <ActionMenu actions={menu} label="Plus d’actions" /> : null}
            {action}
          </div>
        ) : null}
      </div>
      <div ref={sentinel} aria-hidden className="h-px" />
      {children}
    </header>
  );
}
