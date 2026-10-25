"use client";

import { EyeIcon, EyeOffIcon } from "@/components/common/icon-compat";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import { loginAction } from "@/server/actions/auth.action";
import type { ActionFailure } from "@/server/api/api-error";

const EMAIL_LABEL = "Email";
const PASSWORD_LABEL = "Mot de passe";
const SUBMIT_LABEL = "Se connecter";
const SHOW_LABEL = "Afficher le mot de passe";
const HIDE_LABEL = "Masquer le mot de passe";

/**
 * Connexion : email + mot de passe. La clé console est ajoutée par le serveur,
 * jamais saisie. `next` arrive en prop (lu côté serveur par la page).
 */
export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<ActionFailure | null, FormData>(loginAction, null);
  const [visible, setVisible] = useState(false);

  return (
    <form action={action} noValidate>
      <input type="hidden" name="next" value={next} />
      <FieldGroup>
        <Field data-invalid={state?.details?.email ? true : undefined}>
          <FieldLabel htmlFor="email">{EMAIL_LABEL}</FieldLabel>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            className="h-11"
            required
            aria-invalid={state?.details?.email ? true : undefined}
          />
          {state?.details?.email && <FieldError>{state.details.email}</FieldError>}
        </Field>
        <Field data-invalid={state?.details?.password ? true : undefined}>
          <FieldLabel htmlFor="password">{PASSWORD_LABEL}</FieldLabel>
          <InputGroup className="h-11">
            <InputGroupInput
              id="password"
              name="password"
              type={visible ? "text" : "password"}
              autoComplete="current-password"
              required
              aria-invalid={state?.details?.password ? true : undefined}
            />
            <InputGroupAddon align="inline-end">
              <InputGroupButton
                size="icon-xs"
                aria-label={visible ? HIDE_LABEL : SHOW_LABEL}
                onClick={() => setVisible((v) => !v)}
              >
                {visible ? <EyeOffIcon aria-hidden /> : <EyeIcon aria-hidden />}
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
          {state?.details?.password && <FieldError>{state.details.password}</FieldError>}
        </Field>
        {state && !state.details && (
          <FieldError role="alert">
            {state.message}
            {state.retryAfter ? ` Réessayez dans ${state.retryAfter} s.` : ""}
          </FieldError>
        )}
        <Button type="submit" size="lg" disabled={pending}>
          {pending && <Spinner />}
          {SUBMIT_LABEL}
        </Button>
      </FieldGroup>
    </form>
  );
}
