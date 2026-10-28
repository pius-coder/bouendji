"use client";

import * as React from "react";
import { toast } from "sonner";
import { Icon } from "@/components/common/icon";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { formatXaf } from "@/lib/format";
import { updatePricingAction } from "@/server/actions/pricing.action";
import {
  baseFloorXaf,
  nightOptionFloorXaf,
  pricingToFormValues,
  type PricingFormValues,
  type PricingSettings,
} from "@/server/services/pricing/pricing.schema";

export function PricingSettingsForm({ initialPricing }: { initialPricing: PricingSettings }) {
  const [pending, startTransition] = React.useTransition();
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [values, setValues] = React.useState<PricingFormValues>(() =>
    pricingToFormValues(initialPricing),
  );

  const previewMaxComm = Math.max(0, Math.round((Number(values.maxCommissionPercent.replace(",", ".")) || 0) * 100));
  const previewSettings: PricingSettings = {
    costPerGbXaf: Math.max(0, Number(values.costPerGbXaf) || 0),
    nightWindowCostXaf: {
      "20-24": Math.max(0, Number(values.night20_24) || 0),
      "24-04": Math.max(0, Number(values.night24_04) || 0),
      "20-04": Math.max(0, Number(values.night20_04) || 0),
    },
    platformMarginBps: Math.max(0, Math.round((Number(values.platformMarginPercent.replace(",", ".")) || 0) * 100)),
    maxCommissionBps: previewMaxComm,
    effectiveMaxCommissionBps: previewMaxComm || 3000,
    floorConfigured: true,
    updatedAt: initialPricing.updatedAt,
    updatedBy: initialPricing.updatedBy,
  };

  const handleConfirmSave = () => {
    startTransition(async () => {
      const res = await updatePricingAction(values);
      if (res.ok) {
        toast.success("Tarifs et marges de la plateforme mis à jour.");
        setConfirmOpen(false);
      } else {
        toast.error(res.message);
      }
    });
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
      <div className="flex flex-col gap-5 rounded-section border border-separator bg-background p-5 sm:p-6">
        <div>
          <h3 className="text-title-3 font-semibold text-foreground">
            Coûts d&apos;infrastructure & Marges plateforme
          </h3>
          <p className="mt-1 text-subhead text-muted-foreground">
            Ces paramètres déterminent automatiquement le prix plancher de tous les forfaits des communautés.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="p-cost-gb">Coût serveur par Go (FCFA)</FieldLabel>
            <Input
              id="p-cost-gb"
              inputMode="numeric"
              value={values.costPerGbXaf}
              onChange={(e) => setValues((v) => ({ ...v, costPerGbXaf: e.target.value }))}
            />
            <FieldDescription>Coût de revient d&apos;un Go sur les serveurs de jour.</FieldDescription>
          </Field>

          <Field>
            <FieldLabel htmlFor="p-margin">Marge plateforme (%)</FieldLabel>
            <Input
              id="p-margin"
              value={values.platformMarginPercent}
              onChange={(e) => setValues((v) => ({ ...v, platformMarginPercent: e.target.value }))}
            />
            <FieldDescription>Pourcentage retenu par la plateforme (0 à 80 %).</FieldDescription>
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field>
            <FieldLabel htmlFor="p-n2024">Coût Nuit 20h–00h (FCFA)</FieldLabel>
            <Input
              id="p-n2024"
              inputMode="numeric"
              value={values.night20_24}
              onChange={(e) => setValues((v) => ({ ...v, night20_24: e.target.value }))}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="p-n2404">Coût Nuit 00h–04h (FCFA)</FieldLabel>
            <Input
              id="p-n2404"
              inputMode="numeric"
              value={values.night24_04}
              onChange={(e) => setValues((v) => ({ ...v, night24_04: e.target.value }))}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="p-n2004">Coût Nuit 20h–04h (FCFA)</FieldLabel>
            <Input
              id="p-n2004"
              inputMode="numeric"
              value={values.night20_04}
              onChange={(e) => setValues((v) => ({ ...v, night20_04: e.target.value }))}
            />
          </Field>
        </div>

        <Field className="max-w-xs">
          <FieldLabel htmlFor="p-max-comm">Plafond de commission communauté (%)</FieldLabel>
          <Input
            id="p-max-comm"
            value={values.maxCommissionPercent}
            onChange={(e) => setValues((v) => ({ ...v, maxCommissionPercent: e.target.value }))}
          />
          <FieldDescription>Maximum autorisé lors du réglage d&apos;une communauté.</FieldDescription>
        </Field>

        <div className="flex justify-end border-t border-separator pt-4">
          <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
            <AlertDialogTrigger asChild>
              <Button type="button" disabled={pending}>
                {pending ? <Spinner /> : <Icon name="check" className="size-4" />}
                Enregistrer les nouveaux tarifs
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Appliquer les nouveaux tarifs planchers ?</AlertDialogTitle>
                <AlertDialogDescription>
                  Les nouvelles créations ou modifications de forfaits devront respecter ces nouveaux planchers. Les forfaits déjà en vente qui passeraient sous le plancher seront signalés aux administrateurs de communauté.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Annuler</AlertDialogCancel>
                <AlertDialogAction onClick={handleConfirmSave}>
                  Confirmer la mise à jour
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {/* Simulateur de plancher en direct */}
      <div className="flex flex-col gap-4 rounded-section border border-separator bg-muted/30 p-5">
        <div>
          <h4 className="text-subhead font-semibold text-foreground">
            Simulateur de prix plancher
          </h4>
          <p className="mt-0.5 text-footnote text-muted-foreground">
            Aperçu en direct des prix minimums calculés avec vos réglages.
          </p>
        </div>

        <dl className="divide-y divide-separator overflow-hidden rounded-section border border-separator bg-background">
          {[5, 10, 15, 25, 50].map((gb) => {
            const floor = baseFloorXaf(gb * 1_000_000_000, previewSettings) ?? 0;
            return (
              <div key={gb} className="flex items-center justify-between px-4 py-2.5 text-subhead">
                <dt className="text-muted-foreground">Forfait {gb} Go</dt>
                <dd className="font-semibold tabular-nums text-foreground">{formatXaf(floor)}</dd>
              </div>
            );
          })}
          <div className="flex items-center justify-between px-4 py-2.5 text-subhead">
            <dt className="text-muted-foreground">Option Nuit 20h–00h</dt>
            <dd className="font-semibold tabular-nums text-foreground">
              +{formatXaf(nightOptionFloorXaf("20-24", previewSettings) ?? 0)}
            </dd>
          </div>
          <div className="flex items-center justify-between px-4 py-2.5 text-subhead">
            <dt className="text-muted-foreground">Option Nuit 20h–04h</dt>
            <dd className="font-semibold tabular-nums text-foreground">
              +{formatXaf(nightOptionFloorXaf("20-04", previewSettings) ?? 0)}
            </dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
