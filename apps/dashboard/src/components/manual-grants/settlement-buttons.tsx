"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { Icon } from "@/components/common/icon";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { formatXaf } from "@/lib/format";
import { createSettlementAction, refreshSettlementAction } from "@/server/actions/manual-grants.action";

/**
 * « Verser » (105, décision owner 4) : crée le versement du total dû et ouvre le
 * lien de paiement Fapshi. L'onglet est ouvert au clic (geste utilisateur, sinon
 * le navigateur le bloque), puis dirigé vers Fapshi quand l'API a répondu. Si le
 * navigateur refuse l'onglet, le lien reste affiché ici.
 */
export function SettleButton({ communityId, totalXaf }: { communityId: string; totalXaf: number }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [link, setLink] = React.useState<string | null>(null);

  const pay = () => {
    const tab = window.open("", "_blank");
    if (tab) tab.opener = null;
    startTransition(async () => {
      const result = await createSettlementAction(communityId);
      if (!result.ok) {
        tab?.close();
        toast.error(result.message);
        return;
      }
      setLink(result.data.paymentUrl);
      if (tab) tab.location.href = result.data.paymentUrl;
      toast.success("Lien de paiement créé", {
        description: "Payez sur la page Fapshi. Les accès passent « réglés » dès la confirmation du paiement.",
      });
      router.refresh();
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" disabled={pending || totalXaf <= 0} onClick={pay}>
        {pending ? <Spinner /> : <Icon name="wallet" className="size-4" />}
        Verser {formatXaf(totalXaf)}
      </Button>
      {link ? (
        <Button asChild variant="outline">
          <a href={link} target="_blank" rel="noopener noreferrer">
            Ouvrir le paiement
          </a>
        </Button>
      ) : null}
    </div>
  );
}

/** Revérifie un versement chez Fapshi (le statut vient du fournisseur, jamais de ce bouton). */
export function RefreshSettlementButton({ settlementId }: { settlementId: string }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  const refresh = () => {
    startTransition(async () => {
      const result = await refreshSettlementAction(settlementId);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      const { settlement, settledGrants } = result.data;
      if (settlement.status === "paid" || settlement.status === "needs_review") {
        toast.success("Paiement confirmé", {
          description: settledGrants > 0 ? `${settledGrants} accès réglé${settledGrants > 1 ? "s" : ""}.` : undefined,
        });
      } else if (settlement.status === "failed") {
        toast.error("Paiement non abouti. Relancez un versement.");
      } else {
        toast("Paiement pas encore confirmé par l'opérateur.");
      }
      router.refresh();
    });
  };

  return (
    <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={refresh}>
      {pending ? <Spinner /> : <Icon name="refresh" className="size-4" />}
      Vérifier
    </Button>
  );
}
