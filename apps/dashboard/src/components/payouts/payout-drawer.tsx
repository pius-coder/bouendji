"use client";

import { useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { Icon, type IconName } from "@/components/common/icon";
import { StatusBadge } from "@/components/common/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { formatDateTime, formatXaf } from "@/lib/format";
import {
  approvePayoutAction,
  confirmPayoutAction,
  payPayoutAction,
  resolvePayoutAction,
} from "@/server/actions/payouts.action";
import type { ActionResult } from "@/server/actions/action-result";
import type { Payout } from "@/server/services/payouts/payouts.schema";

export interface PayoutCaps {
  approve: boolean;
  operate: boolean;
}

/**
 * Tiroir de détail (Chariow : 500 px, en-tête identifiant + statut + rangée
 * d'actions, sections à tuile d'icône). Les actions proposées suivent l'état
 * (D65 : pending → approved → processing → paid ; needs_review à trancher) et le
 * rôle ; Fastify revérifie tout (403/409 affichés tels quels).
 */
export function PayoutDrawer({ payout, communityName, caps }: { payout: Payout; communityName: string; caps: PayoutCaps }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [reason, setReason] = useState("");
  const [providerRef, setProviderRef] = useState("");

  function run(label: string, action: () => Promise<ActionResult<{ status: string }>>) {
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        toast.success(label);
        setOpen(false);
      } else toast.error(result.message);
    });
  }

  const s = payout.status;
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm">
          Détails
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full overflow-y-auto sm:max-w-[500px]">
        <SheetHeader>
          <SheetTitle>Versement · {communityName}</SheetTitle>
          <SheetDescription className="flex items-center gap-1.5">
            <Icon name="history" className="size-4" /> {formatDateTime(payout.createdAt)}
          </SheetDescription>
          <div className="pt-2">
            <StatusBadge status={s} />
          </div>
          <div className="flex flex-wrap gap-2 pt-3">
            {s === "pending" && caps.approve ? (
              <Button size="sm" variant="tinted" disabled={pending} onClick={() => run("Versement approuvé", () => approvePayoutAction(payout.id))}>
                {pending ? <Spinner /> : <Icon name="check" />} Approuver
              </Button>
            ) : null}
            {s === "approved" && caps.operate ? (
              <Button size="sm" disabled={pending} onClick={() => run("Virement lancé", () => payPayoutAction(payout.id))}>
                {pending ? <Spinner /> : <Icon name="wallet" />} Payer
              </Button>
            ) : null}
            {s === "processing" && caps.operate ? (
              <Button size="sm" variant="tinted" disabled={pending} onClick={() => run("Réception confirmée", () => confirmPayoutAction(payout.id))}>
                {pending ? <Spinner /> : <Icon name="checkmark" />} Confirmer la réception
              </Button>
            ) : null}
          </div>
        </SheetHeader>

        <div className="flex flex-col gap-6 px-5 pb-6">
          <DrawerSection icon="wallet" title="Montant">
            <Line label="Montant" value={formatXaf(payout.amountXaf)} strong />
            <Line label="Devise" value={payout.currency} />
            <Line label="Référence fournisseur" value={payout.providerRef ?? "—"} />
            <Line label="Tentatives" value={String(payout.attempts)} />
          </DrawerSection>
          <DrawerSection icon="history" title="Étapes">
            <Line label="Créé" value={formatDateTime(payout.createdAt)} />
            <Line label="Approuvé" value={formatDateTime(payout.approvedAt)} />
            <Line label="Pris en charge" value={formatDateTime(payout.claimedAt)} />
            <Line label="Payé" value={formatDateTime(payout.paidAt)} />
            <Line label="Confirmé" value={formatDateTime(payout.confirmedAt)} />
          </DrawerSection>
          {payout.failedReason ? (
            <DrawerSection icon="danger" title="Incident">
              <p className="text-subhead text-destructive">{payout.failedReason}</p>
            </DrawerSection>
          ) : null}
          {s === "needs_review" && caps.operate ? (
            <DrawerSection icon="warning" title="Trancher">
              <p className="text-footnote text-muted-foreground">
                Le fournisseur n&apos;a pas donné de réponse claire. Vérifiez sur son tableau de bord, puis tranchez.
              </p>
              <label className="flex flex-col gap-1.5 text-footnote font-semibold">
                Référence du virement (si payé)
                <Input value={providerRef} onChange={(e) => setProviderRef(e.target.value)} />
              </label>
              <label className="flex flex-col gap-1.5 text-footnote font-semibold">
                Motif (si échoué)
                <Input value={reason} onChange={(e) => setReason(e.target.value)} />
              </label>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  disabled={pending || !providerRef.trim()}
                  onClick={() => run("Marqué payé", () => resolvePayoutAction(payout.id, { outcome: "paid", providerRef }))}
                >
                  Marquer payé
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={pending}
                  onClick={() => run("Marqué échoué", () => resolvePayoutAction(payout.id, { outcome: "failed", reason: reason || undefined }))}
                >
                  Marquer échoué
                </Button>
              </div>
            </DrawerSection>
          ) : null}
          {payout.note ? (
            <DrawerSection icon="pen" title="Note">
              <p className="text-subhead text-foreground">{payout.note}</p>
            </DrawerSection>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}

/** Section du tiroir (Chariow) : petite tuile d'icône + titre gras + filet, puis contenu. */
function DrawerSection({ icon, title, children }: { icon: IconName; title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="flex items-center gap-2 border-b border-border pb-3 text-subhead font-bold text-foreground">
        <span className="grid size-6 place-items-center rounded-md bg-group text-muted-foreground">
          <Icon name={icon} className="size-4" />
        </span>
        {title}
      </h3>
      <div className="flex flex-col gap-2">{children}</div>
    </section>
  );
}

function Line({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 text-subhead">
      <span className="text-muted-foreground">{label}</span>
      <span className={strong ? "font-bold text-foreground tabular-nums" : "text-foreground tabular-nums"}>{value}</span>
    </div>
  );
}
