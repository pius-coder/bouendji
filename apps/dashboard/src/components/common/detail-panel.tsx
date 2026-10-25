"use client";

import { Icon } from "./icon";
import { useRouter } from "next/navigation";
import { useTransition, type ReactNode } from "react";
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from "@/components/ui/drawer";
import { PANEL_QUERY, useMediaQuery } from "@/hooks/use-media-query";
import { cn } from "@/lib/utils";
import { Button } from "./button";
import { NavBarButton } from "./nav-bar-button";

/**
 * Détail d'un élément ouvert depuis une liste ou une table (règles §6–7).
 * ≥ 1280 px : colonne droite collante à côté de la liste (pas de superposition,
 * orya `DetailFrame`) ; en dessous : feuille plein écran.
 * L'ouverture vit dans l'URL (`<prefix>_open`) : le serveur rend `children` ;
 * `closeHref` est l'URL sans ce paramètre. Server first : aucune donnée chargée ici.
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
  const desktop = useMediaQuery(PANEL_QUERY);
  const router = useRouter();
  const [, startTransition] = useTransition();
  const close = () => startTransition(() => router.replace(closeHref, { scroll: false }));

  const content = (heading: ReactNode) => (
    <>
      <div className="flex shrink-0 items-start gap-2 px-4 pt-3 pb-2">
        <div className="min-w-0 flex-1">
          {heading}
          {subtitle ? <p className="truncate text-footnote text-muted-foreground">{subtitle}</p> : null}
        </div>
        {desktop ? (
          <NavBarButton label="Fermer le détail" onClick={close} className="-me-2 -mt-1 text-muted-foreground">
            <Icon name="close" />
          </NavBarButton>
        ) : (
          <Button variant="plain" size="sm" onClick={close} className="-me-2">
            OK
          </Button>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4">
        <div className="flex flex-col gap-6">{children}</div>
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap justify-end gap-2 px-4 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[inset_0_1px_0_var(--separator)]">
          {actions}
        </div>
      ) : null}
    </>
  );

  if (desktop) {
    return (
      <aside
        aria-label={title}
        className={cn(
          "hidden min-w-0 flex-col rounded-section bg-card xl:sticky xl:top-[calc(var(--topbar-h)+1rem)] xl:flex",
          "xl:max-h-[calc(100dvh-var(--topbar-h)-2rem)] xl:self-start",
        )}
      >
        {content(<h2 className="truncate text-headline text-foreground">{title}</h2>)}
      </aside>
    );
  }

  return (
    <Drawer open onOpenChange={(open) => (!open ? close() : undefined)}>
      <DrawerContent className="h-[100dvh] max-h-[100dvh] rounded-none bg-background data-[vaul-drawer-direction=bottom]:mt-0 data-[vaul-drawer-direction=bottom]:max-h-[100dvh] data-[vaul-drawer-direction=bottom]:rounded-t-none">
        <div className="pt-[env(safe-area-inset-top)]" />
        <DrawerDescription className="sr-only">Détail</DrawerDescription>
        {content(<DrawerTitle className="truncate text-title-3 font-bold text-foreground">{title}</DrawerTitle>)}
      </DrawerContent>
    </Drawer>
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

/** Squelette du panneau (à la géométrie des faits). */
export function DetailPanelSkeleton() {
  return (
    <aside aria-hidden className="hidden flex-col gap-4 rounded-section bg-card p-4 xl:flex">
      <span className="h-5 w-1/2 animate-pulse rounded-full bg-fill" />
      <div className="flex flex-col gap-3 rounded-section bg-background p-4">
        {Array.from({ length: 5 }, (_, i) => (
          <span key={i} className="h-3.5 w-full animate-pulse rounded-full bg-fill" />
        ))}
      </div>
    </aside>
  );
}
