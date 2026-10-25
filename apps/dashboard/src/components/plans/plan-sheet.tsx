"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { PencilIcon, PlusIcon } from "@/components/common/icon-compat";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/common/segmented-control";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { createPlanAction, updatePlanAction } from "@/server/actions/plans.action";
import {
  ENDPOINT_TIER_LABEL,
  type EndpointTier,
  planFormSchema,
  type Plan,
  type PlanFormValues,
} from "@/server/services/plans/plans.schema";

const TIER_OPTIONS = (["free-labs", "paid-gcp"] as const).map((value) => ({ value, label: ENDPOINT_TIER_LABEL[value] }));

const ADD_LABEL = "Nouveau forfait";
const EDIT_LABEL = "Modifier";
const SUBMIT_CREATE = "Créer";
const SUBMIT_EDIT = "Enregistrer";

type Props = { mode: "create"; appId: string } | { mode: "edit"; plan: Plan };

const FIELDS = ["code", "name", "description", "priceXaf", "durationDays", "deviceLimit", "badge", "sortOrder"] as const;

function initialValues(props: Props): PlanFormValues {
  if (props.mode === "create") {
    return {
      code: "",
      name: "",
      description: "",
      priceXaf: "",
      durationDays: "",
      deviceLimit: "",
      badge: "",
      sortOrder: "",
      featured: false,
      active: true,
      endpointTier: "free-labs",
    };
  }
  const p = props.plan;
  return {
    code: p.code,
    name: p.name,
    description: p.description,
    priceXaf: String(p.priceXaf),
    durationDays: String(p.durationDays),
    deviceLimit: String(p.deviceLimit),
    badge: p.badge ?? "",
    sortOrder: String(p.sortOrder),
    featured: p.featured,
    active: p.active,
    endpointTier: p.endpointTier,
  };
}

/**
 * Création et modification d'un forfait : react-hook-form + le même schéma zod
 * que l'action. `code` est immuable (champ désactivé en édition). Les erreurs
 * `details` de l'API reviennent dans les champs.
 */
export function PlanSheet(props: Props) {
  const editing = props.mode === "edit";
  const [open, setOpen] = useState(false);
  const form = useForm<PlanFormValues>({ resolver: zodResolver(planFormSchema), defaultValues: initialValues(props) });

  async function submit(values: PlanFormValues) {
    const result = editing ? await updatePlanAction(props.plan.id, values) : await createPlanAction(props.appId, values);
    if (result.ok) {
      toast.success(editing ? "Forfait enregistré" : "Forfait créé");
      if (!editing) form.reset(initialValues(props));
      setOpen(false);
      return;
    }
    let placed = false;
    for (const field of FIELDS) {
      const message = result.details?.[field === "priceXaf" ? "priceXaf" : field];
      if (message) {
        form.setError(field, { message });
        placed = true;
      }
    }
    if (!placed) toast.error(result.message);
  }

  const text = (name: (typeof FIELDS)[number], label: string, extra?: { hint?: string; numeric?: boolean; disabled?: boolean }) => (
    <Controller
      name={name}
      control={form.control}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid}>
          <FieldLabel htmlFor={`plan-${name}`}>{label}</FieldLabel>
          <Input
            {...field}
            id={`plan-${name}`}
            className="h-11"
            inputMode={extra?.numeric ? "numeric" : undefined}
            disabled={extra?.disabled}
            aria-invalid={fieldState.invalid}
          />
          {extra?.hint && <FieldDescription>{extra.hint}</FieldDescription>}
          {fieldState.error && <FieldError>{fieldState.error.message}</FieldError>}
        </Field>
      )}
    />
  );

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (next) form.reset(initialValues(props)); // repart des données courantes à chaque ouverture
        setOpen(next);
      }}
    >
      <SheetTrigger asChild>
        {editing ? (
          <Button variant="outline" size="sm" className="min-h-11 sm:min-h-9">
            <PencilIcon aria-hidden />
            {EDIT_LABEL}
          </Button>
        ) : (
          <Button className="min-h-11">
            <PlusIcon aria-hidden />
            {ADD_LABEL}
          </Button>
        )}
      </SheetTrigger>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{editing ? `Modifier « ${props.plan.name} »` : ADD_LABEL}</SheetTitle>
          <SheetDescription>
            {editing
              ? "Le code est immuable. Les nouveaux prix s'appliquent aux prochaines commandes."
              : "Le prix est celui de votre marque, en XAF."}
          </SheetDescription>
        </SheetHeader>
        <form onSubmit={form.handleSubmit(submit)} className="flex flex-1 flex-col gap-4 px-4" noValidate>
          <FieldGroup>
            {text("code", "Code", { hint: "Minuscules, chiffres et tirets.", disabled: editing })}
            {text("name", "Nom")}
            <Controller
              name="description"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="plan-description">Description</FieldLabel>
                  <Textarea {...field} id="plan-description" rows={3} aria-invalid={fieldState.invalid} />
                  {fieldState.error && <FieldError>{fieldState.error.message}</FieldError>}
                </Field>
              )}
            />
            {text("priceXaf", "Prix (XAF)", { numeric: true })}
            {text("durationDays", "Durée (jours)", { numeric: true })}
            {text("deviceLimit", "Appareils", { numeric: true, hint: "1 à 10. Vide : 1." })}
            {text("badge", "Badge", { hint: "Facultatif, ex. « Populaire »." })}
            {text("sortOrder", "Ordre d'affichage", { numeric: true, hint: "0 à 1000. Vide : 0." })}
            <Controller
              name="endpointTier"
              control={form.control}
              render={({ field }) => (
                <Field>
                  <FieldLabel>Serveurs</FieldLabel>
                  <SegmentedControl<EndpointTier>
                    label="Serveurs du forfait"
                    options={TIER_OPTIONS}
                    value={field.value}
                    onValueChange={field.onChange}
                  />
                  <FieldDescription>
                    Illimité : serveurs gratuits partagés. Limité : serveurs payants, quota de données. Les deux ne se mélangent pas.
                  </FieldDescription>
                </Field>
              )}
            />
            <Controller
              name="featured"
              control={form.control}
              render={({ field }) => (
                <Field orientation="horizontal">
                  <Checkbox id="plan-featured" checked={field.value} onCheckedChange={(v) => field.onChange(v === true)} />
                  <FieldLabel htmlFor="plan-featured">Mis en avant</FieldLabel>
                </Field>
              )}
            />
            <Controller
              name="active"
              control={form.control}
              render={({ field }) => (
                <Field orientation="horizontal">
                  <Checkbox id="plan-active" checked={field.value} onCheckedChange={(v) => field.onChange(v === true)} />
                  <FieldLabel htmlFor="plan-active">Actif (proposé à la vente)</FieldLabel>
                </Field>
              )}
            />
          </FieldGroup>
          <SheetFooter className="px-0">
            <Button type="submit" className="h-11 w-full" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting && <Spinner />}
              {editing ? SUBMIT_EDIT : SUBMIT_CREATE}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
