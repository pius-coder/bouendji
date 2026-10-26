"use client";

import { useState, type ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from "@/components/ui/drawer";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { useMediaQuery, WIDE_QUERY } from "@/hooks/use-media-query";
import { cn } from "@/lib/utils";
import { Button } from "@/components/common/button";

export interface SheetAction {
  label: string;
  /** Soumet le formulaire `form` (id) plutôt qu'un clic : la validation reste celle du formulaire. */
  form?: string;
  onClick?: () => void;
  loading?: boolean;
  loadingLabel?: string;
  /** Réservé à l'impossibilité réelle (rien à enregistrer) : la validation se fait à l'envoi (D83). */
  disabled?: boolean;
}

/**
 * Feuille unique du dashboard (fusion de l'ancienne feuille responsive et du panneau de détail).
 * En-tête iOS : « Annuler » au début, titre au centre, action à la fin. Au-delà de 768 px : feuille
 * latérale droite ; en dessous : feuille du bas avec poignée, jusqu'92 % de la hauteur.
 * `dirty` : fermer demande de confirmer l'abandon. Une seule feuille à la fois.
 */
export function ResponsiveSheet({
  open,
  onOpenChange,
  title,
  description,
  cancelLabel = "Annuler",
  action,
  dirty = false,
  children,
  footer,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** Phrase ou contenu sous le titre ; sinon le titre seul est annoncé. */
  description?: ReactNode;
  cancelLabel?: string;
  action?: SheetAction;
  dirty?: boolean;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  const wide = useMediaQuery(WIDE_QUERY);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const busy = Boolean(action?.loading);

  function requestClose(next: boolean) {
    if (next) return onOpenChange(true);
    if (busy) return;
    if (dirty) return setConfirmDiscard(true);
    onOpenChange(false);
  }

  const header = (
    <div className="grid min-h-14 shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-2 px-2">
      <div className="flex justify-start">
        <Button variant="plain" size="sm" className="font-normal" onClick={() => requestClose(false)} disabled={busy}>
          {cancelLabel}
        </Button>
      </div>
      <div className="min-w-0 text-center">
        {wide ? (
          <SheetTitle className="truncate text-headline">{title}</SheetTitle>
        ) : (
          <DrawerTitle className="truncate text-headline">{title}</DrawerTitle>
        )}
      </div>
      <div className="flex justify-end">
        {action ? (
          <Button
            variant="prominent"
            size="sm"
            type={action.form ? "submit" : "button"}
            form={action.form}
            onClick={action.onClick}
            loading={action.loading}
            loadingLabel={action.loadingLabel}
            disabled={action.disabled}
          >
            {action.label}
          </Button>
        ) : null}
      </div>
    </div>
  );

  const descriptionNode = description ? (
    wide ? (
      <SheetDescription className="px-4 pb-2 text-subhead text-muted-foreground">{description}</SheetDescription>
    ) : (
      <DrawerDescription className="px-4 pb-2 text-subhead text-muted-foreground">{description}</DrawerDescription>
    )
  ) : wide ? (
    <SheetDescription className="sr-only">{title}</SheetDescription>
  ) : (
    <DrawerDescription className="sr-only">{title}</DrawerDescription>
  );

  const body = (
    <>
      {header}
      {descriptionNode}
      <div className={cn("min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-2 pb-6", className)}>{children}</div>
      {footer ? <div className="shrink-0 px-4 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))]">{footer}</div> : null}
    </>
  );

  return (
    <>
      {wide ? (
        <Sheet open={open} onOpenChange={requestClose}>
          <SheetContent side="right" showCloseButton={false} className="w-full gap-0 bg-background p-0 sm:max-w-md">
            {body}
          </SheetContent>
        </Sheet>
      ) : (
        <Drawer open={open} onOpenChange={requestClose} repositionInputs={false}>
          <DrawerContent className="max-h-[92dvh] bg-background data-[vaul-drawer-direction=bottom]:max-h-[92dvh] data-[vaul-drawer-direction=bottom]:rounded-t-[20px]">
            {body}
          </DrawerContent>
        </Drawer>
      )}
      <AlertDialog open={confirmDiscard} onOpenChange={setConfirmDiscard}>
        <AlertDialogContent className="max-w-xs gap-3 text-center sm:max-w-sm">
          <AlertDialogHeader className="items-center text-center">
            <AlertDialogTitle className="text-headline">Abandonner les modifications ?</AlertDialogTitle>
            <AlertDialogDescription>Les changements non enregistrés seront perdus.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel autoFocus>Continuer la saisie</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive-solid text-white hover:bg-destructive-solid/90"
              onClick={() => {
                setConfirmDiscard(false);
                onOpenChange(false);
              }}
            >
              Abandonner
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
