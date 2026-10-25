"use client";

import { catchError, type ErrorInfo } from "next/error";
import { Suspense, type ReactNode } from "react";
import { Button } from "./button";
import { ErrorState } from "./states";

function DataErrorFallback(props: { title?: string; inset?: boolean }, { retry }: ErrorInfo) {
  return (
    <ErrorState
      title={props.title}
      inset={props.inset}
      action={
        <Button variant="tinted" onClick={() => retry()}>
          Réessayer
        </Button>
      }
    />
  );
}

/** Frontière d'erreur Next (`catchError`) : `retry()` relit les données du bloc seulement. */
const DataErrorBoundary = catchError(DataErrorFallback);

/**
 * Une donnée = une frontière (dashboard-architecture, règle 2). Le chargement montre
 * `fallback` (squelette à la géométrie du bloc) ; l'échec montre `ErrorState` + Réessayer,
 * sans toucher au chrome ni aux autres blocs. Les `redirect()`/`notFound()` passent à travers.
 */
export function DataBoundary({
  fallback,
  errorTitle,
  inset = true,
  children,
}: {
  fallback: ReactNode;
  errorTitle?: string;
  inset?: boolean;
  children: ReactNode;
}) {
  return (
    <DataErrorBoundary title={errorTitle} inset={inset}>
      <Suspense fallback={fallback}>{children}</Suspense>
    </DataErrorBoundary>
  );
}
