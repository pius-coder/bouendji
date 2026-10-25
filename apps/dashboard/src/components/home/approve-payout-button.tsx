"use client";

import { useState, useTransition } from "react";
import { ConfirmAlert } from "@/components/common/confirm-alert";
import { notify } from "@/components/common/toast";
import { Button } from "@/components/ui/button";
import { approvePayoutAction } from "@/server/actions/payouts.action";

/**
 * Approuver un versement depuis le détail. Action d'argent : confirmation explicite,
 * l'alerte reste ouverte pendant l'appel ; l'API refuse l'auto-approbation (409),
 * le message de l'API est montré tel quel dans l'alerte.
 */
export function ApprovePayoutButton({ payoutId, amountLabel }: { payoutId: string; amountLabel: string }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        Approuver
      </Button>
      <ConfirmAlert
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setError(undefined);
        }}
        title={`Approuver le versement de ${amountLabel} ?`}
        message="Le versement passera à l’étape « Approuvé ». Le paiement reste une étape séparée."
        confirmLabel="Approuver"
        destructive={false}
        pending={pending}
        error={error}
        onConfirm={() =>
          new Promise<boolean>((resolve) =>
            startTransition(async () => {
              const result = await approvePayoutAction(payoutId);
              if (result.ok) {
                notify.success("Versement approuvé");
                resolve(true);
              } else {
                setError(result.message || "Impossible d’approuver ce versement.");
                resolve(false);
              }
            }),
          )
        }
      />
    </>
  );
}
