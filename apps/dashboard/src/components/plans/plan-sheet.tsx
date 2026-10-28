"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { PencilIcon, PlusIcon } from "@/components/common/icon-compat";
import { PriceIndicator } from "@/components/common/price-indicator";
import { useEffect, useState } from "react";
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
  BYTES_PER_GB,
  NIGHT_WINDOW_LABEL,
  NIGHT_WINDOWS,
  planFormSchema,
  planToFormValues,
  type Plan,
  type PlanFormValues,
  TERM_KEYS,
} from "@/server/services/plans/plans.schema";
import { nightOptionFloorXaf, type PricingSettings } from "@/server/services/pricing/pricing.schema";

/** Durées proposées d'un clic ; le réglage fin se fait avec − et +. */
const DURATION_PRESETS = [1, 7, 15, 30, 60, 90] as const;
/** Quotas proposés d'un clic, en Go. */
const QUOTA_PRESETS = [5, 10, 20, 50] as const;
/** Badges proposés d'un clic ; « Aucun » vide le champ. */
const BADGE_PRESETS = ["Populaire", "Nouveau", "Meilleur prix"] as const;
const FAMILY_OPTIONS = [
  { value: "limited", label: "Limité" },
  { value: "unlimited", label: "Illimité sur durée" },
  { value: "limited_night", label: "Limité + nuit" },
] as const;

/** Champs qui peuvent porter une erreur de l'API, nommés comme dans le schéma. */
const FIELDS = ["name", "description", "family", "quotaGb", "priceXaf", "durationDays", "deviceLimit", "badge", "sortOrder"] as const;

type Props = (
  | { mode: "create"; appId: string; from?: Plan }
  | { mode: "edit"; plan: Plan }
) & {
  pricing?: PricingSettings;
  commissionBps?: number;
};

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
  if (props.mode === "edit") return planToFormValues(props.plan);
  if (props.from) {
    // Duplication : mêmes réglages ; nom et identifiant à redonner.
    return { ...planToFormValues(props.from), name: "", code: "", active: true, featured: false };
  }
  return {
    code: "",
    name: "",
    description: "",
    family: "limited",
    quotaGb: "10",
    priceXaf: "",
    durationDays: "30",
    deviceLimit: "1",
    badge: "",
    sortOrder: "0",
    featured: false,
    active: true,
    endpointTier: "paid-gcp",
    nightPrices: { "20-24": "", "24-04": "", "20-04": "" },
    nightActive: { "20-24": true, "24-04": true, "20-04": true },
  };
}

/**
 * Seuls les champs modifiés partent. Si un terme change (famille, quota, plages),
 * les quatre termes partent ensemble : l'API les vérifie comme un tout.
 */
function changedValues(original: PlanFormValues, values: PlanFormValues): Partial<PlanFormValues> {
  const out: Record<string, unknown> = {};
  const scalar = ["name", "description", "priceXaf", "durationDays", "deviceLimit", "badge", "sortOrder", "featured", "active", "endpointTier"] as const;
  for (const key of scalar) {
    if (original[key] !== values[key]) out[key] = values[key];
  }
  if (TERM_KEYS.some((key) => JSON.stringify(original[key]) !== JSON.stringify(values[key]))) {
    out.family = values.family;
    out.quotaGb = values.quotaGb;
    out.nightPrices = values.nightPrices;
    out.nightActive = values.nightActive;
  }
  return out as Partial<PlanFormValues>;
}

/**
 * Création, duplication et modification d'un forfait, par étapes lisibles :
 * nom, famille, quota, durée, prix (avec indicateur plancher/gain en direct), plages de nuit, appareils, badge.
 */
