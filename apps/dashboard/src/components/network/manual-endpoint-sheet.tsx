"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { PlusIcon } from "@/components/common/icon-compat";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { SegmentedControl } from "@/components/common/segmented-control";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { formatDateTime } from "@/lib/format";
import { parseVlessLink, type VlessFields } from "@/lib/vless-link";
import { addManualEndpointsAction } from "@/server/actions/network.action";
import { manualEndpointFormSchema, type ManualEndpointFormValues } from "@/server/services/network/network.schema";
import { ENDPOINT_TIER_LABEL, type EndpointTier } from "@/server/services/plans/plans.schema";

const ADD_LABEL = "Ajouter des nœuds";
const SUBMIT_LABEL = "Publier";

const TEXT_FIELDS = ["group", "label", "region", "address", "port", "hostHeader", "wsPath", "uuid", "ttlHours"] as const;
const TIER_OPTIONS = (["free-labs", "paid-gcp"] as const).map((value) => ({ value, label: ENDPOINT_TIER_LABEL[value] }));

const EMPTY: ManualEndpointFormValues = {
  group: "",
  label: "",
  region: "",
  address: "",
  port: "443",
  snis: "",
  hostHeader: "",
  wsPath: "/",
  uuid: "",
  ttlHours: "24",
  tier: "free-labs",
};

/**
 * Coller un lien VLESS (D107) : analysé ici, dans le navigateur, pour remplir les
 * champs ; le lien lui-même est effacé aussitôt, jamais envoyé ni conservé.
 */
function VlessPaste({ onFields }: { onFields: (fields: VlessFields) => void }) {
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  function apply(value: string) {
    const parsed = parseVlessLink(value);
    if (!parsed.ok) {
      setError(parsed.error);
      setDraft(value);
      return;
    }
    setError(null);
    setDraft("");
    onFields(parsed.fields);
    toast.success("Champs remplis depuis le lien");
  }
  return (
    <Field data-invalid={Boolean(error)}>
      <FieldLabel htmlFor="manual-vless">Lien VLESS</FieldLabel>
      <Input
        id="manual-vless"
        value={draft}
        placeholder="Coller un lien vless://…"
        autoComplete="off"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        className="h-11 font-mono"
        onChange={(e) => setDraft(e.target.value)}
        onPaste={(e) => {
          e.preventDefault();
          apply(e.clipboardData.getData("text"));
        }}
        onBlur={() => draft && apply(draft)}
        aria-invalid={Boolean(error)}
      />
      <FieldDescription>Facultatif. WebSocket + TLS uniquement ; le lien n&apos;est ni envoyé ni conservé.</FieldDescription>
      {error ? <FieldError>{error}</FieldError> : null}
    </Field>
  );
}

/** L'API nomme un SNI fautif `snis.<index>` : on le rattache au champ unique. */
function sniError(details: Record<string, string> | undefined): string | undefined {
  if (!details) return undefined;
  return details.snis ?? Object.entries(details).find(([key]) => key.startsWith("snis."))?.[1];
}

/**
 * Nœuds qui ne s'enregistrent pas eux-mêmes (fronting Cloud Run, 3x-ui, image
 * tierce) : une ligne du pool par SNI. Republier le même groupe remplace ses
 * lignes et retire celles qui n'y sont plus. Réservé au propriétaire
 * (`endpoint.write`) ; l'écran ne l'affiche qu'à lui, Fastify revérifie.
 */
