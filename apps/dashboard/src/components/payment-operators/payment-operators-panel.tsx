"use client";

import * as React from "react";
import { toast } from "sonner";
import { Icon } from "@/components/common/icon";
import { StatusBadge } from "@/components/common/status-badge";
import { Section } from "@/components/page/section";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { formatDateTime } from "@/lib/format";
import { setPaymentOperatorAction } from "@/server/actions/payment-operators.action";
import {
  CUT_WARNING,
  MANUAL_NOTICE,
  NOTICE_PREVIEW,
  noticeModeOf,
  type NoticeMode,
  type PaymentOperator,
  type PaymentOperatorStatus,
  type PaymentOperatorsState,
} from "@/server/services/payment-operators/payment-operators.schema";

interface PendingCut {
  operator: PaymentOperator;
  label: string;
  resulting: NoticeMode;
}

/**
 * Page owner « Paiements » (106) : deux interrupteurs, Orange Money et MTN MoMo.
 * Couper un opérateur demande une confirmation ; le rétablir est immédiat.
 * L'API relit le réglage à chaque ouverture de la page d'avis.
 */
export function PaymentOperatorsPanel({ initialState }: { initialState: PaymentOperatorsState }) {
  const [items, setItems] = React.useState<PaymentOperatorStatus[]>(initialState.items);
  const [busy, setBusy] = React.useState<PaymentOperator | null>(null);
  const [pendingCut, setPendingCut] = React.useState<PendingCut | null>(null);
  const [, startTransition] = React.useTransition();
  const canManage = initialState.canManage;

  const mode = noticeModeOf(items);
  const preview = NOTICE_PREVIEW[mode];

  function apply(operator: PaymentOperator, available: boolean) {
    const previous = items;
    setItems((current) => current.map((i) => (i.operator === operator ? { ...i, available } : i)));
    setBusy(operator);
    startTransition(async () => {
      const result = await setPaymentOperatorAction(operator, { available });
      setBusy(null);
      if (!result.ok) {
        setItems(previous);
        toast.error(result.message);
        return;
      }
      setItems(result.data.items);
      const label = result.data.items.find((i) => i.operator === operator)?.label ?? operator;
      toast.success(available ? `${label} est de nouveau proposé.` : `${label} est marqué indisponible.`);
    });
  }

  function onToggle(item: PaymentOperatorStatus, next: boolean) {
    if (next) {
      apply(item.operator, true);
      return;
    }
    const resulting = noticeModeOf(items.map((i) => (i.operator === item.operator ? { ...i, available: false } : i)));
    setPendingCut({ operator: item.operator, label: item.label, resulting });
  }

  return (
    <div className="flex flex-col gap-6">
      <p role="note" className="flex items-start gap-2 rounded-xl border border-border bg-info-soft px-4 py-3 text-footnote text-info-text">
        <Icon name="info" className="mt-0.5 size-4 shrink-0" />
        <span>
          <strong className="font-semibold">{MANUAL_NOTICE}</strong> L&apos;état ne change que lorsque vous le modifiez ici : une panne chez
          Fapshi ou chez un opérateur n&apos;est pas repérée par la plateforme.
        </span>
      </p>

      {mode !== "direct" ? (
        <p
          role="status"
          className={
            mode === "both_down"
              ? "flex items-start gap-2 rounded-xl border border-border bg-danger-soft px-4 py-3 text-footnote text-destructive"
              : "flex items-start gap-2 rounded-xl border border-border bg-warning-soft px-4 py-3 text-footnote text-warning-text"
          }
        >
          <Icon name="warning" className="mt-0.5 size-4 shrink-0" />
          <span>{CUT_WARNING[mode]}</span>
        </p>
      ) : null}

      <Section
        title="Opérateurs proposés par Fapshi"
        description="Coupez un opérateur quand il ne fonctionne plus. Les commandes déjà créées suivent aussi le réglage : il est relu à chaque ouverture de la page de paiement."
      >
        <ul className="divide-y divide-separator overflow-hidden rounded-section border border-separator bg-background">
          {items.map((item) => (
            <li key={item.operator} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div className="flex min-w-0 flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-subhead font-medium text-foreground">{item.label}</span>
                  <StatusBadge status={item.available ? "operator_available" : "operator_unavailable"} />
                </div>
                <span className="text-footnote text-muted-foreground">
                  {item.updatedAt
                    ? `Modifié le ${formatDateTime(item.updatedAt)}${item.updatedByName ? ` par ${item.updatedByName}` : ""}`
                    : "Jamais modifié : disponible par défaut."}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {busy === item.operator ? <Spinner /> : null}
                <Switch
                  checked={item.available}
                  onCheckedChange={(next) => onToggle(item, next)}
                  disabled={!canManage || busy !== null}
                  aria-label={`${item.label} : disponible`}
                />
              </div>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Ce que voit l'abonné" description="Aperçu de la page affichée avant le paiement, pour l'état ci-dessus.">
        <div className="flex flex-col gap-2 rounded-section border border-separator bg-background p-4">
          <span className="text-subhead font-semibold text-foreground">{preview.title}</span>
          <p className="text-footnote leading-relaxed text-muted-foreground">{preview.message}</p>
          <span className="text-footnote font-medium text-foreground">
            {mode === "direct"
              ? "Redirection directe vers Fapshi."
              : preview.withCheckout
                ? "Bouton « Continuer vers le paiement » vers Fapshi."
                : "Aucun bouton vers le paiement."}
          </span>
        </div>
      </Section>

      <AlertDialog open={pendingCut !== null} onOpenChange={(open) => (open ? null : setPendingCut(null))}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Marquer {pendingCut?.label ?? "cet opérateur"} indisponible ?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingCut && pendingCut.resulting !== "direct" ? CUT_WARNING[pendingCut.resulting] : null} Vous pourrez le rétablir à tout
              moment depuis cette page.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingCut) apply(pendingCut.operator, false);
                setPendingCut(null);
              }}
            >
              Marquer indisponible
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
