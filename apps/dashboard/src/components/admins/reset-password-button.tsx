"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/page/confirm-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { resetAdminPasswordAction } from "@/server/actions/admins.action";
import type { AdminResetResult } from "@/server/services/admins/admins.schema";

/**
 * Réinitialisation du mot de passe d'un admin, par l'owner. Confirmation, puis
 * affichage unique du provisoire (copie, ou envoi WhatsApp si le numéro existe).
 */
export function ResetPasswordButton({ adminId, name }: { adminId: string; name: string }) {
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<AdminResetResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  function reset() {
    startTransition(async () => {
      const outcome = await resetAdminPasswordAction(adminId);
      if (outcome.ok) {
        setConfirming(false);
        setResult(outcome.data);
      } else {
        toast.error(outcome.message);
      }
    });
  }

  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Copie impossible", { description: "Sélectionnez le mot de passe et copiez-le à la main." });
    }
  }

  return (
    <>
      <Button variant="outline" size="sm" className="min-h-11 sm:min-h-9" onClick={() => setConfirming(true)}>
        Réinitialiser le mot de passe
      </Button>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Réinitialiser le mot de passe de ${name} ?`}
        description="Le mot de passe actuel ne marchera plus et ses sessions seront fermées. Il devra en choisir un nouveau à sa prochaine connexion."
        confirmLabel="Réinitialiser"
        pending={pending}
        onConfirm={reset}
      />
      <Dialog open={result !== null} onOpenChange={(next) => !next && setResult(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mot de passe provisoire de {name}</DialogTitle>
            <DialogDescription>Affiché une seule fois. Transmettez-le maintenant : il n’est pas conservé.</DialogDescription>
          </DialogHeader>
          <p className="select-all rounded-xl bg-muted/40 px-4 py-3 text-center font-mono text-title-3">{result?.temporaryPassword}</p>
          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <Button variant="outline" className="min-h-11 w-full" onClick={() => result && copy(result.temporaryPassword)}>
              {copied ? "Copié" : "Copier le mot de passe"}
            </Button>
            {result?.whatsappLink ? (
              <Button asChild className="min-h-11 w-full">
                <a href={result.whatsappLink} target="_blank" rel="noopener noreferrer">
                  Envoyer sur WhatsApp
                </a>
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
