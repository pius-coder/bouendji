"use client";

import { useId, useState } from "react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "./button";

export interface ConfirmReason {
  label: string;
  /** Longueur minimale exigée (audit). */
  minLength?: number;
  placeholder?: string;
}

/**
 * Alerte pour une action IRRÉVERSIBLE et peu courante (HIG alerts, règles §7).
 * Titre = la situation ; message court seulement s'il ajoute ; boutons : « Annuler »
 * (focus par défaut) et un verbe qui reprend la conséquence. Reste ouverte pendant
 * l'action (`pending`) ; se ferme si `onConfirm` résout `true`. Motif optionnel.
 */
export function ConfirmAlert({
  open,
  onOpenChange,
  title,
  message,
  confirmLabel,
  destructive = true,
  pending = false,
  error,
  reason,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  message?: string;
  confirmLabel: string;
  destructive?: boolean;
  pending?: boolean;
  /** Échec de l'action : affiché dans l'alerte, qui reste ouverte. */
  error?: string;
  reason?: ConfirmReason;
  /** Retourne `true` pour fermer (succès), `false` pour rester (échec affiché via `error`). */
  onConfirm: (reason: string) => Promise<boolean> | boolean;
}) {
  const [text, setText] = useState("");
  const [touched, setTouched] = useState(false);
  const reasonId = useId();
  const tooShort = reason ? text.trim().length < (reason.minLength ?? 1) : false;

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        if (!next) {
          setText("");
          setTouched(false);
        }
        onOpenChange(next);
      }}
    >
      <AlertDialogContent className="max-w-[20rem] gap-4 rounded-[20px] p-5 sm:max-w-sm">
        <AlertDialogHeader className="items-center text-center sm:text-center">
          <AlertDialogTitle className="text-headline">{title}</AlertDialogTitle>
          {message ? <AlertDialogDescription className="text-subhead">{message}</AlertDialogDescription> : <AlertDialogDescription className="sr-only">{title}</AlertDialogDescription>}
        </AlertDialogHeader>
        {reason ? (
          <div className="flex flex-col gap-1.5">
            <label htmlFor={reasonId} className="px-1 text-footnote font-medium text-muted-foreground">
              {reason.label}
            </label>
            <textarea
              id={reasonId}
              value={text}
              rows={2}
              maxLength={280}
              placeholder={reason.placeholder}
              onChange={(e) => setText(e.target.value)}
              aria-invalid={touched && tooShort ? true : undefined}
              aria-describedby={touched && tooShort ? `${reasonId}-err` : undefined}
              className="min-h-16 rounded-field bg-fill px-3 py-2 text-foreground outline-none placeholder:text-placeholder focus-visible:ring-2 focus-visible:ring-ring"
            />
            {touched && tooShort ? (
              <p id={`${reasonId}-err`} className="px-1 text-footnote text-destructive">
                Indiquez un motif d’au moins {reason.minLength ?? 1} caractères.
              </p>
            ) : null}
          </div>
        ) : null}
        {error ? (
          <p role="alert" className="text-center text-footnote text-destructive">
            {error}
          </p>
        ) : null}
        <AlertDialogFooter className="grid grid-cols-2 gap-2 sm:grid-cols-2">
          <AlertDialogCancel autoFocus disabled={pending} className="h-11 rounded-full border-0 bg-fill text-body font-semibold md:text-subhead">
            Annuler
          </AlertDialogCancel>
          <Button
            variant={destructive ? "destructive" : "prominent"}
            loading={pending}
            onClick={async () => {
              setTouched(true);
              if (tooShort) return;
              const close = await onConfirm(text.trim());
              if (close) {
                setText("");
                setTouched(false);
                onOpenChange(false);
              }
            }}
          >
            {confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
