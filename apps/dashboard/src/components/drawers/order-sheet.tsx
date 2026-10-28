"use client";

import { DetailFacts } from "@/components/common/detail-panel";
import { Icon } from "@/components/common/icon";
import { StatusBadge } from "@/components/common/status-badge";
import { EntityLink } from "@/components/drawers/entity-link";
import { shortId } from "@/components/offline/offline-status";
import { formatBps, formatDateTime, formatXaf, NO_VALUE } from "@/lib/format";
import type { OrderDetail } from "@/server/services/orders/orders.schema";

/**
 * Contenu de la fiche commande (`?commande=id`) chargée via `GET /v1/admin/orders/:orderId`.
 * Liens cliquables vers l'abonné (`?abonne=`), le forfait (`?forfait=`) et le versement (`?versement=`).
 */
export function OrderSheetBody({ detail }: { detail: OrderDetail }) {
  const commission = detail.commissions?.[0] ?? null;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <StatusBadge status={detail.status} />
        <span className="text-title-3 font-semibold tabular-nums text-foreground">
          {detail.amountXaf !== undefined ? formatXaf(detail.amountXaf) : NO_VALUE}
        </span>
      </div>

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
