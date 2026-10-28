"use client";

import * as React from "react";
import { toast } from "sonner";
import { StatusBadge } from "@/components/common/status-badge";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { formatBps } from "@/lib/format";
import { updateCommunityAction } from "@/server/actions/communities.action";
import type { Community } from "@/server/services/communities/communities.schema";
import { isWhatsappGroupUrl, normalizeCameroonWhatsapp } from "@/server/services/onboarding/onboarding.schema";

export function CommunitySettingsCard({
  community,
  isOwner = false,
}: {
  community: Community;
  isOwner?: boolean;
}) {
  const [pending, startTransition] = React.useTransition();
  const [name, setName] = React.useState(community.name);
  const [whatsappGroupUrl, setWhatsappGroupUrl] = React.useState(community.whatsappGroupUrl ?? "");
  const [contactWhatsapp, setContactWhatsapp] = React.useState(community.contactWhatsapp ?? "+237");
  const [commissionPercent, setCommissionPercent] = React.useState(
    String((community.commissionBps ?? 1500) / 100),
  );

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim().length < 2) {
      toast.error("Le nom de la communauté doit contenir au moins 2 caractères.");
      return;
    }
    if (whatsappGroupUrl.trim() && !isWhatsappGroupUrl(whatsappGroupUrl)) {
      toast.error("Lien de groupe WhatsApp invalide (attendu : https://chat.whatsapp.com/...).");
      return;
    }
    const normalizedWa = contactWhatsapp.trim()
      ? normalizeCameroonWhatsapp(contactWhatsapp)
      : null;
    if (contactWhatsapp.trim() && contactWhatsapp.trim() !== "+237" && !normalizedWa) {
      toast.error("Numéro WhatsApp invalide (+237 suivi de 9 chiffres).");
      return;
    }

    startTransition(async () => {
      const payload: Record<string, unknown> = {
        name: name.trim(),
        whatsappGroupUrl: whatsappGroupUrl.trim(),
        contactWhatsapp: normalizedWa ?? "",
      };
      if (isOwner) {
        payload.commissionPercent = commissionPercent;
      }
      const res = await updateCommunityAction(community.id, payload);
      if (res.ok) {
        toast.success("Réglages de la communauté enregistrés.");
      } else {
        toast.error(res.message);
      }
    });
  };

  return (
    <form
      onSubmit={handleSave}
      className="flex flex-col gap-5 rounded-section border border-separator bg-background p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-separator pb-4">
        <div>
          <h3 className="text-title-3 font-semibold text-foreground">{community.name}</h3>
          <p className="font-mono text-footnote text-muted-foreground">
            Identifiant : {community.slug} · Commission : {formatBps(community.commissionBps)}
          </p>
        </div>
        <StatusBadge status={community.status} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="comm-settings-name">Nom de la communauté</FieldLabel>
          <Input
            id="comm-settings-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="comm-settings-wa">Numéro WhatsApp du support</FieldLabel>
          <Input
            id="comm-settings-wa"
            value={contactWhatsapp}
            onChange={(e) => setContactWhatsapp(e.target.value)}
            placeholder="+237690000000"
          />
          <FieldDescription>
            Numéro de contact affiché aux abonnés de votre communauté.
          </FieldDescription>
        </Field>
      </div>

      <Field>
        <FieldLabel htmlFor="comm-settings-group">Lien d&apos;invitation du groupe WhatsApp</FieldLabel>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            id="comm-settings-group"
            className="flex-1"
            value={whatsappGroupUrl}
            onChange={(e) => setWhatsappGroupUrl(e.target.value)}
            placeholder="https://chat.whatsapp.com/InviteCode123"
          />
          {isWhatsappGroupUrl(whatsappGroupUrl) ? (
            <Button asChild variant="outline" size="sm">
              <a href={whatsappGroupUrl.trim()} target="_blank" rel="noreferrer">
                Tester le lien
              </a>
            </Button>
          ) : null}
        </div>
        <FieldDescription>
          Après leur premier abonnement payé, l&apos;application Android propose de rejoindre ce groupe WhatsApp.
        </FieldDescription>
      </Field>

      {isOwner ? (
        <Field className="max-w-xs">
          <FieldLabel htmlFor="comm-settings-comm">Taux de commission (%) — Propriétaire</FieldLabel>
          <Input
            id="comm-settings-comm"
            value={commissionPercent}
            onChange={(e) => setCommissionPercent(e.target.value)}
          />
          <FieldDescription>Entre 0 % et 30 % du prix de vente.</FieldDescription>
        </Field>
      ) : null}

      <div className="flex justify-end border-t border-separator pt-4">
        <Button type="submit" disabled={pending}>
          {pending ? <Spinner /> : null}
          Enregistrer les réglages
        </Button>
      </div>
    </form>
  );
}
