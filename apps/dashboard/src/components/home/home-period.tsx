"use client";

import { useQueryStates } from "nuqs";
import { useTransition } from "react";
import { PeriodSwitch } from "@/components/common/segmented-control";
import { homeParsers, homeUrlKeys, PERIOD_LABEL, type HomePeriod } from "@/server/query/home.params";

const OPTIONS = [
  { value: "7j", label: "7 j" },
  { value: "30j", label: "30 j" },
  { value: "90j", label: "90 j" },
] as const satisfies readonly { value: HomePeriod; label: string }[];

/** Période des indicateurs : écrit `h_period` dans l'URL ; le serveur relit et recalcule. */
export function HomePeriod() {
  const [pending, startTransition] = useTransition();
  const [{ period }, setParams] = useQueryStates(homeParsers, {
    urlKeys: homeUrlKeys,
    shallow: false,
    history: "replace",
    clearOnDefault: true,
    scroll: false,
    startTransition,
  });
  return (
    <div className="flex items-center gap-2">
      <PeriodSwitch label="Période des indicateurs" options={OPTIONS} value={period} pending={pending} onValueChange={(next) => void setParams({ period: next })} />
      <span className="text-footnote text-muted-foreground" aria-live="polite">
        {pending ? "Mise à jour…" : PERIOD_LABEL[period]}
      </span>
    </div>
  );
}

export function HomePeriodSkeleton() {
  return <div aria-hidden className="h-8 w-44 animate-pulse rounded-full bg-fill" />;
}
