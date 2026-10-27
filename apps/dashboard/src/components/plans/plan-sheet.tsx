"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { PencilIcon, PlusIcon } from "@/components/common/icon-compat";
import { useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/common/segmented-control";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { formatXaf } from "@/lib/format";
import { createPlanAction, updatePlanAction } from "@/server/actions/plans.action";
import {
  ENDPOINT_TIER_LABEL,
  type EndpointTier,
  planFormSchema,
  type Plan,
  type PlanFormValues,
} from "@/server/services/plans/plans.schema";

/** Durées proposées d'un clic ; le réglage fin se fait avec − et +. */
const DURATION_PRESETS = [1, 7, 15, 30, 60, 90] as const;
/** Badges proposés d'un clic ; « Aucun » vide le champ. */
const BADGE_PRESETS = ["Populaire", "Nouveau", "Meilleur prix"] as const;
const TIER_OPTIONS = (["free-labs", "paid-gcp"] as const).map((value) => ({ value, label: ENDPOINT_TIER_LABEL[value] }));
const TIER_HINT: Record<EndpointTier, string> = {
  "free-labs": "Serveurs gratuits partagés, sans limite de données.",
  "paid-gcp": "Serveurs payants dédiés à l'abonné, avec un quota de données.",
};

const ADD_LABEL = "Nouveau forfait";
const EDIT_LABEL = "Modifier";

type Props = { mode: "create"; appId: string } | { mode: "edit"; plan: Plan };

const FIELDS = ["code", "name", "description", "priceXaf", "durationDays", "deviceLimit", "badge", "sortOrder"] as const;

/** Identifiant lisible depuis le nom : « Forfait 30 jours » → « forfait-30-jours ». */
function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function initialValues(props: Props): PlanFormValues {
  if (props.mode === "create") {
    return {
      code: "",
      name: "",
      description: "",
      priceXaf: "",
      durationDays: "30",
      deviceLimit: "1",
      badge: "",
      sortOrder: "0",
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
 * Création et modification d'un forfait, en étapes lisibles : formule, durée,
 * prix, appareils, badge. Les réglages rares (description, ordre) sont repliés.
 * Même schéma zod que l'action. `code` est dérivé du nom et immuable ensuite.
 */
export function PlanSheet(props: Props) {
  const editing = props.mode === "edit";
  const [open, setOpen] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const form = useForm<PlanFormValues>({ resolver: zodResolver(planFormSchema), defaultValues: initialValues(props) });
  const values = useWatch({ control: form.control });

  async function submit(input: PlanFormValues) {
    const result = editing ? await updatePlanAction(props.plan.id, input) : await createPlanAction(props.appId, input);
    if (result.ok) {
      toast.success(editing ? "Forfait enregistré" : "Forfait créé");
      setOpen(false);
      return;
    }
    let placed = false;
    for (const field of FIELDS) {
      const message = result.details?.[field];
      if (message) {
        form.setError(field, { message });
        placed = true;
      }
    }
    if (!placed) toast.error(result.message);
  }

  /** Ajuste un nombre entier entre deux bornes ; saisie vide = borne basse. */
  function bump(name: "durationDays" | "priceXaf" | "deviceLimit" | "sortOrder", delta: number, min: number, max: number) {
    const current = Number(form.getValues(name)) || 0;
    const next = Math.min(max, Math.max(min, current + delta));
    form.setValue(name, String(next), { shouldDirty: true, shouldValidate: true });
  }

  const priceNumber = Number(values.priceXaf);
  const hasPrice = values.priceXaf !== undefined && values.priceXaf !== "" && Number.isFinite(priceNumber);
  const days = Number(values.durationDays) || 0;

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (next) {
          form.reset(initialValues(props)); // repart des données courantes à chaque ouverture
          setAdvanced(false);
        }
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
              ? "Les nouveaux prix s'appliquent aux prochaines commandes."
              : "Quatre réglages suffisent : formule, durée, prix, appareils."}
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={form.handleSubmit(submit)} className="flex flex-1 flex-col gap-6 px-4" noValidate>
          {/* Nom : le seul champ libre obligatoire ; l'identifiant en découle */}
          <Controller
            name="name"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="plan-name">Nom du forfait</FieldLabel>
                <Input
                  {...field}
                  id="plan-name"
                  className="h-11"
                  placeholder="Ex. Forfait 30 jours"
                  aria-invalid={fieldState.invalid}
                  onChange={(e) => {
                    field.onChange(e);
                    if (!editing) form.setValue("code", slugify(e.target.value), { shouldValidate: false });
                  }}
                />
                {!editing && values.code ? (
                  <FieldDescription>
                    Identifiant : <span className="font-mono">{values.code}</span>
                  </FieldDescription>
                ) : null}
                {fieldState.error && <FieldError>{fieldState.error.message}</FieldError>}
              </Field>
            )}
          />

          {/* 1. Formule */}
          <section className="flex flex-col gap-2">
            <h3 className="text-subhead font-semibold">1. Formule</h3>
            <Controller
              name="endpointTier"
              control={form.control}
              render={({ field }) => (
                <>
                  <SegmentedControl<EndpointTier>
                    label="Formule du forfait"
                    options={TIER_OPTIONS}
                    value={field.value}
                    onValueChange={field.onChange}
                  />
                  <FieldDescription>{TIER_HINT[field.value]}</FieldDescription>
                </>
              )}
            />
          </section>

          {/* 2. Durée */}
          <section className="flex flex-col gap-2">
            <h3 className="text-subhead font-semibold">2. Durée</h3>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Durées courantes">
              {DURATION_PRESETS.map((d) => (
                <Button
                  key={d}
                  type="button"
                  size="sm"
                  variant={days === d ? "default" : "outline"}
                  aria-pressed={days === d}
                  onClick={() => form.setValue("durationDays", String(d), { shouldDirty: true, shouldValidate: true })}
                  className="min-h-11 min-w-16 sm:min-h-8"
                >
                  {d === 1 ? "1 jour" : `${d} jours`}
                </Button>
              ))}
            </div>
            <Controller
              name="durationDays"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <div className="flex items-center gap-2">
                    <Button type="button" variant="outline" className="size-11" aria-label="Un jour de moins" onClick={() => bump("durationDays", -1, 1, 3650)}>
                      −
                    </Button>
                    <Input
                      {...field}
                      id="plan-durationDays"
                      aria-label="Nombre de jours"
                      inputMode="numeric"
                      className="h-11 text-center"
                      aria-invalid={fieldState.invalid}
                    />
                    <Button type="button" variant="outline" className="size-11" aria-label="Un jour de plus" onClick={() => bump("durationDays", 1, 1, 3650)}>
                      +
                    </Button>
                  </div>
                  <FieldDescription>Nombre de jours d’accès, de 1 à 3650.</FieldDescription>
                  {fieldState.error && <FieldError>{fieldState.error.message}</FieldError>}
                </Field>
              )}
            />
          </section>

          {/* 3. Prix */}
          <section className="flex flex-col gap-2">
            <h3 className="text-subhead font-semibold">3. Prix</h3>
            <Controller
              name="priceXaf"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <div className="flex items-center gap-2">
                    <Input
                      {...field}
                      id="plan-priceXaf"
                      aria-label="Prix en francs CFA"
                      inputMode="numeric"
                      placeholder="0"
                      className="h-11"
                      aria-invalid={fieldState.invalid}
                    />
                    <span className="text-subhead text-muted-foreground">FCFA</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {[-500, -100, 100, 500].map((step) => (
                      <Button key={step} type="button" variant="outline" size="sm" onClick={() => bump("priceXaf", step, 1, 10_000_000)}>
                        {step > 0 ? `+${step}` : step}
                      </Button>
                    ))}
                  </div>
                  {fieldState.error && <FieldError>{fieldState.error.message}</FieldError>}
                </Field>
              )}
            />
          </section>

          {/* 4. Appareils */}
          <section className="flex flex-col gap-2">
            <h3 className="text-subhead font-semibold">4. Appareils</h3>
            <Controller
              name="deviceLimit"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <div className="flex items-center gap-2">
                    <Button type="button" variant="outline" className="size-11" aria-label="Un appareil de moins" onClick={() => bump("deviceLimit", -1, 1, 10)}>
                      −
                    </Button>
                    <Input
                      {...field}
                      id="plan-deviceLimit"
                      aria-label="Nombre d'appareils"
                      inputMode="numeric"
                      className="h-11 text-center"
                      aria-invalid={fieldState.invalid}
                    />
                    <Button type="button" variant="outline" className="size-11" aria-label="Un appareil de plus" onClick={() => bump("deviceLimit", 1, 1, 10)}>
                      +
                    </Button>
                  </div>
                  <FieldDescription>Entre 1 et 10 téléphones peuvent utiliser ce forfait.</FieldDescription>
                  {fieldState.error && <FieldError>{fieldState.error.message}</FieldError>}
                </Field>
              )}
            />
          </section>

          {/* 5. Badge */}
          <section className="flex flex-col gap-2">
            <h3 className="text-subhead font-semibold">5. Badge affiché</h3>
            <Controller
              name="badge"
              control={form.control}
              render={({ field }) => (
                <div className="flex flex-wrap gap-2" role="group" aria-label="Badge">
                  {(["", ...BADGE_PRESETS] as const).map((preset) => (
                    <Button
                      key={preset || "none"}
                      type="button"
                      size="sm"
                      variant={field.value === preset ? "default" : "outline"}
                      aria-pressed={field.value === preset}
                      onClick={() => field.onChange(preset)}
                      className="min-h-11 sm:min-h-8"
                    >
                      {preset || "Aucun"}
                    </Button>
                  ))}
                </div>
              )}
            />
          </section>

          {/* Options */}
          <section className="flex flex-col gap-3 rounded-xl border border-border p-4">
            <Controller
              name="featured"
              control={form.control}
              render={({ field }) => (
                <label className="flex items-center justify-between gap-4">
                  <span className="text-subhead">Mettre en avant</span>
                  <Switch checked={field.value} onCheckedChange={field.onChange} aria-label="Mettre en avant" />
                </label>
              )}
            />
            <Controller
              name="active"
              control={form.control}
              render={({ field }) => (
                <label className="flex items-center justify-between gap-4">
                  <span className="text-subhead">Proposé à la vente</span>
                  <Switch checked={field.value} onCheckedChange={field.onChange} aria-label="Proposé à la vente" />
                </label>
              )}
            />
          </section>

          <button type="button" className="self-start text-footnote text-muted-foreground underline" onClick={() => setAdvanced((v) => !v)} aria-expanded={advanced}>
            {advanced ? "Masquer les réglages avancés" : "Réglages avancés"}
          </button>
          {advanced ? (
            <div className="flex flex-col gap-4">
              {editing ? (
                <Field>
                  <FieldLabel>Identifiant</FieldLabel>
                  <Input value={props.plan.code} disabled className="h-11 font-mono" aria-label="Identifiant du forfait" />
                  <FieldDescription>Fixé à la création, il ne change pas.</FieldDescription>
                </Field>
              ) : null}
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
              <Controller
                name="sortOrder"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="plan-sortOrder">Ordre d’affichage</FieldLabel>
                    <Input {...field} id="plan-sortOrder" inputMode="numeric" className="h-11" aria-invalid={fieldState.invalid} />
                    <FieldDescription>0 à 1000, le plus petit en premier.</FieldDescription>
                    {fieldState.error && <FieldError>{fieldState.error.message}</FieldError>}
                  </Field>
                )}
              />
            </div>
          ) : null}

          {/* Résumé en direct */}
          <div className="rounded-xl bg-muted/40 p-4 text-footnote" aria-live="polite">
            <p className="font-semibold text-foreground">{values.name || "Sans nom"}</p>
            <p className="text-muted-foreground">
              {ENDPOINT_TIER_LABEL[values.endpointTier ?? "free-labs"]} · {days || "—"} {days > 1 ? "jours" : "jour"} · {values.deviceLimit || 1}{" "}
              {Number(values.deviceLimit) > 1 ? "appareils" : "appareil"}
              {hasPrice ? ` · ${formatXaf(priceNumber)}` : ""}
            </p>
          </div>

          <SheetFooter className="px-0">
            <Button type="submit" className="h-11 w-full" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting && <Spinner />}
              {editing ? "Enregistrer" : "Créer le forfait"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
