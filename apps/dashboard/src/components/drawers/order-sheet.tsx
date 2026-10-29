"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { DetailFacts } from "@/components/common/detail-panel";
import { Icon } from "@/components/common/icon";
import { StatusBadge } from "@/components/common/status-badge";
import { EntityLink } from "@/components/drawers/entity-link";
import { shortId } from "@/components/offline/offline-status";
import { formatBps, formatDateTime, formatXaf, NO_VALUE } from "@/lib/format";
import { reconcileOrderAction } from "@/server/actions/orders.action";
import type { OrderDetail } from "@/server/services/orders/orders.schema";
import { Button } from "@/components/ui/button";
import { canOfferPaymentReconciliation } from "@/components/orders/order-reconciliation";

/**
 * Contenu de la fiche commande (`?commande=id`) chargée via `GET /v1/admin/orders/:orderId`.
 * Liens cliquables vers l'abonné (`?abonne=`), le forfait (`?forfait=`) et le versement (`?versement=`).
 */
export function OrderSheetBody({ detail, canReconcile = false }: { detail: OrderDetail; canReconcile?: boolean }) {
  const commission = detail.commissions?.[0] ?? null;
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const showReconcile = canOfferPaymentReconciliation(detail, canReconcile);

  function reconcile() {
    startTransition(async () => {
      const result = await reconcileOrderAction(detail.id);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success(result.data.activated ? "Paiement vérifié et forfait activé." : "Paiement vérifié. Aucun changement d'activation.");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <StatusBadge status={detail.status} />
        <span className="text-title-3 font-semibold tabular-nums text-foreground">
          {detail.amountXaf !== undefined ? formatXaf(detail.amountXaf) : NO_VALUE}
        </span>
      </div>

      {showReconcile ? (
        <div className="rounded-xl bg-group p-4">
          <p className="text-subhead font-semibold text-foreground">Paiement ou activation en attente</p>
          <p className="mt-1 text-footnote text-muted-foreground">
            Vérifiez le fournisseur et reprenez l&apos;activation sans créer un second paiement.
          </p>
          <Button type="button" className="mt-3" disabled={pending} onClick={reconcile}>
            {pending ? "Vérification…" : "Vérifier le paiement"}
          </Button>
        </div>
      ) : null}

      <DetailFacts
        items={[
          {
            label: "Abonné",
            value: detail.userId ? (
              <EntityLink kind="abonne" id={detail.userId}>
                <Icon name="users" className="size-3.5 text-muted-foreground" />
                <span>{detail.userName || shortId(detail.userId)}</span>
              </EntityLink>
            ) : (
              NO_VALUE
            ),
          },
          {
            label: "Forfait",
            value: (
              <EntityLink kind="forfait" id={detail.planId}>
                <Icon name="tag" className="size-3.5 text-muted-foreground" />
                <span>{detail.planName || detail.planCode || shortId(detail.planId)}</span>
              </EntityLink>
            ),
          },
          {
            label: "Montant",
            value: detail.amountXaf !== undefined ? formatXaf(detail.amountXaf) : NO_VALUE,
          },
          { label: "Devise", value: detail.currency },
          {
            label: "Référence paiement",
            value: detail.providerRef || NO_VALUE,
            mono: true,
          },
        ]}
      />

      {commission ? (
        <div className="flex flex-col gap-2">
          <h4 className="text-subhead font-semibold text-foreground">Commission communauté</h4>
          <DetailFacts
            items={[
              { label: "Montant commission", value: formatXaf(commission.amountXaf) },
              { label: "Taux appliqué", value: formatBps(commission.bps) },
              { label: "Statut", value: <StatusBadge status={commission.status} /> },
              ...(commission.payoutId
                ? [
                    {
                      label: "Versement associé",
                      value: (
                        <EntityLink kind="versement" id={commission.payoutId}>
                          <Icon name="wallet" className="size-3.5 text-muted-foreground" />
                          <span>Versement {shortId(commission.payoutId)}</span>
                        </EntityLink>
                      ),
                    },
                  ]
                : []),
            ]}
          />
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        <h4 className="text-subhead font-semibold text-foreground">Chronologie</h4>
        <DetailFacts
          items={[
            { label: "Créée le", value: formatDateTime(detail.createdAt) },
            { label: "Payée le", value: formatDateTime(detail.paidAt) },
            { label: "Activée le", value: formatDateTime(detail.activatedAt) },
          ]}
        />
      </div>
    </div>
  );
}
