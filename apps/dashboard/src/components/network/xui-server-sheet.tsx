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
import { createXuiServerAction, testXuiServerAction } from "@/server/actions/network.action";
import { xuiServerFormSchema, type XuiServerFormValues } from "@/server/services/network/xui.schema";

type FieldName = Exclude<keyof XuiServerFormValues, "security">;

const EMPTY: XuiServerFormValues = {
  label: "",
  panelUrl: "",
  apiToken: "",
  inboundId: "",
  capacity: "",
  publicHost: "",
  publicPort: "443",
  security: "tls",
  sni: "",
  wsPath: "/",
  wsHost: "",
};

/** Ajout d'un panneau 3x-ui. Le jeton est saisi ici par l'owner, scellé par l'API et jamais réaffiché. */
export function XuiServerSheet() {
  const [open, setOpen] = useState(false);
  const form = useForm<XuiServerFormValues>({ resolver: zodResolver(xuiServerFormSchema), defaultValues: EMPTY });

  async function submit(values: XuiServerFormValues) {
    const result = await createXuiServerAction(values);
    if (result.ok) {
      toast.success("Serveur 3x-ui ajouté. Lancez « Tester » pour vérifier la connexion.");
      form.reset(EMPTY);
      setOpen(false);
      return;
    }
    let placed = false;
    for (const [key, message] of Object.entries(result.details ?? {})) {
      if (key in EMPTY && key !== "security" && message) {
        form.setError(key as FieldName, { message });
        placed = true;
      }
    }
    if (!placed) toast.error(result.message);
  }

  const text = (name: FieldName, label: string, hint?: string, secret = false) => (
    <Controller
      name={name}
      control={form.control}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid}>
          <FieldLabel htmlFor={`xui-${name}`}>{label}</FieldLabel>
          <Input
            {...field}
            id={`xui-${name}`}
            className="h-11"
            type={secret ? "password" : "text"}
            autoComplete="off"
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
        if (next) form.reset(EMPTY);
        setOpen(next);
      }}
    >
      <SheetTrigger asChild>
        <Button className="min-h-11">
          <PlusIcon aria-hidden />
          Ajouter un serveur
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Serveur 3x-ui</SheetTitle>
          <SheetDescription>
            Le panneau crée un client par abonné et compte sa data. L’inbound doit être un VLESS en WebSocket.
          </SheetDescription>
        </SheetHeader>
        <form onSubmit={form.handleSubmit(submit)} className="flex flex-1 flex-col gap-4 px-4" noValidate>
          <FieldGroup>
            {text("label", "Nom", "Ex. « GCP jour 1 ».")}
            {text("panelUrl", "Adresse du panneau", "Chemin de base compris, ex. https://hote:2053/abc123.")}
            {text("apiToken", "Jeton d’API du panneau", "Scellé côté serveur, jamais réaffiché.", true)}
            <div className="grid grid-cols-2 gap-3">
              {text("inboundId", "ID de l’inbound")}
              {text("capacity", "Capacité", "Abonnés max. Vide : défaut.")}
            </div>
            <p className="text-subheadline font-semibold">Ce que voit l’app</p>
            <div className="grid grid-cols-[1fr_6rem] gap-3">
              {text("publicHost", "Hôte public")}
              {text("publicPort", "Port")}
            </div>
            <Controller
              name="security"
              control={form.control}
              render={({ field }) => (
                <Field>
                  <FieldLabel>Sécurité</FieldLabel>
                  <SegmentedControl<"tls" | "none">
                    label="Sécurité de l'inbound"
                    options={[
                      { value: "tls", label: "TLS" },
                      { value: "none", label: "Aucune" },
                    ]}
                    value={field.value}
                    onValueChange={field.onChange}
                  />
                </Field>
              )}
            />
            {text("sni", "SNI", "Vide : l’hôte public.")}
            {text("wsPath", "Chemin WebSocket")}
            {text("wsHost", "Hôte WebSocket", "Vide : l’hôte public.")}
          </FieldGroup>
          <SheetFooter className="px-0">
            <Button type="submit" className="h-11 w-full" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting && <Spinner />}
              Ajouter
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

/** Test de connexion au panneau (lecture de l'inbound). */
export function XuiTestButton({ serverId }: { serverId: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="outline"
      size="sm"
      className="min-h-11 sm:min-h-9"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        const result = await testXuiServerAction(serverId);
        setBusy(false);
        if (!result.ok) toast.error(result.message);
        else if (result.data.ok) toast.success(result.data.message);
        else toast.error(result.data.message);
      }}
    >
      {busy && <Spinner />}
      Tester
    </Button>
  );
}
