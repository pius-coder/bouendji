"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Icon } from "@/components/common/icon";
import { SegmentedControl } from "@/components/common/segmented-control";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { createAdminAction } from "@/server/actions/admins.action";
import type { AdminCreated } from "@/server/services/admins/admins.schema";

type PlatformRole = "none" | "owner";
const ROLE_OPTIONS = [
  { value: "none", label: "Admin de communauté / Staff" },
  { value: "owner", label: "Propriétaire" },
] as const;

/**
 * Inviter un administrateur (R4). Aucun mot de passe n'est saisi : le serveur
 * génère un mot de passe provisoire affiché une seule fois, et prépare le lien
 * WhatsApp (`wa.me`) si un numéro est renseigné.
 */
export function CreateAdminSheet() {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState({ name: "", whatsappNumber: "", email: "", platformRole: "none" as PlatformRole });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [created, setCreated] = useState<AdminCreated | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();
  const set = (key: "name" | "whatsappNumber" | "email") => (e: React.ChangeEvent<HTMLInputElement>) =>
    setValues((v) => ({ ...v, [key]: e.target.value }));

  function submit() {
    startTransition(async () => {
      const result = await createAdminAction(values);
      if (result.ok) {
        setValues({ name: "", whatsappNumber: "", email: "", platformRole: "none" });
        setErrors({});
        setOpen(false);
        setCreated(result.data);
        toast.success("Compte créé. Transmettez les identifiants provisoires.");
      } else {
        setErrors(result.details ?? {});
        if (!result.details) toast.error(result.message);
      }
    });
  }

  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Copie impossible", { description: "Sélectionnez le mot de passe et copiez-le à la main." });
    }
  }

  return (
    <>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button>
            <Icon name="plus" /> Inviter un admin
          </Button>
        </SheetTrigger>
        <SheetContent className="w-full overflow-y-auto sm:max-w-[500px]">
          <SheetHeader>
            <SheetTitle>Inviter un administrateur</SheetTitle>
            <SheetDescription>
              Un mot de passe provisoire sera généré automatiquement. À sa première connexion, il choisira son mot de passe et créera sa marque.
            </SheetDescription>
          </SheetHeader>
          <FieldGroup className="px-5">
            <Field data-invalid={Boolean(errors.name)}>
              <FieldLabel htmlFor="admin-name">Nom complet</FieldLabel>
              <Input
                id="admin-name"
                autoComplete="off"
                placeholder="Ex. Jean-Marc Ndji"
                value={values.name}
                onChange={set("name")}
                aria-invalid={Boolean(errors.name)}
              />
              {errors.name ? <FieldError>{errors.name}</FieldError> : null}
            </Field>
            <Field data-invalid={Boolean(errors.whatsappNumber)}>
              <FieldLabel htmlFor="admin-whatsapp">Numéro WhatsApp</FieldLabel>
              <Input
                id="admin-whatsapp"
                inputMode="tel"
                autoComplete="off"
                placeholder="+237 6XX XXX XXX"
                value={values.whatsappNumber}
                onChange={set("whatsappNumber")}
                aria-invalid={Boolean(errors.whatsappNumber)}
              />
              <FieldDescription>Permet de se connecter sans email et d&apos;envoyer l&apos;invitation en un clic.</FieldDescription>
              {errors.whatsappNumber ? <FieldError>{errors.whatsappNumber}</FieldError> : null}
            </Field>
            <Field data-invalid={Boolean(errors.email)}>
              <FieldLabel htmlFor="admin-email">Email (facultatif si WhatsApp renseigné)</FieldLabel>
              <Input
                id="admin-email"
                type="email"
                autoComplete="off"
                placeholder="admin@exemple.com"
                value={values.email}
                onChange={set("email")}
                aria-invalid={Boolean(errors.email)}
              />
              {errors.email ? <FieldError>{errors.email}</FieldError> : null}
            </Field>
            <Field>
              <FieldLabel>Rôle plateforme</FieldLabel>
              <SegmentedControl<PlatformRole>
                label="Portée du compte"
                options={ROLE_OPTIONS}
                value={values.platformRole}
                onValueChange={(platformRole) => setValues((v) => ({ ...v, platformRole }))}
              />
              <FieldDescription>
                Admin de communauté : crée sa propre communauté et son application lors de son onboarding.
              </FieldDescription>
            </Field>
          </FieldGroup>
          <SheetFooter>
            <Button onClick={submit} disabled={pending}>
              {pending ? <Spinner /> : null} Créer et générer l&apos;accès
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <Dialog open={created !== null} onOpenChange={(next) => !next && setCreated(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Accès provisoire de {created?.name}</DialogTitle>
            <DialogDescription>
              Ce mot de passe est affiché une seule fois. Envoyez-le maintenant sur WhatsApp ou copiez-le.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2 rounded-xl bg-muted/40 p-4">
            <div className="flex items-center justify-between text-subhead">
              <span className="text-muted-foreground">Identifiant</span>
              <span className="font-mono font-medium text-foreground">
                {created?.whatsappNumber ? `+237 ${created.whatsappNumber}` : (created?.email ?? "—")}
              </span>
            </div>
            <div className="flex items-center justify-between text-subhead">
              <span className="text-muted-foreground">Mot de passe provisoire</span>
              <span className="select-all font-mono text-title-3 font-semibold text-foreground">
                {created?.temporaryPassword}
              </span>
            </div>
          </div>
          <DialogFooter className="flex-col gap-2 sm:flex-col">
            {created?.whatsappLink ? (
              <Button asChild className="min-h-11 w-full">
                <a href={created.whatsappLink} target="_blank" rel="noopener noreferrer">
                  Envoyer sur WhatsApp
                </a>
              </Button>
            ) : null}
            <Button
              variant="outline"
              className="min-h-11 w-full"
              onClick={() => created && copy(created.temporaryPassword)}
            >
              {copied ? "Copié" : "Copier le mot de passe"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
