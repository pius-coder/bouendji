"use client";

import { useActionState } from "react";
import { notify } from "@/components/common/toast";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { updateProfileAction } from "@/server/actions/auth-account.action";
import type { ActionResult } from "@/server/actions/action-result";

const LABELS = {
  name: "Nom",
  email: "Email",
  whatsapp: "Numéro WhatsApp",
  whatsappHelp: "9 chiffres, sans +237. Sert à la connexion et au support.",
  telegram: "Identifiant Telegram",
  telegramHelp: "Chat qui reçoit les alertes du réseau (identifiant numérique).",
  submit: "Enregistrer",
  saved: "Profil enregistré.",
};

export interface ProfileValues {
  name: string;
  email: string;
  whatsappNumber: string | null;
  telegramChatId: string | null;
  /** Rôle plateforme (owner ou reseau) : seul cas où l'ID Telegram est saisi. */
  platform: boolean;
}

/** Profil du compte. Les valeurs initiales arrivent du serveur ; l'email n'est pas modifiable ici. */
export function ProfileForm({ values }: { values: ProfileValues }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(async (_prev, form) => {
    const result = await updateProfileAction(form);
    if (result.ok) notify.success(LABELS.saved);
    return result;
  }, null);
  const details = state && !state.ok ? state.details : undefined;
  const generalError = state && !state.ok && !state.details ? state.message : undefined;

  return (
    <form action={action} noValidate className="flex max-w-lg flex-col gap-6">
      <FieldGroup>
        <Field data-invalid={details?.name ? true : undefined}>
          <FieldLabel htmlFor="name">{LABELS.name}</FieldLabel>
          <Input id="name" name="name" defaultValue={values.name} autoComplete="name" className="h-11" aria-invalid={details?.name ? true : undefined} />
          {details?.name && <FieldError>{details.name}</FieldError>}
        </Field>

        <Field>
          <FieldLabel htmlFor="email">{LABELS.email}</FieldLabel>
          <Input id="email" value={values.email} readOnly disabled className="h-11" />
        </Field>

        <Field data-invalid={details?.whatsappNumber ? true : undefined}>
          <FieldLabel htmlFor="whatsappNumber">{LABELS.whatsapp}</FieldLabel>
          <Input
            id="whatsappNumber"
            name="whatsappNumber"
            type="tel"
            inputMode="numeric"
            autoComplete="tel-national"
            defaultValue={values.whatsappNumber ?? ""}
            placeholder="6 99 00 11 22"
            className="h-11"
            aria-invalid={details?.whatsappNumber ? true : undefined}
            aria-describedby="whatsappNumber-help"
          />
          <FieldDescription id="whatsappNumber-help">{LABELS.whatsappHelp}</FieldDescription>
          {details?.whatsappNumber && <FieldError>{details.whatsappNumber}</FieldError>}
        </Field>

        {values.platform && (
          <Field data-invalid={details?.telegramChatId ? true : undefined}>
            <FieldLabel htmlFor="telegramChatId">{LABELS.telegram}</FieldLabel>
            <Input
              id="telegramChatId"
              name="telegramChatId"
              inputMode="numeric"
              defaultValue={values.telegramChatId ?? ""}
              className="h-11"
              aria-invalid={details?.telegramChatId ? true : undefined}
              aria-describedby="telegramChatId-help"
            />
            <FieldDescription id="telegramChatId-help">{LABELS.telegramHelp}</FieldDescription>
            {details?.telegramChatId && <FieldError>{details.telegramChatId}</FieldError>}
          </Field>
        )}

        {generalError && <FieldError role="alert">{generalError}</FieldError>}

        <div>
          <Button type="submit" size="lg" disabled={pending}>
            {pending && <Spinner />}
            {LABELS.submit}
          </Button>
        </div>
      </FieldGroup>
    </form>
  );
}
