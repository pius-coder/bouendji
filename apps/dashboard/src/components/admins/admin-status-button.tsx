"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/page/confirm-dialog";
import { Button } from "@/components/ui/button";
import { setAdminStatusAction } from "@/server/actions/admins.action";

export function AdminStatusButton({ adminId, name, active }: { adminId: string; name: string; active: boolean }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const next = !active;

  function submit() {
    startTransition(async () => {
      const result = await setAdminStatusAction(adminId, next);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      setOpen(false);
      toast.success(result.data.active ? "Compte réactivé." : "Compte suspendu et sessions fermées.");
    });
  }

  return (
    <>
      <Button variant={active ? "outline" : "default"} size="sm" className="min-h-11 sm:min-h-9" onClick={() => setOpen(true)}>
        {active ? "Suspendre" : "Réactiver"}
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={`${active ? "Suspendre" : "Réactiver"} ${name} ?`}
        description={
          active
            ? "Le compte ne pourra plus accéder au dashboard et toutes ses sessions seront fermées immédiatement."
            : "Le compte pourra de nouveau se connecter avec son mot de passe actuel."
        }
        confirmLabel={active ? "Suspendre le compte" : "Réactiver le compte"}
        pending={pending}
        onConfirm={submit}
      />
    </>
  );
}
