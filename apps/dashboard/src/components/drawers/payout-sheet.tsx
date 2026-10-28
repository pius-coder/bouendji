"use client";

import * as React from "react";
import { toast } from "sonner";
import { DetailFacts } from "@/components/common/detail-panel";
import { Icon } from "@/components/common/icon";
import { StatusBadge } from "@/components/common/status-badge";
import { EntityLink } from "@/components/drawers/entity-link";
import { shortId } from "@/components/offline/offline-status";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useInvalidateAdmin } from "@/hooks/use-admin-query";
import { formatBps, formatDateTime, formatXaf, NO_VALUE } from "@/lib/format";
import type { ActionResult } from "@/server/actions/action-result";
import {
  approvePayoutAction,
  confirmPayoutAction,
  payPayoutAction,
  resolvePayoutAction,
} from "@/server/actions/payouts.action";
import type { PayoutDetail } from "@/server/services/payouts/payouts.schema";

export interface PayoutSheetCaps {
  approve: boolean;
  operate: boolean;
}

/**
 * Contenu de la fiche versement (`?versement=id`) chargée via `GET /v1/admin/payouts/:payoutId`.
 * Affiche les étapes horodatées, les actions selon le rôle et la liste des commissions
 * incluses (chacune cliquable vers `?commande=`).
 */
export function PayoutSheetBody({
  detail,
  caps,
}: {
  detail: PayoutDetail;
  caps: PayoutSheetCaps;
}) {
  const { commissions } = detail;
  const invalidate = useInvalidateAdmin();
  const [pending, startTransition] = React.useTransition();
  const [reason, setReason] = React.useState("");
  const [providerRef, setProviderRef] = React.useState("");

  const run = (label: string, action: () => Promise<ActionResult<{ status: string }>>) => {
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        toast.success(label);
        await invalidate("/v1/admin/payouts");
      } else {
        toast.error(result.message);
      }
    });
  };

  const s = detail.status;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <StatusBadge status={s} />
          <span className="text-title-3 font-semibold tabular-nums text-foreground">
            {formatXaf(detail.amountXaf)}
          </span>
        </div>

        <div className="flex flex-wrap gap-2">
          {s === "pending" && caps.approve ? (
            <Button
              size="sm"
              disabled={pending}
              onClick={() => run("Versement approuvé", () => approvePayoutAction(detail.id))}
            >
              {pending ? <Spinner /> : <Icon name="check" className="size-4" />}
              Approuver
            </Button>
          ) : null}
          {s === "approved" && caps.operate ? (
            <Button
              size="sm"
              disabled={pending}
              onClick={() => run("Virement lancé", () => payPayoutAction(detail.id))}
            >
              {pending ? <Spinner /> : <Icon name="wallet" className="size-4" />}
              Payer
            </Button>
          ) : null}
          {s === "processing" && caps.operate ? (
            <Button
              size="sm"
              disabled={pending}
              onClick={() => run("Réception confirmée", () => confirmPayoutAction(detail.id))}
            >
              {pending ? <Spinner /> : <Icon name="checkmark" className="size-4" />}
              Confirmer la réception
            </Button>
          ) : null}
        </div>
      </div>

      <DetailFacts
        items={[
          { label: "Montant total", value: formatXaf(detail.amountXaf) },
          { label: "Devise", value: detail.currency },
          { label: "Référence virement", value: detail.providerRef ?? NO_VALUE, mono: true },
          { label: "Tentatives", value: String(detail.attempts) },
          ...(detail.note ? [{ label: "Note", value: detail.note }] : []),
        ]}
      />

      {detail.failedReason ? (
        <div className="rounded-section border border-destructive/30 bg-destructive/10 p-3.5 text-subhead text-destructive">
          <strong>Incident :</strong> {detail.failedReason}
        </div>
      ) : null}

      {s === "needs_review" && caps.operate ? (
        <div className="flex flex-col gap-3 rounded-section border border-separator bg-muted/40 p-4">
          <p className="text-subhead font-semibold text-foreground">Trancher ce versement</p>
          <p className="text-footnote text-muted-foreground">
            Le fournisseur n&apos;a pas donné de réponse claire. Vérifiez sur son tableau de bord, puis tranchez.
          </p>
          <label className="flex flex-col gap-1 text-footnote font-medium">
            Référence du virement (si payé)
            <Input value={providerRef} onChange={(e) => setProviderRef(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-footnote font-medium">
            Motif (si échoué)
            <Input value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              disabled={pending || !providerRef.trim()}
              onClick={() =>
                run("Marqué payé", () =>
                  resolvePayoutAction(detail.id, { outcome: "paid", providerRef }),
                )
              }
            >
              Marquer payé
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={pending}
              onClick={() =>
                run("Marqué échoué", () =>
                  resolvePayoutAction(detail.id, {
                    outcome: "failed",
                    reason: reason || undefined,
                  }),
                )
              }
            >
              Marquer échoué
            </Button>
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        <h4 className="text-subhead font-semibold text-foreground">Étapes horodatées</h4>
        <DetailFacts
          items={[
            { label: "Préparé le", value: formatDateTime(detail.createdAt) },
            { label: "Approuvé le", value: formatDateTime(detail.approvedAt) },
            { label: "Pris en charge le", value: formatDateTime(detail.claimedAt) },
            { label: "Payé le", value: formatDateTime(detail.paidAt) },
            { label: "Confirmé le", value: formatDateTime(detail.confirmedAt) },
          ]}
        />
      </div>

      <div className="flex flex-col gap-2">
        <h4 className="text-subhead font-semibold text-foreground">
          Commissions incluses ({commissions.length})
        </h4>
        {commissions.length === 0 ? (
          <p className="text-footnote text-muted-foreground">Aucune commission rattachée.</p>
        ) : (
          <ul className="divide-y divide-separator overflow-hidden rounded-section border border-separator bg-background">
            {commissions.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <EntityLink kind="commande" id={c.orderId} className="text-subhead">
                    <Icon name="receipt" className="size-3.5 text-muted-foreground" />
                    <span>Commande {shortId(c.orderId)}</span>
                  </EntityLink>
                  <p className="text-caption text-muted-foreground">
                    {formatDateTime(c.createdAt)} · Taux {formatBps(c.bps)}
                  </p>
                </div>
                <span className="text-subhead font-medium tabular-nums text-foreground">
                  {formatXaf(c.amountXaf)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
