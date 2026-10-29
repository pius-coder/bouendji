import { Icon } from "./icon";
import Link from "next/link";
import type { MouseEventHandler, ReactNode } from "react";
import { cn } from "@/lib/utils";

export type ListRowAccessory = "chevron" | "check" | "none";

export interface ListRowProps {
  title: ReactNode;
  /** Ligne secondaire (footnote, label secondaire). */
  subtitle?: ReactNode;
  /** Valeur à la fin de la ligne (label secondaire, chiffres tabulaires). */
  value?: ReactNode;
  /** Icône ou pastille au début (24 px conseillé). Décale le séparateur. */
  leading?: ReactNode;
  /** Élément libre à la fin, avant l'accessoire (badge, switch, bouton « … »). */
  trailing?: ReactNode;
  /** `chevron` : ouvre un détail. `check` : option choisie. Défaut : chevron si `href`/`onClick`. */
  accessory?: ListRowAccessory;
  /** Navigation. La ligne entière est le lien (cible ≥ 44 px). */
  href?: string;
  /** Remplace l'historique (filtres, panneau de détail dans l'URL). */
  replace?: boolean;
  scroll?: boolean;
  /** Action (composant client seulement : une fonction ne traverse pas la frontière serveur). */
  onClick?: MouseEventHandler<HTMLButtonElement>;
  /** Ligne destructive : texte rouge, à placer dans sa propre section en bas. */
  destructive?: boolean;
  /** Ligne choisie (panneau de détail ouvert, élément sélectionné). */
  selected?: boolean;
  disabled?: boolean;
  className?: string;
}

/**
 * Ligne de liste groupée (règles §4). Séparateur fin en retrait au début du texte,
 * absent sur la première ligne. Server-safe : sans hook.
 */
export function ListRow({
  title,
  subtitle,
  value,
  leading,
  trailing,
  accessory,
  href,
  replace,
  scroll,
  onClick,
  destructive = false,
  selected = false,
  disabled = false,
  className,
}: ListRowProps) {
  const interactive = Boolean(href || onClick);
  const resolvedAccessory = accessory ?? (interactive && !destructive ? "chevron" : "none");
  const rowClass = cn(
    "group/row relative flex min-h-14 w-full items-center gap-3 px-4 py-3 text-start outline-none",
    leading ? "[--sep-inset:3.75rem]" : "[--sep-inset:1rem]",
    "before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:start-[var(--sep-inset)] before:h-px before:bg-separator first:before:hidden",
    interactive && "transition-[background-color,transform] duration-150 [@media(hover:hover)]:hover:bg-fill/70 active:scale-[0.99] active:bg-fill",
    interactive && "focus-visible:bg-accent focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
    selected && "bg-accent",
    disabled && "pointer-events-none opacity-40",
    className,
  );

  const body = (
    <>
      {leading ? <span className="flex size-7 shrink-0 items-center justify-center [&_svg]:size-5">{leading}</span> : null}
      <span className="flex min-w-0 flex-1 flex-col">
        <span
          className={cn(
            "truncate text-body md:text-subhead",
            destructive ? "text-destructive" : "text-foreground",
            selected && !destructive && "font-semibold",
          )}
        >
          {title}
        </span>
        {subtitle ? <span className="truncate text-footnote text-muted-foreground">{subtitle}</span> : null}
      </span>
      {value !== undefined && value !== null ? (
        <span className="shrink-0 text-body text-muted-foreground tabular-nums md:text-subhead">{value}</span>
      ) : null}
      {trailing ? <span className="flex shrink-0 items-center gap-2">{trailing}</span> : null}
      {resolvedAccessory === "chevron" ? (
        <Icon name="chevron-right" className="size-4 shrink-0 text-muted-foreground/70 rtl:rotate-180" />
      ) : resolvedAccessory === "check" ? (
        <Icon name="checkmark" className="size-5 shrink-0 text-accent-foreground" />
      ) : null}
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        replace={replace}
        scroll={scroll}
        aria-current={selected ? "true" : undefined}
        className={rowClass}
      >
        {body}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} disabled={disabled} aria-pressed={resolvedAccessory === "check" ? selected : undefined} className={rowClass}>
        {body}
      </button>
    );
  }
  return <div className={rowClass}>{body}</div>;
}

/** Ligne fantôme à la géométrie d'une `ListRow` (chargement). */
export function ListRowSkeleton({ withSubtitle = true, withLeading = false }: { withSubtitle?: boolean; withLeading?: boolean }) {
  return (
    <div
      aria-hidden
      className={cn(
        "relative flex min-h-11 items-center gap-3 px-4 py-3",
        "before:absolute before:inset-x-0 before:top-0 before:start-4 before:h-px before:bg-separator first:before:hidden",
      )}
    >
      {withLeading ? <span className="size-7 shrink-0 animate-pulse rounded-full bg-fill" /> : null}
      <span className="flex flex-1 flex-col gap-1.5">
        <span className="h-3.5 w-2/5 animate-pulse rounded-full bg-fill" />
        {withSubtitle ? <span className="h-3 w-1/4 animate-pulse rounded-full bg-fill" /> : null}
      </span>
      <span className="h-3.5 w-12 animate-pulse rounded-full bg-fill" />
    </div>
  );
}

/** Corps de section en chargement : `count` lignes fantômes sur fond cellule. */
export function ListSkeleton({ count = 4, withSubtitle, withLeading }: { count?: number; withSubtitle?: boolean; withLeading?: boolean }) {
  return (
    <div role="status" aria-label="Chargement" className="overflow-hidden rounded-section bg-card shadow-card">
      {Array.from({ length: count }, (_, i) => (
        <ListRowSkeleton key={i} withSubtitle={withSubtitle} withLeading={withLeading} />
      ))}
    </div>
  );
}
