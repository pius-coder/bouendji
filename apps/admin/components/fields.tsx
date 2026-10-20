"use client";

import { useId, type ReactNode } from "react";

interface TextFieldProps {
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
  type?: "text" | "email" | "password" | "number";
  name?: string;
  required?: boolean;
  min?: number | string;
  max?: number | string;
  step?: number | string;
  minLength?: number;
  maxLength?: number;
  autoComplete?: string;
  placeholder?: string;
  spellCheck?: boolean;
  disabled?: boolean;
}

export function TextField({
  label,
  hint,
  value,
  onChange,
  type = "text",
  name,
  required,
  min,
  max,
  step,
  minLength,
  maxLength,
  autoComplete = "off",
  placeholder,
  spellCheck,
  disabled,
}: TextFieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        className="input"
        type={type}
        name={name}
        value={value}
        required={required}
        min={min}
        max={max}
        step={step}
        minLength={minLength}
        maxLength={maxLength}
        autoComplete={autoComplete}
        placeholder={placeholder}
        spellCheck={spellCheck}
        disabled={disabled}
        aria-describedby={hintId}
        onChange={(event) => onChange(event.target.value)}
      />
      {hint ? (
        <p className="hint" id={hintId}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

interface NumberFieldProps {
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
}

export function NumberField({ label, hint, value, onChange, min, max, step = 1, disabled }: NumberFieldProps) {
  return (
    <TextField
      label={label}
      hint={hint}
      value={value}
      onChange={onChange}
      type="number"
      min={min}
      max={max}
      step={step}
      disabled={disabled}
    />
  );
}

/** Entrée compacte de tableau : libellé en `sr-only`, lié par `htmlFor`. */
export function CompactNumberField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  disabled,
}: NumberFieldProps) {
  const id = useId();
  return (
    <div className="field field-inline">
      <label className="sr-only" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className="input input-compact"
        type="number"
        inputMode="numeric"
        value={value}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

export interface Option {
  value: string;
  label: string;
}

interface SelectFieldProps {
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  disabled?: boolean;
  compact?: boolean;
  /** Libellé masqué visuellement, mais lu par les technologies d'assistance. */
  hideLabel?: boolean;
}

export function SelectField({
  label,
  hint,
  value,
  onChange,
  options,
  disabled,
  compact,
  hideLabel,
}: SelectFieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  return (
    <div className={compact ? "field field-inline" : "field"}>
      <label className={hideLabel ? "sr-only" : undefined} htmlFor={id}>
        {label}
      </label>
      <select
        id={id}
        className={compact ? "select select-compact" : "select"}
        value={value}
        disabled={disabled}
        aria-describedby={hintId}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {hint ? (
        <p className="hint" id={hintId}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function FormError({ message }: { message: string }) {
  return (
    <p className="form-error" role="alert" hidden={!message}>
      {message}
    </p>
  );
}

export function FormActions({ children }: { children: ReactNode }) {
  return <div className="actions span-all">{children}</div>;
}
