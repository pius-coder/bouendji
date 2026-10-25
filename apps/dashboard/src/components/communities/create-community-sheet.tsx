"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { PlusIcon } from "@/components/common/icon-compat";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { createCommunityAction } from "@/server/actions/communities.action";
import { communityFormSchema, type CommunityFormValues } from "@/server/services/communities/communities.schema";

const ADD_LABEL = "Nouvelle communauté";
const SUBMIT_LABEL = "Créer";

/**
 * Formulaire de création : react-hook-form + le MÊME schéma zod que l'action.
 * Les erreurs `details` de l'API (VALIDATION_FAILED) sont reversées dans les champs.
 */
export function CreateCommunitySheet() {
  const [open, setOpen] = useState(false);
  const form = useForm<CommunityFormValues>({
    resolver: zodResolver(communityFormSchema),
    defaultValues: { name: "", slug: "", commissionPercent: "" },
  });

  async function submit(values: CommunityFormValues) {
    const result = await createCommunityAction(values);
    if (result.ok) {
      toast.success("Communauté créée");
      form.reset();
      setOpen(false);
      return;
    }
    const fields = ["name", "slug", "commissionPercent"] as const;
    let placed = false;
    for (const field of fields) {
      const message = result.details?.[field] ?? (field === "commissionPercent" ? result.details?.commissionBps : undefined);
      if (message) {
        form.setError(field, { message });
        placed = true;
      }
    }
    if (!placed) toast.error(result.message);
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button className="min-h-11">
          <PlusIcon aria-hidden />
          {ADD_LABEL}
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{ADD_LABEL}</SheetTitle>
          <SheetDescription>L&apos;identifiant sert d&apos;adresse : il ne se change plus ensuite.</SheetDescription>
        </SheetHeader>
        <form onSubmit={form.handleSubmit(submit)} className="flex flex-1 flex-col gap-4 px-4" noValidate>
          <FieldGroup>
            <Controller
              name="name"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="community-name">Nom</FieldLabel>
                  <Input {...field} id="community-name" className="h-11" aria-invalid={fieldState.invalid} />
                  {fieldState.error && <FieldError>{fieldState.error.message}</FieldError>}
                </Field>
              )}
            />
            <Controller
              name="slug"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="community-slug">Identifiant</FieldLabel>
                  <Input
                    {...field}
                    id="community-slug"
                    className="h-11"
                    autoCapitalize="none"
                    autoCorrect="off"
                    aria-invalid={fieldState.invalid}
                  />
                  <FieldDescription>Minuscules, chiffres et tirets.</FieldDescription>
                  {fieldState.error && <FieldError>{fieldState.error.message}</FieldError>}
                </Field>
              )}
            />
            <Controller
              name="commissionPercent"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="community-commission">Commission (%)</FieldLabel>
                  <Input
                    {...field}
                    id="community-commission"
                    className="h-11"
                    inputMode="decimal"
                    aria-invalid={fieldState.invalid}
                  />
                  <FieldDescription>Entre 0 et 30. Vide : valeur par défaut de l&apos;API.</FieldDescription>
                  {fieldState.error && <FieldError>{fieldState.error.message}</FieldError>}
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
