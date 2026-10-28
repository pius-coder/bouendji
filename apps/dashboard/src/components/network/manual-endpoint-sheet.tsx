"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { PlusIcon } from "@/components/common/icon-compat";
import { Icon } from "@/components/common/icon";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { SegmentedControl } from "@/components/common/segmented-control";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
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

const RANDOM_WORDS = ["wouri", "sanaga", "fako", "benoue", "nyong", "kora", "savane", "baobab"] as const;

function generateRandomNodeName(): { group: string; label: string } {
  const word = RANDOM_WORDS[Math.floor(Math.random() * RANDOM_WORDS.length)] ?? "wouri";
  const num = Math.floor(10 + Math.random() * 89);
  return {
    group: `relais-${word}-${num}`,
    label: `Relais ${word.charAt(0).toUpperCase() + word.slice(1)} ${num}`,
  };
}

function makeEmpty(defaultLabel?: string): ManualEndpointFormValues {
  const rand = generateRandomNodeName();
  return {
    group: rand.group,
    label: defaultLabel || rand.label,
    region: "Francfort",
    address: "",
    port: "443",
    snis: "",
    hostHeader: "",
    wsPath: "/",
    uuid: "",
    ttlHours: "12",
    tier: "free-labs",
  };
}

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
    toast.success("Champs remplis automatiquement depuis le lien.");
  }
  return (
    <Field data-invalid={Boolean(error)}>
      <FieldLabel htmlFor="manual-vless">Lien VLESS (extraction automatique)</FieldLabel>
      <Input
        id="manual-vless"
        value={draft}
        placeholder="Coller le lien fourni par le serveur…"
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
      <FieldDescription>
        WebSocket + TLS uniquement ; le lien est décodé localement puis effacé aussitôt.
      </FieldDescription>
      {error ? <FieldError>{error}</FieldError> : null}
    </Field>
  );
}

function sniError(details: Record<string, string> | undefined): string | undefined {
  if (!details) return undefined;
  return details.snis ?? Object.entries(details).find(([key]) => key.startsWith("snis."))?.[1];
}

export function ManualEndpointSheet({ defaultLabel }: { defaultLabel?: string } = {}) {
  const [open, setOpen] = useState(false);
  const [techOpen, setTechOpen] = useState(false);
  const [lockedFromLink, setLockedFromLink] = useState(false);
  const form = useForm<ManualEndpointFormValues>({
    resolver: zodResolver(manualEndpointFormSchema),
    defaultValues: makeEmpty(defaultLabel),
  });

  async function submit(values: ManualEndpointFormValues) {
    const result = await addManualEndpointsAction(values);
    if (result.ok) {
      const { count, expiresAt } = result.data;
      toast.success(`${count} nœud${count > 1 ? "s" : ""} publié${count > 1 ? "s" : ""} · jusqu'au ${formatDateTime(expiresAt)}`);
      form.reset(makeEmpty(defaultLabel));
      setLockedFromLink(false);
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

  const regenerateName = () => {
    const rand = generateRandomNodeName();
    form.setValue("group", rand.group, { shouldDirty: true });
    form.setValue("label", rand.label, { shouldDirty: true });
  };

  const text = (
    name: (typeof TEXT_FIELDS)[number],
    label: string,
    extra?: { hint?: string; numeric?: boolean; mono?: boolean; readOnly?: boolean },
  ) => (
    <Controller
      name={name}
      control={form.control}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid}>
          <FieldLabel htmlFor={`manual-${name}`}>{label}</FieldLabel>
          <Input
            {...field}
            id={`manual-${name}`}
            readOnly={extra?.readOnly}
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
        if (next) {
          form.reset(makeEmpty(defaultLabel));
          setLockedFromLink(false);
        }
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
            Collez un lien pour remplir automatiquement les paramètres techniques en lecture seule et attribuer un nom aléatoire.
          </SheetDescription>
        </SheetHeader>
        <form onSubmit={form.handleSubmit(submit)} className="flex flex-1 flex-col gap-4 px-4" noValidate>
          <FieldGroup>
            <VlessPaste
              onFields={(f) => {
                const current = form.getValues();
                const rand = generateRandomNodeName();
                form.reset({
                  ...current,
                  group: current.group || rand.group,
                  label: current.label || f.label || rand.label,
                  address: f.address,
                  port: f.port,
                  snis: f.sni,
                  hostHeader: f.hostHeader,
                  wsPath: f.wsPath,
                  uuid: f.uuid,
                });
                setLockedFromLink(true);
              }}
            />

            <div className="flex items-end gap-2">
              <div className="flex-1">
                {text("label", "Nom affiché (aléatoire)", { hint: "Nom convivial visible dans la console." })}
              </div>
              <Button type="button" variant="outline" className="h-11" onClick={regenerateName}>
                <Icon name="refresh" className="size-4" />
              </Button>
            </div>

            {text("group", "Identifiant de groupe", { hint: "Minuscules, chiffres et tirets.", mono: true })}
            {text("region", "Région", { hint: "Ex. « Francfort », « Oregon »." })}
            {text("ttlHours", "Durée de validité (heures)", { numeric: true, hint: "1 à 720. Le nœud sort du pool ensuite." })}

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

            <Collapsible
              open={techOpen || !lockedFromLink}
              onOpenChange={setTechOpen}
              className="rounded-section border border-separator bg-muted/25 p-3.5"
            >
              <CollapsibleTrigger className="flex w-full items-center justify-between text-start">
                <span className="text-subhead font-semibold text-foreground">
                  Paramètres techniques {lockedFromLink ? "(extraits en lecture seule)" : ""}
                </span>
                <Icon name={techOpen ? "chevron-up" : "chevron-down"} className="size-4 text-muted-foreground" />
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-3 flex flex-col gap-3">
                {text("address", "Adresse", { mono: true, readOnly: lockedFromLink })}
                {text("port", "Port", { numeric: true, readOnly: lockedFromLink })}
                <Controller
                  name="snis"
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor="manual-snis">SNI</FieldLabel>
                      <Textarea
                        {...field}
                        id="manual-snis"
                        rows={3}
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
                {text("hostHeader", "Host WebSocket", { mono: true, readOnly: lockedFromLink })}
                {text("wsPath", "Chemin WebSocket", { mono: true, readOnly: lockedFromLink })}
                {text("uuid", "UUID du client", { mono: true, readOnly: lockedFromLink })}
              </CollapsibleContent>
            </Collapsible>
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
