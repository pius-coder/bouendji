"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Icon } from "@/components/common/icon";
import { StatusBadge } from "@/components/common/status-badge";
import { ConfirmDialog } from "@/components/page/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { setCommunityStatusAction, updateCommunityAction } from "@/server/actions/communities.action";
import type { Community } from "@/server/services/communities/communities.schema";

/**
 * Tiroir de communauté (owner, community.manage) : nom, commission, WhatsApp, suspension.
 * Suspendre coupe le service de l'app de la communauté : confirmation obligatoire.
 */
export function CommunityDrawer({ community }: { community: Community }) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [name, setName] = useState(community.name);
  const [percent, setPercent] = useState(String(community.commissionBps / 100));
  const [whatsappGroupUrl, setWhatsappGroupUrl] = useState(community.whatsappGroupUrl ?? "");
  const [contactWhatsapp, setContactWhatsapp] = useState(community.contactWhatsapp ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  const suspended = community.suspended || community.status === "suspended";

  function save() {
    startTransition(async () => {
      const result = await updateCommunityAction(community.id, {
        name,
        commissionPercent: percent,
        whatsappGroupUrl,
        contactWhatsapp,
      });
      if (result.ok) {
        toast.success("Communauté enregistrée");
        setErrors({});
        setOpen(false);
      } else {
        setErrors({
          name: result.details?.name ?? "",
          commissionPercent: result.details?.commissionPercent ?? result.details?.commissionBps ?? "",
          whatsappGroupUrl: result.details?.whatsappGroupUrl ?? "",
          contactWhatsapp: result.details?.contactWhatsapp ?? "",
        });
        if (!result.details) toast.error(result.message);
      }
    });
  }

  function toggle() {
    startTransition(async () => {
      const result = await setCommunityStatusAction(community.id, suspended ? "active" : "suspended");
      if (result.ok) {
        toast.success(suspended ? "Communauté reprise" : "Communauté suspendue");
        setConfirm(false);
        setOpen(false);
      } else toast.error(result.message);
    });
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setName(community.name);
          setPercent(String(community.commissionBps / 100));
          setWhatsappGroupUrl(community.whatsappGroupUrl ?? "");
          setContactWhatsapp(community.contactWhatsapp ?? "");
          setErrors({});
        }
        setOpen(next);
      }}
    >
      <SheetTrigger asChild>
        <Button variant="outline" size="sm">
          Gérer
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full overflow-y-auto sm:max-w-[500px]">
        <SheetHeader>
          <SheetTitle>{community.name}</SheetTitle>
          <SheetDescription>
            <span className="font-mono">{community.slug}</span>
          </SheetDescription>
          <div className="flex flex-wrap items-center gap-2 pt-2">
            <StatusBadge status={suspended ? "suspended" : community.status} />
            <Button size="sm" variant={suspended ? "tinted" : "destructive"} onClick={() => setConfirm(true)} disabled={pending}>
              <Icon name={suspended ? "refresh" : "forbidden"} />
              {suspended ? "Reprendre" : "Suspendre"}
            </Button>
          </div>
        </SheetHeader>
        <FieldGroup className="px-5">
          <Field data-invalid={Boolean(errors.name)}>
            <FieldLabel htmlFor="community-edit-name">Nom</FieldLabel>
            <Input id="community-edit-name" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={Boolean(errors.name)} />
            {errors.name ? <FieldError>{errors.name}</FieldError> : null}
          </Field>
          <Field data-invalid={Boolean(errors.commissionPercent)}>
            <FieldLabel htmlFor="community-edit-commission">Commission (%)</FieldLabel>
            <Input
              id="community-edit-commission"
              inputMode="decimal"
              value={percent}
              onChange={(e) => setPercent(e.target.value)}
              aria-invalid={Boolean(errors.commissionPercent)}
            />
            <FieldDescription>Entre 0 et 30. S&apos;applique aux prochaines ventes.</FieldDescription>
            {errors.commissionPercent ? <FieldError>{errors.commissionPercent}</FieldError> : null}
          </Field>
          <Field data-invalid={Boolean(errors.whatsappGroupUrl)}>
            <FieldLabel htmlFor="community-edit-wa-group">Lien du groupe WhatsApp</FieldLabel>
            <div className="flex gap-2">
              <Input
                id="community-edit-wa-group"
                placeholder="https://chat.whatsapp.com/..."
                value={whatsappGroupUrl}
                onChange={(e) => setWhatsappGroupUrl(e.target.value)}
                aria-invalid={Boolean(errors.whatsappGroupUrl)}
              />
              {whatsappGroupUrl.trim().startsWith("https://chat.whatsapp.com/") ? (
                <Button asChild variant="outline" size="sm" className="shrink-0">
                  <a href={whatsappGroupUrl.trim()} target="_blank" rel="noopener noreferrer">
                    Tester
                  </a>
                </Button>
              ) : null}
            </div>
            <FieldDescription>Affiché dans le pop-up de bienvenue de l&apos;application.</FieldDescription>
            {errors.whatsappGroupUrl ? <FieldError>{errors.whatsappGroupUrl}</FieldError> : null}
          </Field>
          <Field data-invalid={Boolean(errors.contactWhatsapp)}>
            <FieldLabel htmlFor="community-edit-wa-contact">Numéro WhatsApp de contact</FieldLabel>
            <Input
              id="community-edit-wa-contact"
              inputMode="tel"
              placeholder="+237 6XX XXX XXX"
              value={contactWhatsapp}
              onChange={(e) => setContactWhatsapp(e.target.value)}
              aria-invalid={Boolean(errors.contactWhatsapp)}
            />
            <FieldDescription>Numéro vers lequel les abonnés demandent de l&apos;aide.</FieldDescription>
            {errors.contactWhatsapp ? <FieldError>{errors.contactWhatsapp}</FieldError> : null}
          </Field>
        </FieldGroup>
        <SheetFooter>
          <Button onClick={save} disabled={pending}>
            {pending ? <Spinner /> : null} Enregistrer
          </Button>
        </SheetFooter>
        <ConfirmDialog
          open={confirm}
          onOpenChange={setConfirm}
          title={suspended ? `Reprendre « ${community.name} » ?` : `Suspendre « ${community.name} » ?`}
          description={
            suspended
              ? "L'application de la communauté sert de nouveau ses abonnés."
              : "Les abonnés de la communauté perdent l'accès tant que la suspension dure."
          }
          confirmLabel={suspended ? "Reprendre" : "Suspendre"}
          pending={pending}
          onConfirm={toggle}
        />
      </SheetContent>
    </Sheet>
  );
}
