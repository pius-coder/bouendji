"use client";

import { EyeIcon, EyeOffIcon } from "@/components/common/icon-compat";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import { loginAction } from "@/server/actions/auth.action";
import type { ActionFailure } from "@/server/api/api-error";

const IDENTIFIER_LABEL = "Email ou numéro WhatsApp";
const IDENTIFIER_HELP = "Votre email, ou votre numéro sans +237 (9 chiffres).";
const PASSWORD_LABEL = "Mot de passe";
const SUBMIT_LABEL = "Se connecter";
const SHOW_LABEL = "Afficher le mot de passe";
const HIDE_LABEL = "Masquer le mot de passe";

/**
 * Connexion par email ou numéro WhatsApp. La clé console est ajoutée par le serveur,
 * jamais saisie. `next` arrive en prop (lu côté serveur par la page). Les erreurs
 * de champ sont rattachées à leur champ ; les autres s'affichent en tête du bouton.
 */
export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<ActionFailure | null, FormData>(loginAction, null);
  const [visible, setVisible] = useState(false);
  const identifierError = state?.details?.identifier;
  const passwordError = state?.details?.password;

  return (
    <form action={action} noValidate>
      <input type="hidden" name="next" value={next} />
      <FieldGroup>
        <Field data-invalid={identifierError ? true : undefined}>
          <FieldLabel htmlFor="identifier">{IDENTIFIER_LABEL}</FieldLabel>
          <Input
            id="identifier"
            name="identifier"
            type="text"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            className="h-11"
            required
            aria-invalid={identifierError ? true : undefined}
            aria-describedby="identifier-help"
          />
          <FieldDescription id="identifier-help">{IDENTIFIER_HELP}</FieldDescription>
          {identifierError && <FieldError>{identifierError}</FieldError>}
        </Field>
        <Field data-invalid={passwordError ? true : undefined}>
          <FieldLabel htmlFor="password">{PASSWORD_LABEL}</FieldLabel>
          <InputGroup className="h-11">
            <InputGroupInput
              id="password"
              name="password"
              type={visible ? "text" : "password"}
              autoComplete="current-password"
              required
              aria-invalid={passwordError ? true : undefined}
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
          {passwordError && <FieldError>{passwordError}</FieldError>}
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
