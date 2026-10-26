"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { PencilIcon, PlusIcon } from "@/components/common/icon-compat";
import { useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { formatXaf } from "@/lib/format";
import { saveCustomOfferAction } from "@/server/actions/plans.action";
import {
  customOfferFormSchema,
  customOfferFormValues,
  customPriceXaf,
  type CustomOffer,
  type CustomOfferFormValues,
} from "@/server/services/plans/custom-offer.schema";

type FieldName = Exclude<keyof CustomOfferFormValues, "active">;

/** Erreurs de l'API (`details`) ramenées sur les champs du formulaire. */
const API_FIELD: Record<string, FieldName> = {
  name: "name",
  deviceLimit: "deviceLimit",
  "terms.pricePerGb1dXaf": "pricePerGb1dXaf",
  "terms.pricePerGb30dXaf": "pricePerGb30dXaf",
  "terms.minGb": "minGb",
  "terms.maxGb": "maxGb",
  "terms.stepGb": "stepGb",
  "terms.minDays": "minDays",
  "terms.maxDays": "maxDays",
  pricePerGb1dXaf: "pricePerGb1dXaf",
  "nightOptions.20-24": "night2024",
  "nightOptions.24-04": "night2404",
  "nightOptions.20-04": "night2004",
};

/**
 * Réglage de l'offre sur mesure : deux prix du Go (1 jour, 30 jours), bornes
 * des curseurs, plages de nuit en option. L'aperçu à droite rejoue la formule
 * du serveur avec deux curseurs, comme l'abonné les verra dans l'app.
 */
export function CustomOfferSheet({ appId, offer }: { appId: string; offer: CustomOffer | null }) {
  const [open, setOpen] = useState(false);
  const form = useForm<CustomOfferFormValues>({
    resolver: zodResolver(customOfferFormSchema),
    defaultValues: customOfferFormValues(offer),
  });

  async function submit(values: CustomOfferFormValues) {
    const result = await saveCustomOfferAction(appId, values);
    if (result.ok) {
      toast.success("Forfait sur mesure enregistré");
      setOpen(false);
      return;
    }
    let placed = false;
    for (const [key, message] of Object.entries(result.details ?? {})) {
      const field = API_FIELD[key];
      if (field && message) {
        form.setError(field, { message });
        placed = true;
      }
    }
    // Plancher owner (409 BELOW_FLOOR) : le message dit le prix minimum du Go.
    if (result.details?.reason === "BELOW_FLOOR" && result.details.floorXaf) {
      const field = API_FIELD[result.details.field ?? ""] ?? "pricePerGb1dXaf";
      form.setError(field, { message: `Sous le prix plancher : ${formatXaf(Number(result.details.floorXaf))} minimum.` });
      placed = true;
    }
    if (!placed) toast.error(result.message);
  }

  const text = (name: FieldName, label: string, hint?: string) => (
    <Controller
      name={name}
      control={form.control}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid}>
          <FieldLabel htmlFor={`co-${name}`}>{label}</FieldLabel>
          <Input
            {...field}
            id={`co-${name}`}
            className="h-11"
            inputMode={name === "name" ? undefined : "numeric"}
            aria-invalid={fieldState.invalid}
          />
          {hint && <FieldDescription>{hint}</FieldDescription>}
          {fieldState.error && <FieldError>{fieldState.error.message}</FieldError>}
        </Field>
      )}
    />
  );

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (next) form.reset(customOfferFormValues(offer));
        setOpen(next);
      }}
    >
      <SheetTrigger asChild>
        <Button variant={offer ? "outline" : "default"} size="sm" className="min-h-11 sm:min-h-9">
          {offer ? <PencilIcon aria-hidden /> : <PlusIcon aria-hidden />}
          {offer ? "Modifier" : "Créer l'offre"}
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Forfait sur mesure</SheetTitle>
          <SheetDescription>
            Prix d’un Go selon la validité choisie. Entre 1 et 30 jours, le prix du Go monte régulièrement ; le total est arrondi aux
            50 FCFA supérieurs.
          </SheetDescription>
        </SheetHeader>
        <form onSubmit={form.handleSubmit(submit)} className="flex flex-1 flex-col gap-4 px-4" noValidate>
          <FieldGroup>
            {text("name", "Nom affiché dans l'app")}
            <div className="grid grid-cols-2 gap-3">
              {text("pricePerGb1dXaf", "Go à 1 jour (XAF)")}
              {text("pricePerGb30dXaf", "Go à 30 jours (XAF)")}
            </div>
            <div className="grid grid-cols-3 gap-3">
              {text("minGb", "Go min.")}
              {text("maxGb", "Go max.")}
              {text("stepGb", "Pas (Go)")}
            </div>
            <div className="grid grid-cols-2 gap-3">
              {text("minDays", "Jours min.")}
              {text("maxDays", "Jours max.", "30 au plus.")}
            </div>
            {text("deviceLimit", "Appareils", "1 à 10.")}
            <Preview control={form.control} />
            <p className="text-subheadline font-semibold">Illimité de nuit (option)</p>
            <div className="grid grid-cols-3 gap-3">
              {text("night2024", "20 h-24 h")}
              {text("night2404", "24 h-4 h")}
              {text("night2004", "20 h-4 h")}
            </div>
            <FieldDescription>Prix ajouté au forfait. Vide : plage non proposée.</FieldDescription>
            <Controller
              name="active"
              control={form.control}
              render={({ field }) => (
                <Field orientation="horizontal">
                  <Checkbox id="co-active" checked={field.value} onCheckedChange={(v) => field.onChange(v === true)} />
                  <FieldLabel htmlFor="co-active">Actif (proposé dans l’app)</FieldLabel>
                </Field>
              )}
            />
          </FieldGroup>
          <SheetFooter className="px-0">
            <Button type="submit" className="h-11 w-full" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting && <Spinner />}
              Enregistrer
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

