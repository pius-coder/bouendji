"use client";

import type { ReactNode } from "react";
import { ApiError } from "@/lib/api";
import { dateTime, statusLabel } from "@/lib/format";

export function ScreenHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="section-head">
      <div>
        <h1>{title}</h1>
        {description ? <p className="lede">{description}</p> : null}
      </div>
      {actions ? <div className="actions">{actions}</div> : null}
    </div>
  );
}

export function Panel({
  title,
  description,
  actions,
  flush,
  children,
}: {
  title?: string;
  description?: string;
  actions?: ReactNode;
  flush?: boolean;
  children: ReactNode;
}) {
  return (
    <section className={flush ? "panel panel-flush" : "panel"}>
      {title || actions ? (
        <div className="panel-head">
          <div>
            {title ? <h2>{title}</h2> : null}
            {description ? <p className="muted">{description}</p> : null}
          </div>
          {actions ? <div className="actions">{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function Metric({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "ok" | "warn" | "danger";
}) {
  return (
    <article className="metric" data-tone={tone}>
      <p className="metric-label">{label}</p>
      <p className="metric-value">{value}</p>
      {hint ? <p className="metric-hint">{hint}</p> : null}
    </article>
  );
}

export function Facts({ children }: { children: ReactNode }) {
  return <dl className="facts">{children}</dl>;
}

export function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="fact">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

export function Notice({ children }: { children: ReactNode }) {
  return <p className="notice">{children}</p>;
}

export function EmptyPanel({ title, message }: { title: string; message: string }) {
  return (
    <section className="panel empty">
      <h2>{title}</h2>
      <p>{message}</p>
    </section>
  );
}

export function Loading({ label = "Chargement…" }: { label?: string }) {
  return (
    <div className="loading" role="status">
      <p className="muted">{label}</p>
    </div>
  );
}

export function AccessPanel({ title, message }: { title: string; message: string }) {
  return (
    <section className="panel error-panel">
      <h1>{title}</h1>
      <p>{message}</p>
      <p className="muted">Utilisez la navigation pour revenir à une section autorisée.</p>
    </section>
  );
}

/**
 * Panneau d'échec explicite : jamais un écran vide. 403 a son propre message,
 * 429 affiche le délai annoncé par l'API, les erreurs de validation listent les
 * champs refusés.
 */
export function FailurePanel({
  error,
  onRetry,
  title = "Chargement impossible",
}: {
  error: ApiError | null;
  onRetry?: () => void;
  title?: string;
}) {
  const detail: string[] = [];
  if (error?.status) detail.push(`HTTP ${error.status}`);
  if (error?.code) detail.push(error.code);
  if (error?.retryAfter) detail.push(`réessayer dans ${error.retryAfter} s`);

  const forbidden = error?.status === 403;

  return (
    <section className="panel error-panel" role="alert">
      <h2>{forbidden ? "Accès refusé" : title}</h2>
      <p>
        {forbidden
          ? "Votre rôle ne permet pas cette opération dans ce périmètre. Le serveur a refusé la requête : l'interface ne masque pas un écran vide à la place."
          : (error?.message ?? "La requête n’a pas abouti.")}
      </p>
      {forbidden && error ? <p className="meta">{error.message}</p> : null}
      {detail.length ? <p className="meta mono">{detail.join(" · ")}</p> : null}
      {error?.details ? (
        <dl className="details">
          {Object.entries(error.details).map(([key, message]) => (
            <div key={key}>
              <dt>{key}</dt>
              <dd>{message || "Valeur refusée"}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {onRetry ? (
        <button className="button" type="button" onClick={onRetry}>
          Réessayer
        </button>
      ) : null}
    </section>
  );
}

export function Pill({ value }: { value: string }) {
  const state = value.toLowerCase() || "unknown";
  return (
    <span className="pill" data-state={state}>
      {statusLabel(state)}
    </span>
  );
}

export function TimeTag({ value }: { value: string | null }) {
  if (!value) return <>—</>;
  return (
    <time dateTime={value} title={dateTime(value)}>
      {dateTime(value)}
    </time>
  );
}

export function MonoRef({ value }: { value: string }) {
  if (!value) return <>—</>;
  return (
    <span className="mono" title={value}>
      {value.length > 12 ? `${value.slice(0, 12)}…` : value}
    </span>
  );
}

export interface Column {
  label: string;
  num?: boolean;
}

export function DataTable({
  caption,
  columns,
  empty,
  children,
}: {
  caption: string;
  columns: Column[];
  empty?: string;
  children?: ReactNode;
}) {
  return (
    <div className="table-wrap">
      <table className="table">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.label} scope="col" className={column.num ? "num" : undefined}>
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {empty ? (
            <tr>
              <td colSpan={columns.length}>{empty}</td>
            </tr>
          ) : (
            children
          )}
        </tbody>
      </table>
    </div>
  );
}
