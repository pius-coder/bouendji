"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Icon } from "@/components/common/icon";
import { SegmentedControl } from "@/components/common/segmented-control";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { createAdminAction } from "@/server/actions/admins.action";

type PlatformRole = "none" | "owner";
const ROLE_OPTIONS = [
  { value: "none", label: "Personnel" },
  { value: "owner", label: "Propriétaire" },
] as const;

/**
 * Créer un compte d'administration. « Personnel » n'a aucun droit tant qu'il n'est
 * pas ajouté à une communauté (écran Membres) ; « Propriétaire » voit tout.
 */
export function CreateAdminSheet() {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState({ email: "", name: "", password: "", platformRole: "none" as PlatformRole });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  const set = (key: keyof typeof values) => (e: React.ChangeEvent<HTMLInputElement>) => setValues((v) => ({ ...v, [key]: e.target.value }));

  function submit() {
    startTransition(async () => {
      const result = await createAdminAction(values);
      if (result.ok) {
        toast.success("Compte créé. Ajoutez-le à une communauté depuis Membres.");
        setValues({ email: "", name: "", password: "", platformRole: "none" });
        setErrors({});
        setOpen(false);
      } else {
        setErrors(result.details ?? {});
        if (!result.details) toast.error(result.message);
      }
    });
  }

  const field = (key: "email" | "name" | "password", label: string, extra: { type?: string; hint?: string; autoComplete?: string } = {}) => (
    <Field data-invalid={Boolean(errors[key])}>
      <FieldLabel htmlFor={`admin-${key}`}>{label}</FieldLabel>
      <Input
        id={`admin-${key}`}
        type={extra.type ?? "text"}
        autoComplete={extra.autoComplete ?? "off"}
        value={values[key]}
        onChange={set(key)}
        aria-invalid={Boolean(errors[key])}
      />
      {extra.hint ? <FieldDescription>{extra.hint}</FieldDescription> : null}
      {errors[key] ? <FieldError>{errors[key]}</FieldError> : null}
    </Field>
  );

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button>
          <Icon name="plus" /> Nouveau compte
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full overflow-y-auto sm:max-w-[500px]">
        <SheetHeader>
          <SheetTitle>Nouveau compte d&apos;administration</SheetTitle>
          <SheetDescription>Transmettez le mot de passe provisoire par un canal sûr.</SheetDescription>
        </SheetHeader>
        <FieldGroup className="px-5">
          {field("name", "Nom")}
          {field("email", "Email", { type: "email" })}
          {field("password", "Mot de passe provisoire", { type: "password", autoComplete: "new-password", hint: "12 caractères au moins." })}
          <Field>
            <FieldLabel>Portée</FieldLabel>
            <SegmentedControl<PlatformRole>
              label="Portée du compte"
              options={ROLE_OPTIONS}
              value={values.platformRole}
              onValueChange={(platformRole) => setValues((v) => ({ ...v, platformRole }))}
            />
            <FieldDescription>Personnel : aucun droit avant d&apos;être ajouté à une communauté.</FieldDescription>
          </Field>
        </FieldGroup>
        <SheetFooter>
          <Button onClick={submit} disabled={pending}>
            {pending ? <Spinner /> : null} Créer le compte
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
