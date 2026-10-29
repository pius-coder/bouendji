"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { EyeIcon, EyeOffIcon } from "@/components/common/icon-compat";
import { notify } from "@/components/common/toast";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import { changePasswordAction } from "@/server/actions/auth-account.action";
import type { ActionResult } from "@/server/actions/action-result";
import { PASSWORD_MIN_LENGTH } from "@/server/services/admin-auth/admin-auth.schema";
import {
  canSubmitPassword,
  passwordErrors,
  passwordStrength,
  type PasswordErrors,
} from "./password-rules";

const LABELS = {
  currentPassword: "Mot de passe actuel",
  newPassword: "Nouveau mot de passe",
  confirmPassword: "Confirmer le nouveau mot de passe",
  submit: "Changer le mot de passe",
  show: "Afficher les mots de passe",
  hide: "Masquer les mots de passe",
  success: "Mot de passe changé.",
  successDetail: "Tes autres sessions ont été déconnectées.",
};

const EMPTY = { currentPassword: "", newPassword: "", confirmPassword: "" };

type Values = typeof EMPTY;

/**
 * Changement de mot de passe. Sert à la page forcée (`/mot-de-passe`, avec
 * `redirectTo="/"`) et à l'onglet du compte (sans redirection : le formulaire se
 * vide). Succès : toast, nouveau cookie posé par l'action.
 */
export function PasswordChangeForm({ redirectTo }: { redirectTo?: string }) {
  const router = useRouter();
  const [values, setValues] = useState<Values>(EMPTY);
  const [visible, setVisible] = useState(false);
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(async (_prev, form) => {
    const result = await changePasswordAction(form);
    if (result.ok) {
      notify.success(LABELS.success, LABELS.successDetail);
      if (redirectTo) router.replace(redirectTo);
      else setValues(EMPTY);
    }
    return result;
  }, null);

  const live: PasswordErrors = passwordErrors(values);
  const server = state && !state.ok ? state.details : undefined;
  const errorOf = (field: keyof Values): string | undefined => live[field] ?? server?.[field];
  const strength = passwordStrength(values.newPassword);
  const type = visible ? "text" : "password";

  return (
    <form action={action} noValidate className="flex flex-col gap-6">
      <FieldGroup>
        <Field data-invalid={errorOf("currentPassword") ? true : undefined}>
          <FieldLabel htmlFor="currentPassword">{LABELS.currentPassword}</FieldLabel>
          <InputGroup className="h-11">
            <InputGroupInput
              id="currentPassword"
              name="currentPassword"
              type={type}
              autoComplete="current-password"
              value={values.currentPassword}
              onChange={(e) => setValues((v) => ({ ...v, currentPassword: e.target.value }))}
              aria-invalid={errorOf("currentPassword") ? true : undefined}
              required
            />
          </InputGroup>
          {errorOf("currentPassword") && <FieldError>{errorOf("currentPassword")}</FieldError>}
        </Field>

        <Field data-invalid={errorOf("newPassword") ? true : undefined}>
          <FieldLabel htmlFor="newPassword">{LABELS.newPassword}</FieldLabel>
          <InputGroup className="h-11">
            <InputGroupInput
              id="newPassword"
              name="newPassword"
              type={type}
              autoComplete="new-password"
              value={values.newPassword}
              onChange={(e) => setValues((v) => ({ ...v, newPassword: e.target.value }))}
              aria-invalid={errorOf("newPassword") ? true : undefined}
              aria-describedby="newPassword-strength"
              required
            />
            <InputGroupAddon align="inline-end">
              <InputGroupButton
                size="icon-xs"
                aria-label={visible ? LABELS.hide : LABELS.show}
                onClick={() => setVisible((v) => !v)}
              >
                {visible ? <EyeOffIcon aria-hidden /> : <EyeIcon aria-hidden />}
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
          <Strength id="newPassword-strength" score={strength.score} label={strength.label} length={values.newPassword.length} />
          {errorOf("newPassword") && <FieldError>{errorOf("newPassword")}</FieldError>}
        </Field>

        <Field data-invalid={errorOf("confirmPassword") ? true : undefined}>
          <FieldLabel htmlFor="confirmPassword">{LABELS.confirmPassword}</FieldLabel>
          <InputGroup className="h-11">
            <InputGroupInput
              id="confirmPassword"
              name="confirmPassword"
              type={type}
              autoComplete="new-password"
              value={values.confirmPassword}
              onChange={(e) => setValues((v) => ({ ...v, confirmPassword: e.target.value }))}
              aria-invalid={errorOf("confirmPassword") ? true : undefined}
              required
            />
          </InputGroup>
          {errorOf("confirmPassword") && <FieldError>{errorOf("confirmPassword")}</FieldError>}
        </Field>

        {state && !state.ok && !state.details && <FieldError role="alert">{state.message}</FieldError>}

        <Button type="submit" size="lg" disabled={pending || !canSubmitPassword(values)}>
          {pending && <Spinner />}
          {LABELS.submit}
        </Button>
      </FieldGroup>
    </form>
  );
}

/** Jauge à quatre segments, annoncée par son libellé (pas seulement par la couleur). */
function Strength({ id, score, label, length }: { id: string; score: number; label: string; length: number }) {
  if (length === 0) {
    return (
      <p id={id} className="text-footnote text-muted-foreground">
        Mot de passe libre.
      </p>
    );
  }
  return (
    <div id={id} className="flex flex-col gap-1.5">
      <div aria-hidden className="grid grid-cols-4 gap-1">
        {[1, 2, 3, 4].map((segment) => (
          <span
            key={segment}
            className={`h-1 rounded-full ${score >= segment ? (score >= 3 ? "bg-success" : "bg-warning") : "bg-group-strong"}`}
          />
        ))}
      </div>
      <p className="text-footnote text-muted-foreground" aria-live="polite">
        Force : {label}
      </p>
    </div>
  );
}
