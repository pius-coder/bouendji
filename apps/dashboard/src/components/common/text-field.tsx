"use client";

import { Icon } from "./icon";
import { useId, useRef, useState, type ComponentProps, type ReactNode, type Ref } from "react";
import { cn } from "@/lib/utils";

type InputProps = Omit<ComponentProps<"input">, "size">;

export interface TextFieldProps extends InputProps {
  /** Libellé TOUJOURS visible (le placeholder n'est qu'un exemple de format). */
  label: string;
  /** Aide sous le champ (format attendu, conséquence). */
  hint?: ReactNode;
  /** Erreur : dit comment corriger. Passe le champ en `aria-invalid`. */
  error?: string;
  /** Bouton d'effacement à la fin quand le champ contient du texte (défaut : oui, sauf mot de passe). */
  clearable?: boolean;
  /** Icône de rôle au début du champ. */
  leading?: ReactNode;
  /** Élément à la fin (unité, bouton). */
  trailing?: ReactNode;
  ref?: Ref<HTMLInputElement>;
  containerClassName?: string;
}

/** Vide le champ comme une frappe : react-hook-form et `onChange` restent informés. */
function clearNative(input: HTMLInputElement | null) {
  if (!input) return;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, "");
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.focus();
}

function useFieldIds(id: string | undefined) {
  const auto = useId();
  const fieldId = id ?? auto;
  return { fieldId, hintId: `${fieldId}-hint`, errorId: `${fieldId}-error` };
}

/**
 * Champ autonome « à la Apple » (règles §5.1) : fond gris, rayon 12, 44 px, aucun
 * trait ; libellé au-dessus (footnote) ; focus clavier = anneau 2 px. Compatible
 * `register()` de react-hook-form (props et `ref` transmis à l'`<input>`).
 */
export function TextField({
  label,
  hint,
  error,
  clearable,
  leading,
  trailing,
  id,
  className,
  containerClassName,
  ref,
  onChange,
  type = "text",
  ...props
}: TextFieldProps) {
  const { fieldId, hintId, errorId } = useFieldIds(id);
  const inner = useRef<HTMLInputElement | null>(null);
  const [hasValue, setHasValue] = useState(Boolean(props.value ?? props.defaultValue));
  const showClear = (clearable ?? type !== "password") && hasValue && !props.disabled && !props.readOnly;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ") || undefined;

  return (
    <div className={cn("flex flex-col gap-1.5", containerClassName)}>
      <label htmlFor={fieldId} className="px-1 text-footnote font-medium text-foreground">
        {label}
        {props.required ? <RequiredMark /> : null}
      </label>
      <div
        className={cn(
          "flex min-h-11 items-center gap-2 rounded-field bg-fill px-3 transition-shadow",
          "focus-within:ring-2 focus-within:ring-ring",
          "contrast-more:shadow-[inset_0_0_0_1px_var(--muted-foreground)]",
          error && "shadow-[inset_0_0_0_1px_var(--destructive)]",
          props.disabled && "opacity-50",
        )}
      >
        {leading ? <span className="shrink-0 text-muted-foreground [&_svg]:size-[1.125rem]">{leading}</span> : null}
        <input
          id={fieldId}
          ref={(node) => {
            inner.current = node;
            if (typeof ref === "function") ref(node);
            else if (ref) ref.current = node;
          }}
          type={type}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          onChange={(event) => {
            setHasValue(event.currentTarget.value.length > 0);
            onChange?.(event);
          }}
          className={cn(
            "h-11 min-w-0 flex-1 bg-transparent text-foreground outline-none placeholder:text-placeholder disabled:cursor-not-allowed",
            "[&::-webkit-search-cancel-button]:appearance-none",
            className,
          )}
          {...props}
        />
        {showClear ? (
          <button
            type="button"
            aria-label={`Effacer ${label.toLowerCase()}`}
            onClick={() => {
              clearNative(inner.current);
              setHasValue(false);
            }}
            className="-me-1 flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground/70 outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Icon name="close-circle" className="size-[1.125rem] fill-current stroke-fill" />
          </button>
        ) : null}
        {trailing}
      </div>
      {error ? (
        <p id={errorId} className="px-1 text-footnote text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="px-1 text-footnote text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** Mot de passe : jamais pré-rempli, bouton pour afficher/masquer, pas d'effacement. */
export function SecureField(props: Omit<TextFieldProps, "type" | "clearable" | "trailing">) {
  const [visible, setVisible] = useState(false);
  return (
    <TextField
      {...props}
      type={visible ? "text" : "password"}
      clearable={false}
      autoComplete={props.autoComplete ?? "current-password"}
      trailing={
        <button
          type="button"
          aria-label={visible ? "Masquer le mot de passe" : "Afficher le mot de passe"}
          aria-pressed={visible}
          onClick={() => setVisible((v) => !v)}
          className="-me-1 flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {visible ? <Icon name="eye-closed" className="size-[1.125rem]" /> : <Icon name="eye" className="size-[1.125rem]" />}
        </button>
      }
    />
  );
}

/**
 * Champ DANS une liste groupée (formulaires de feuille) : la ligne est le champ.
 * Libellé au début, saisie à la suite ; erreur sous la ligne. À placer dans un
 * `GroupedSection`.
 */
export function TextFieldRow({
  label,
  error,
  hint,
  id,
  className,
  ref,
  ...props
}: Omit<TextFieldProps, "leading" | "trailing" | "clearable" | "containerClassName">) {
  const { fieldId, hintId, errorId } = useFieldIds(id);
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className="relative before:absolute before:inset-x-0 before:top-0 before:start-4 before:h-px before:bg-separator first:before:hidden">
      <div className="flex min-h-11 items-center gap-3 px-4 focus-within:bg-accent/40">
        <label htmlFor={fieldId} className="w-32 shrink-0 text-body text-foreground md:w-40 md:text-subhead">
          {label}
          {props.required ? <RequiredMark /> : null}
        </label>
        <input
          id={fieldId}
          ref={ref}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn("h-11 min-w-0 flex-1 bg-transparent text-end text-foreground outline-none placeholder:text-placeholder", className)}
          {...props}
        />
      </div>
      {error ? (
        <p id={errorId} className="px-4 pb-2 text-footnote text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="px-4 pb-2 text-footnote text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}


/** Astérisque rouge (référence Chariow) + texte pour le lecteur d’écran. */
export function RequiredMark() {
  return (
    <>
      <span aria-hidden className="ms-0.5 text-destructive">
        *
      </span>
      <span className="sr-only"> (obligatoire)</span>
    </>
  );
}
