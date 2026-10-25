"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Icon } from "@/components/common/icon";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { formatXaf } from "@/lib/format";
import { preparePayoutAction } from "@/server/actions/payouts.action";

/**
 * Préparer un versement : regroupe les commissions dues d'une communauté. Proposé
 * aux seules communautés où l'utilisateur est `finance` (payout.create).
 */
export function PreparePayoutSheet({ communities }: { communities: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const [communityId, setCommunityId] = useState(communities[0]?.id ?? "");
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      const result = await preparePayoutAction(communityId, note);
      if (result.ok) {
        const { amountXaf, commissionCount } = result.data;
        toast.success(`Versement préparé · ${formatXaf(amountXaf)} · ${commissionCount} commission${commissionCount > 1 ? "s" : ""}`);
        setNote("");
        setOpen(false);
      } else toast.error(result.message);
    });
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button>
          <Icon name="plus" /> Préparer un versement
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-[500px]">
        <SheetHeader>
          <SheetTitle>Préparer un versement</SheetTitle>
          <SheetDescription>Toutes les commissions dues de la communauté sont regroupées. Il faudra ensuite l&apos;approuver.</SheetDescription>
        </SheetHeader>
        <FieldGroup className="px-5">
          <Field>
            <FieldLabel htmlFor="payout-community">Communauté</FieldLabel>
            <select
              id="payout-community"
              value={communityId}
              onChange={(e) => setCommunityId(e.target.value)}
              className="h-11 rounded-xl border border-input bg-card px-3 sm:h-10"
            >
              {communities.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field>
            <FieldLabel htmlFor="payout-note">Note</FieldLabel>
            <Textarea id="payout-note" rows={3} maxLength={280} value={note} onChange={(e) => setNote(e.target.value)} />
            <FieldDescription>Facultatif, 280 caractères au plus.</FieldDescription>
          </Field>
        </FieldGroup>
        <SheetFooter>
          <Button disabled={pending || !communityId} onClick={submit}>
            {pending ? <Spinner /> : null} Préparer
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
