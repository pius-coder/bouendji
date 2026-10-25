"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/page/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { setEndpointHealthAction } from "@/server/actions/network.action";

const FORCE_DOWN_LABEL = "Forcer hors service";
const RESTORE_LABEL = "Rétablir";
const REASON_LABEL = "Motif (facultatif)";

/** Propriétaire seulement (l'API refuse les autres). Pas d'écriture optimiste : la liste est relue. */
export function ForceHealthButton({ endpointId, label, health }: { endpointId: string; label: string; health: string }) {
  const goingDown = health !== "down";
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();

  function apply() {
    startTransition(async () => {
      const result = await setEndpointHealthAction(endpointId, goingDown ? "down" : "healthy", reason || undefined);
      if (result.ok) {
        setOpen(false);
        setReason("");
        toast.success(
          result.data.changed ? (goingDown ? "Nœud forcé hors service" : "Nœud rétabli") : "Aucun changement : état déjà appliqué",
        );
      } else {
        toast.error(result.details?.reason ?? result.message);
      }
    });
  }

  return (
    <>
      <Button variant="outline" size="sm" className="min-h-11 sm:min-h-9" onClick={() => setOpen(true)}>
        {goingDown ? FORCE_DOWN_LABEL : RESTORE_LABEL}
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={goingDown ? `Forcer « ${label} » hors service ?` : `Rétablir « ${label} » ?`}
        description={
          goingDown
            ? "Le nœud sort du pool distribué aux appareils jusqu'à son rétablissement."
            : "Le nœud revient dans le pool distribué aux appareils."
        }
        confirmLabel={goingDown ? FORCE_DOWN_LABEL : RESTORE_LABEL}
        pending={pending}
        onConfirm={apply}
      >
        {goingDown && (
          <Field className="px-4 pb-2 sm:px-0">
            <FieldLabel htmlFor={`reason-${endpointId}`}>{REASON_LABEL}</FieldLabel>
            <Input
              id={`reason-${endpointId}`}
              className="h-11"
              maxLength={200}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>
        )}
      </ConfirmDialog>
    </>
  );
}
