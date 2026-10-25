import Link from "next/link";
import type { ReactNode } from "react";
import type { IconName } from "@/components/common/icon";
import { Icon } from "@/components/common/icon";
import { IconTile, type Tone } from "@/components/page/icon-tile";
import { cn } from "@/lib/utils";

export interface HomeRowProps {
  href: string;
  /** Remplace l'historique : ouverture du détail dans l'URL (`h_open`), sans quitter l'accueil. */
  replace?: boolean;
  scroll?: boolean;
  /** Élément ouvert dans le panneau de détail. */
  selected?: boolean;
  icon: IconName;
  tone?: Tone;
  title: ReactNode;
  subtitle?: ReactNode;
  /** Valeur alignée à droite (montant, compte) : chiffres tabulaires. */
  value?: ReactNode;
  /** Pastille de statut, placée avant la valeur. Le parent la masque sur mobile si besoin. */
  trailing?: ReactNode;
}

/**
 * Ligne de l'accueil au style Chariow : carte blanche à bordure fine (sans ombre), tuile
 * d'icône à gauche, titre et sous-titre, valeur à droite. Toute la carte est le lien.
 * Serveur par défaut : aucun état ici.
 */
export function HomeRow({ href, replace, scroll, selected = false, icon, tone = "neutral", title, subtitle, value, trailing }: HomeRowProps) {
  return (
    <Link
      href={href}
      replace={replace}
      scroll={scroll}
      aria-current={selected ? "true" : undefined}
      className={cn(
        "flex min-h-14 items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5 outline-none transition-[background-color,border-color] duration-150",
        "[@media(hover:hover)]:hover:border-control-border focus-visible:ring-2 focus-visible:ring-ring",
        selected && "border-foreground/40",
      )}
    >
      <IconTile name={icon} tone={tone} size="md" />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-subhead font-semibold text-foreground">{title}</span>
        {subtitle ? <span className="truncate text-footnote text-muted-foreground">{subtitle}</span> : null}
      </span>
      {trailing ? <span className="flex shrink-0 items-center">{trailing}</span> : null}
      {value !== undefined && value !== null ? (
        <span className="shrink-0 text-end text-subhead font-semibold text-foreground tabular-nums">{value}</span>
      ) : null}
      <Icon name="chevron-right" className="size-4 shrink-0 text-muted-foreground/70 rtl:rotate-180" />
    </Link>
  );
}

/** Squelette des lignes de l'accueil : même géométrie que `HomeRow`, sans décalage au chargement. */
export function HomeRowsSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div role="status" aria-label="Chargement" className="flex flex-col gap-2">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} aria-hidden className="flex min-h-14 items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5">
          <span className="size-10 shrink-0 animate-pulse rounded-xl bg-fill" />
          <span className="flex flex-1 flex-col gap-1.5">
            <span className="h-3.5 w-2/5 animate-pulse rounded-full bg-fill" />
            <span className="h-3 w-1/4 animate-pulse rounded-full bg-fill" />
          </span>
          <span className="h-3.5 w-12 animate-pulse rounded-full bg-fill" />
        </div>
      ))}
    </div>
  );
}