/** Aperçu : deux curseurs et le prix, avec la formule du serveur. */
function Preview({ control }: { control: ReturnType<typeof useForm<CustomOfferFormValues>>["control"] }) {
  const v = useWatch({ control });
  const n = (s: string | undefined, fallback: number) => (s && /^\d+$/.test(s) ? Number(s) : fallback);
  const minGb = n(v.minGb, 1);
  const maxGb = Math.max(minGb, n(v.maxGb, minGb));
  const step = Math.max(1, n(v.stepGb, 1));
  const minDays = Math.min(30, Math.max(1, n(v.minDays, 1)));
  const maxDays = Math.min(30, Math.max(minDays, n(v.maxDays, 30)));
  const p1 = n(v.pricePerGb1dXaf, 0);
  const p30 = n(v.pricePerGb30dXaf, 0);
  const [gb, setGb] = useState(minGb);
  const [days, setDays] = useState(minDays);
  const g = Math.min(maxGb, Math.max(minGb, gb));
  const d = Math.min(maxDays, Math.max(minDays, days));
  const ready = p1 > 0 && p30 > 0;

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-muted/40 p-3">
      <div className="flex items-baseline justify-between">
        <span className="text-footnote text-muted-foreground">Aperçu dans l’app</span>
        <span className="text-title-3 font-semibold tabular-nums">{ready ? formatXaf(customPriceXaf({ pricePerGb1dXaf: p1, pricePerGb30dXaf: p30 }, g, d)) : "—"}</span>
      </div>
      <label className="flex flex-col gap-1 text-footnote">
        <span className="flex justify-between">
          <span>Data</span>
          <span className="tabular-nums">{g} Go</span>
        </span>
        <input type="range" min={minGb} max={maxGb} step={step} value={g} onChange={(e) => setGb(Number(e.target.value))} className="accent-primary" />
      </label>
      <label className="flex flex-col gap-1 text-footnote">
        <span className="flex justify-between">
          <span>Validité</span>
          <span className="tabular-nums">{d} j</span>
        </span>
        <input type="range" min={minDays} max={maxDays} step={1} value={d} onChange={(e) => setDays(Number(e.target.value))} className="accent-primary" />
      </label>
    </div>
  );
}