export function ManualEndpointSheet() {
  const [open, setOpen] = useState(false);
  const form = useForm<ManualEndpointFormValues>({ resolver: zodResolver(manualEndpointFormSchema), defaultValues: EMPTY });

  async function submit(values: ManualEndpointFormValues) {
    const result = await addManualEndpointsAction(values);
    if (result.ok) {
      const { count, expiresAt } = result.data;
      toast.success(`${count} nœud${count > 1 ? "s" : ""} publié${count > 1 ? "s" : ""} · jusqu'au ${formatDateTime(expiresAt)}`);
      form.reset(EMPTY);
      setOpen(false);
      return;
    }
    let placed = false;
    for (const field of TEXT_FIELDS) {
      const message = result.details?.[field];
      if (message) {
        form.setError(field, { message });
        placed = true;
      }
    }
    const sni = sniError(result.details);
    if (sni) {
      form.setError("snis", { message: sni });
      placed = true;
    }
    if (!placed) toast.error(result.message);
  }

  const text = (name: (typeof TEXT_FIELDS)[number], label: string, extra?: { hint?: string; numeric?: boolean; mono?: boolean }) => (
    <Controller
      name={name}
      control={form.control}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid}>
          <FieldLabel htmlFor={`manual-${name}`}>{label}</FieldLabel>
          <Input
            {...field}
            id={`manual-${name}`}
            className={extra?.mono ? "h-11 font-mono" : "h-11"}
            inputMode={extra?.numeric ? "numeric" : undefined}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
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
        if (next) form.reset(EMPTY);
        setOpen(next);
      }}
    >
      <SheetTrigger asChild>
        <Button className="min-h-11">
          <PlusIcon aria-hidden />
          {ADD_LABEL}
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{ADD_LABEL}</SheetTitle>
          <SheetDescription>
            Pour les nœuds qui ne s&apos;enregistrent pas seuls. Un SNI devient un nœud ; republier un groupe le remplace.
          </SheetDescription>
        </SheetHeader>
        <form onSubmit={form.handleSubmit(submit)} className="flex flex-1 flex-col gap-4 px-4" noValidate>
          <FieldGroup>
            <VlessPaste
              onFields={(f) => {
                const current = form.getValues();
                form.reset({
                  ...current,
                  label: current.label || f.label,
                  address: f.address,
                  port: f.port,
                  snis: f.sni,
                  hostHeader: f.hostHeader,
                  wsPath: f.wsPath,
                  uuid: f.uuid,
                });
              }}
            />
            {text("group", "Groupe", { hint: "Ex. « cloudrun-uswest1 ». Minuscules, chiffres et tirets." })}
            {text("label", "Nom affiché", { hint: "Numéroté s'il y a plusieurs SNI." })}
            {text("region", "Région", { hint: "Ex. « Oregon »." })}
            {text("address", "Adresse", { hint: "IP ou nom que l'app contacte ; avec le fronting, celle du frontal.", mono: true })}
            {text("port", "Port", { numeric: true })}
            <Controller
              name="snis"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="manual-snis">SNI</FieldLabel>
                  <Textarea
                    {...field}
                    id="manual-snis"
                    rows={4}
                    className="font-mono"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    aria-invalid={fieldState.invalid}
                  />
                  <FieldDescription>Un par ligne, 12 au plus.</FieldDescription>
                  {fieldState.error && <FieldError>{fieldState.error.message}</FieldError>}
                </Field>
              )}
            />
            {text("hostHeader", "Host WebSocket", { hint: "Seulement s'il diffère du SNI (fronting vers Cloud Run).", mono: true })}
            {text("wsPath", "Chemin WebSocket", { mono: true })}
            {text("uuid", "UUID du client", { hint: "Chiffré en base, jamais réaffiché.", mono: true })}
            {text("ttlHours", "Durée (heures)", { numeric: true, hint: "1 à 720. Le nœud sort du pool ensuite." })}
            <Controller
              name="tier"
              control={form.control}
              render={({ field }) => (
                <Field>
                  <FieldLabel>Nature</FieldLabel>
                  <SegmentedControl<EndpointTier>
                    label="Nature des nœuds"
                    options={TIER_OPTIONS}
                    value={field.value}
                    onValueChange={field.onChange}
                  />
                  <FieldDescription>Servis uniquement aux forfaits de même nature (D45).</FieldDescription>
                </Field>
              )}
            />
          </FieldGroup>
          <SheetFooter className="px-0">
            <Button type="submit" className="h-11 w-full" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting && <Spinner />}
              {SUBMIT_LABEL}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