export function PlanSheet(props: Props) {
  const editing = props.mode === "edit";
  const duplicating = props.mode === "create" && Boolean(props.from);
  const [open, setOpen] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const form = useForm<PlanFormValues>({ resolver: zodResolver(planFormSchema), defaultValues: initialValues(props) });
  const values = useWatch({ control: form.control });

  async function submit(input: PlanFormValues) {
    let result;
    if (editing) {
      const diff = changedValues(initialValues(props), input);
      if (Object.keys(diff).length === 0) {
        setOpen(false);
        return;
      }
      result = await updatePlanAction(props.plan.id, diff);
    } else {
      result = await createPlanAction(props.appId, input);
    }
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
    // Plancher : l'API nomme la plage (`nightOptions.20-24`) ; sinon le message reste général.
    for (const window of NIGHT_WINDOWS) {
      const message = result.details?.[`nightOptions.${window}`];
      if (message) {
        form.setError(`nightPrices.${window}`, { message });
        placed = true;
      }
    }
    if (!placed) toast.error(result.message);
  }

  /** Ajuste un nombre entier entre deux bornes. */
  function bump(name: "durationDays" | "priceXaf" | "deviceLimit" | "quotaGb", delta: number, min: number, max: number) {
    const current = Number(form.getValues(name)) || 0;
    const next = Math.min(max, Math.max(min, current + delta));
    form.setValue(name, String(next), { shouldDirty: true, shouldValidate: true });
  }

  const family = values.family ?? "limited";
  const days = Number(values.durationDays) || 0;
  const quota = Number(values.quotaGb) || 0;
  const priceNumber = Number(values.priceXaf);
  const hasPrice = values.priceXaf !== undefined && values.priceXaf !== "" && Number.isFinite(priceNumber);
  const nightCount = NIGHT_WINDOWS.filter((w) => values.nightPrices?.[w]).length;
  const commissionBps = props.commissionBps ?? 1500;

  useEffect(() => {
    if (family === "unlimited") {
      if (form.getValues("endpointTier") !== "free-labs") {
        form.setValue("endpointTier", "free-labs", { shouldDirty: true });
      }
    } else {
      if (form.getValues("endpointTier") !== "paid-gcp") {
        form.setValue("endpointTier", "paid-gcp", { shouldDirty: true });
      }
    }
  }, [family, form]);

  const title = editing
    ? `Modifier « ${props.plan.name} »`
    : duplicating
      ? `Dupliquer « ${props.from?.name ?? ""} »`
      : "Nouveau forfait";

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
            Modifier
          </Button>
        ) : duplicating ? (
          <Button variant="outline" size="sm" className="min-h-11 sm:min-h-9">
            <PlusIcon aria-hidden />
            Dupliquer
          </Button>
        ) : (
          <Button className="min-h-11">
            <PlusIcon aria-hidden />
            Nouveau forfait
          </Button>
        )}
      </SheetTrigger>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>
            {editing
              ? "Seuls les champs modifiés sont enregistrés. Les nouveaux prix s'appliquent aux prochaines commandes."
              : "Nom, famille, quota, durée et prix suffisent pour une offre prête à vendre."}
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={form.handleSubmit(submit)} className="flex flex-1 flex-col gap-6 px-4" noValidate>
          {/* Nom : seul champ libre obligatoire ; l'identifiant en découle */}
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
                    if (!editing) form.setValue("code", slugify(e.target.value));
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

          {/* 1. Famille */}
          <section className="flex flex-col gap-2">
            <h3 className="text-subhead font-semibold">1. Famille</h3>
            <Controller
              name="family"
              control={form.control}
              render={({ field }) => (
                <>
                  <SegmentedControl<"limited" | "unlimited" | "limited_night">
                    label="Famille du forfait"
                    options={FAMILY_OPTIONS}
                    value={field.value}
                    onValueChange={field.onChange}
                  />
                  <FieldDescription>
                    {field.value === "unlimited"
                      ? "Data illimitée sur une durée en jours (serveurs partagés, sans quota)."
                      : field.value === "limited_night"
                        ? "Quota de données, plus des plages de nuit à prix propre."
                        : "Quota de données, sans plage de nuit."}
                  </FieldDescription>
                </>
              )}
            />
          </section>

          {/* 2. Quota */}
          {family !== "unlimited" ? (
            <section className="flex flex-col gap-2">
              <h3 className="text-subhead font-semibold">2. Quota de données</h3>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Quotas courants">
                {QUOTA_PRESETS.map((g) => (
                  <Button
                    key={g}
                    type="button"
                    size="sm"
                    variant={quota === g ? "default" : "outline"}
                    aria-pressed={quota === g}
                    onClick={() => form.setValue("quotaGb", String(g), { shouldDirty: true, shouldValidate: true })}
                    className="min-h-11 min-w-16 sm:min-h-8"
                  >
                    {g} Go
                  </Button>
                ))}
              </div>
              <Controller
                name="quotaGb"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <div className="flex items-center gap-2">
                      <Button type="button" variant="outline" className="size-11" aria-label="Un Go de moins" onClick={() => bump("quotaGb", -1, 1, 10_000)}>
                        −
                      </Button>
                      <Input {...field} id="plan-quotaGb" aria-label="Quota en Go" inputMode="numeric" className="h-11 text-center" aria-invalid={fieldState.invalid} />
                      <Button type="button" variant="outline" className="size-11" aria-label="Un Go de plus" onClick={() => bump("quotaGb", 1, 1, 10_000)}>
                        +
                      </Button>
                      <span className="text-subhead text-muted-foreground">Go</span>
                    </div>
                    <FieldDescription>Volume de données inclus, en Go.</FieldDescription>
                    {fieldState.error && <FieldError>{fieldState.error.message}</FieldError>}
                  </Field>
                )}
              />
            </section>
          ) : null}

          {/* 3. Durée */}
          <section className="flex flex-col gap-2">
            <h3 className="text-subhead font-semibold">3. Durée</h3>
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
                    <Input {...field} id="plan-durationDays" aria-label="Nombre de jours" inputMode="numeric" className="h-11 text-center" aria-invalid={fieldState.invalid} />
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

          {/* 4. Prix */}
          <section className="flex flex-col gap-2">
            <h3 className="text-subhead font-semibold">4. Prix de la formule de jour</h3>
            <Controller
              name="priceXaf"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <div className="flex items-center gap-2">
                    <Input {...field} id="plan-priceXaf" aria-label="Prix en francs CFA" inputMode="numeric" placeholder="0" className="h-11" aria-invalid={fieldState.invalid} />
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
            {props.pricing ? (
              <PriceIndicator
                quotaGb={quota}
                priceXaf={hasPrice ? priceNumber : 0}
                commissionBps={commissionBps}
                pricing={props.pricing}
                isUnlimited={family === "unlimited"}
                durationDays={days || 1}
                onUseFloor={(floor) =>
                  form.setValue("priceXaf", String(floor), { shouldDirty: true, shouldValidate: true })
                }
              />
            ) : null}
          </section>

          {/* 5. Plages de nuit (famille limité + nuit seulement) */}
          {family === "limited_night" ? (
            <section className="flex flex-col gap-3">
              <h3 className="text-subhead font-semibold">5. Plages de nuit</h3>
              <FieldDescription>Laisser le prix vide pour ne pas proposer la plage.</FieldDescription>
              {NIGHT_WINDOWS.map((window) => {
                const nFloor = props.pricing
                  ? (nightOptionFloorXaf(window, props.pricing) ?? 0)
                  : 0;
                const valNum = Number(values.nightPrices?.[window] || 0);
                const hasVal = Boolean(values.nightPrices?.[window]?.trim());
                return (
                  <Controller
                    key={window}
                    name={`nightPrices.${window}`}
                    control={form.control}
                    render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid}>
                        <div className="flex items-center gap-3">
                          <span className="w-28 shrink-0 text-subhead">{NIGHT_WINDOW_LABEL[window]}</span>
                          <Input {...field} aria-label={`Prix de la plage ${NIGHT_WINDOW_LABEL[window]}`} inputMode="numeric" placeholder={nFloor > 0 ? `Min. ${nFloor} FCFA` : "FCFA"} className="h-11" aria-invalid={fieldState.invalid} />
                          {nFloor > 0 && (!hasVal || valNum < nFloor) ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                form.setValue(`nightPrices.${window}`, String(nFloor), {
                                  shouldDirty: true,
                                  shouldValidate: true,
                                })
                              }
                            >
                              {formatXaf(nFloor)}
                            </Button>
                          ) : null}
                        </div>
                        {fieldState.error && <FieldError>{fieldState.error.message}</FieldError>}
                      </Field>
                    )}
                  />
                );
              })}
              <p className="text-footnote text-muted-foreground">{nightCount === 0 ? "Aucune plage de nuit proposée." : `${nightCount} plage(s) proposée(s).`}</p>
            </section>
          ) : null}

          {/* 6. Appareils */}
          <section className="flex flex-col gap-2">
            <h3 className="text-subhead font-semibold">{family === "limited_night" ? "6" : "5"}. Appareils</h3>
            <Controller
              name="deviceLimit"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <div className="flex items-center gap-2">
                    <Button type="button" variant="outline" className="size-11" aria-label="Un appareil de moins" onClick={() => bump("deviceLimit", -1, 1, 10)}>
                      −
                    </Button>
                    <Input {...field} id="plan-deviceLimit" aria-label="Nombre d'appareils" inputMode="numeric" className="h-11 text-center" aria-invalid={fieldState.invalid} />
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

          {/* Badge */}
          <section className="flex flex-col gap-2">
            <h3 className="text-subhead font-semibold">Badge affiché</h3>
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

          {/* Serveurs conditionnés par la famille (D135) et options */}
          <section className="flex flex-col gap-3 rounded-xl border border-border p-4">
            <Controller
              name="endpointTier"
              control={form.control}
              render={() => (
                <div className="flex flex-col gap-2">
                  <span className="text-subhead font-medium">Serveurs</span>
                  <div className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/40 px-3 py-2 text-footnote">
                    <span className="font-semibold text-foreground">
                      {family === "unlimited"
                        ? "Serveurs Illimités (free-labs)"
                        : family === "limited_night"
                          ? "Limité le jour (paid-gcp) + Illimité la nuit (free-labs)"
                          : "Serveurs Limités (paid-gcp)"}
                    </span>
                    <span className="rounded bg-accent/15 px-2 py-0.5 text-caption font-medium text-accent">
                      {family === "unlimited" ? "Illimité" : "Limité"}
                    </span>
                  </div>
                  <FieldDescription>
                    {family === "unlimited"
                      ? "Serveurs partagés sans quota de données, assignés automatiquement à l'offre illimitée."
                      : family === "limited_night"
                        ? "Serveurs dédiés avec quota en journée, complétés par les serveurs illimités activés sur la plage horaire nocturne."
                        : "Serveurs dédiés à l'abonné avec suivi strict du quota de données."}
                  </FieldDescription>
                </div>
              )}
            />
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
              {family === "unlimited"
                ? "Illimité"
                : family === "limited_night"
                  ? "Limité + nuit"
                  : "Limité"}{" "}
              · {family === "unlimited" ? "Data illimitée" : `${quota || "—"} Go`} · {days || "—"}{" "}
              {days > 1 ? "jours" : "jour"} · {values.deviceLimit || 1}{" "}
              {Number(values.deviceLimit) > 1 ? "appareils" : "appareil"}
              {hasPrice ? ` · ${formatXaf(priceNumber)}` : ""}
            </p>
            {family !== "unlimited" ? (
              <p className="text-muted-foreground">
                Quota exact : {quota ? `${(quota * BYTES_PER_GB).toLocaleString("fr-FR")} octets` : "—"}
              </p>
            ) : null}
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
