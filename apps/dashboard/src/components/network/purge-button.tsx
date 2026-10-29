"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/page/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/common/icon";
import { purgeExpiredEndpointsAction } from "@/server/actions/network.action";

export function PurgeExpiredButton() {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function handlePurge() {
    startTransition(async () => {
      const result = await purgeExpiredEndpointsAction();
      if (result.ok) {
        setOpen(false);
        const count = result.data.purgedCount;
        if (count > 0) {
          toast.success(`${count} serveur(s) expiré(s) purgé(s)`);
        } else {
          toast.info("Aucun serveur expiré à purger");
        }
      } else {
        toast.error(result.message);
      }
    });
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="min-h-11 gap-1.5 text-muted-foreground hover:text-foreground sm:min-h-9"
        onClick={() => setOpen(true)}
      >
        <Icon name="trash" className="size-4" />
        <span>Purger les expirés</span>
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Purger les serveurs expirés ?"
        description="Tous les nœuds du pool dont la date de validité est dépassée ou marqués expirés seront retirés définitivement de la base."
        confirmLabel="Purger maintenant"
        pending={pending}
        onConfirm={handlePurge}
      />
    </>
  );
}
