"use client";

import { useRouter } from "next/navigation";
import { useTransition, type ReactNode } from "react";
import { ResponsiveSheet } from "@/components/drawers/responsive-sheet";
import { cn } from "@/lib/utils";

/**
 * Détail d'un élément ouvert depuis une liste ou une table. Rendu par la feuille unique
 * `ResponsiveSheet` (≥ 768 px : feuille à droite ; en dessous : feuille du bas). L'ouverture
 * vit dans l'URL : `closeHref` est l'URL sans le paramètre d'ouverture. Server first :
 * aucune donnée chargée ici, `children` vient du serveur.
 */
export function DetailPanel({
  title,
  subtitle,
  closeHref,
  actions,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  closeHref: string;
  /** Actions du détail (pied). L'action principale en dernier. */
  actions?: ReactNode;
  children: ReactNode;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const close = () => startTransition(() => router.replace(closeHref, { scroll: false }));

  return (
    <ResponsiveSheet
      open
      onOpenChange={(open) => (!open ? close() : undefined)}
      title={title}
      description={subtitle}
      cancelLabel="OK"
      footer={actions ? <div className="flex flex-wrap justify-end gap-2">{actions}</div> : undefined}
    >
      <div className="flex flex-col gap-6">{children}</div>
    </ResponsiveSheet>
  );
}

/** Faits clé/valeur d'un détail : lignes « Titre … Valeur » sur une cellule. */
export function DetailFacts({ items }: { items: readonly { label: string; value: ReactNode; mono?: boolean }[] }) {
  return (
    <dl className="overflow-hidden rounded-section bg-background">
      {items.map((item) => (
        <div
          key={item.label}
          className="relative flex min-h-11 items-center justify-between gap-4 px-4 py-2 before:absolute before:inset-x-0 before:top-0 before:start-4 before:h-px before:bg-separator first:before:hidden"
        >
          <dt className="shrink-0 text-subhead text-muted-foreground">{item.label}</dt>
          <dd className={cn("min-w-0 text-end text-subhead text-foreground tabular-nums break-words select-text", item.mono && "font-mono text-footnote")}>
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
