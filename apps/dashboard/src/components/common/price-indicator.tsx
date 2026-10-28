"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatXaf } from "@/lib/format";
import { cn } from "@/lib/utils";
import { BYTES_PER_GB } from "@/server/services/plans/plans.schema";
import {
  baseFloorXaf,
  breakdownBasePrice,
  nightOptionFloorXaf,
  unlimitedFloorXaf,
  type NightWindow,
  type PricingSettings,
} from "@/server/services/pricing/pricing.schema";

function toNightWindow(value: string): NightWindow {
  if (value === "20-24" || value === "24-04" || value === "20-04") return value;
  if (value === "00-05") return "24-04";
  return "20-04";
}

/**
 * Barre visuelle de répartition d'un prix de forfait (coût serveur, marge plateforme,
 * part de l'admin) avec calcul en direct du prix plancher, du gain par vente et
 * bouton « Utiliser le plancher » lorsque le prix saisi est trop bas.
 */
export function PriceIndicator({
  quotaGb,
  priceXaf,
  commissionBps,
  pricing,
  isUnlimited = false,
  durationDays = 1,
  hasNightOption = false,
  nightWindowHours = "20-04",
  nightPriceXaf,
  onUseFloor,
  onUseNightFloor,
  className,
}: {
  quotaGb: number;
  priceXaf: number;
  commissionBps: number;
  pricing: PricingSettings;
  isUnlimited?: boolean;
  durationDays?: number;
  hasNightOption?: boolean;
  nightWindowHours?: string;
  nightPriceXaf?: number;
  onUseFloor?: (floorXaf: number) => void;
  onUseNightFloor?: (nightFloorXaf: number) => void;
  className?: string;
}) {
  const safeQuota = Number.isFinite(quotaGb) && quotaGb > 0 ? quotaGb : 0;
  const safePrice = Number.isFinite(priceXaf) && priceXaf >= 0 ? priceXaf : 0;
  const quotaBytes = Math.round(safeQuota * BYTES_PER_GB);
  const floorXaf = isUnlimited
    ? (unlimitedFloorXaf(durationDays, pricing) ?? 0)
    : (baseFloorXaf(quotaBytes, pricing) ?? 0);

  const breakdown = isUnlimited
    ? (() => {
        const costXaf = (pricing.unlimitedCostPerDayXaf ?? 0) * durationDays;
        const platformMarginXaf = Math.max(0, floorXaf - costXaf);
        const gainXaf = Math.max(0, safePrice - floorXaf);
        return {
          costXaf,
          platformMarginXaf,
          floorXaf,
          priceXaf: safePrice,
          aboveFloor: safePrice >= floorXaf,
          gainXaf,
        };
      })()
    : (breakdownBasePrice(safeQuota, safePrice, pricing) ?? {
        costXaf: 0,
        platformMarginXaf: 0,
        floorXaf,
        priceXaf: safePrice,
        aboveFloor: safePrice >= floorXaf,
        gainXaf: Math.max(0, safePrice - floorXaf),
      });
  const belowFloor = !breakdown.aboveFloor;
  const totalBase = Math.max(1, safePrice, floorXaf);
  const serverPct = Math.min(100, Math.round((breakdown.costXaf / totalBase) * 100));
  const platformPct = Math.min(100 - serverPct, Math.round((breakdown.platformMarginXaf / totalBase) * 100));
  const adminPct = Math.max(0, 100 - serverPct - platformPct);

  const windowKey = toNightWindow(nightWindowHours);
  const nightFloor = hasNightOption ? (nightOptionFloorXaf(windowKey, pricing) ?? 0) : 0;
  const safeNightPrice = Number.isFinite(nightPriceXaf) && (nightPriceXaf ?? 0) >= 0 ? (nightPriceXaf ?? 0) : 0;
  const nightBelowFloor = hasNightOption && safeNightPrice < nightFloor;
  const nightGainXaf = hasNightOption ? Math.max(0, safeNightPrice - nightFloor) : 0;

  return (
    <div className={cn("flex flex-col gap-3 rounded-section border border-separator bg-muted/40 p-3.5", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="cursor-help text-subhead font-medium text-foreground underline decoration-dotted underline-offset-4">
                Prix minimum (plancher) : {formatXaf(floorXaf)}
              </span>
            </TooltipTrigger>
            <TooltipContent>
              {isUnlimited
                ? `Prix minimum qui couvre l'infrastructure (${formatXaf(pricing.unlimitedCostPerDayXaf ?? 0)}/j) et la marge plateforme (${(((pricing.platformMarginBps ?? 0) / 100)).toFixed(0)} %).`
                : `Prix minimum qui couvre l'infrastructure (${formatXaf(pricing.costPerGbXaf ?? 0)}/Go) et la marge plateforme (${(((pricing.platformMarginBps ?? 0) / 100)).toFixed(0)} %).`}
            </TooltipContent>
          </Tooltip>
        </div>

        <div className="flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                className={cn(
                  "cursor-help rounded-full px-2.5 py-0.5 text-footnote font-semibold tabular-nums",
                  belowFloor
                    ? "bg-destructive/15 text-destructive"
                    : "bg-positive/15 text-positive",
                )}
              >
                Votre gain : {formatXaf(breakdown.gainXaf)} / vente
              </span>
            </TooltipTrigger>
            <TooltipContent>
              Montant qui vous revient sur chaque abonnement payé ({(commissionBps / 100).toFixed(0)} % de commission max).
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Barre de répartition */}
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-background">
        <div
          className="bg-muted-foreground/55 transition-all"
          style={{ width: `${serverPct}%` }}
          title={`Coût serveur : ${formatXaf(breakdown.costXaf)}`}
        />
        <div
          className="bg-accent transition-all"
          style={{ width: `${platformPct}%` }}
          title={`Marge plateforme : ${formatXaf(breakdown.platformMarginXaf)}`}
        />
        <div
          className={cn("transition-all", belowFloor ? "bg-destructive" : "bg-positive")}
          style={{ width: `${adminPct}%` }}
          title={`Votre gain : ${formatXaf(breakdown.gainXaf)}`}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-caption text-muted-foreground">
        <span>Serveur : {formatXaf(breakdown.costXaf)}</span>
        <span>Plateforme : {formatXaf(breakdown.platformMarginXaf)}</span>
        <span>Votre part : {formatXaf(breakdown.gainXaf)}</span>
      </div>

      {belowFloor ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-footnote text-destructive">
          <span>
            Ce prix est sous le minimum ({formatXaf(floorXaf)}). Il manque {formatXaf(floorXaf - safePrice)}.
          </span>
          {onUseFloor ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => onUseFloor(floorXaf)}
              className="h-7 border-destructive/30 text-destructive hover:bg-destructive/15"
            >
              Utiliser le plancher ({formatXaf(floorXaf)})
            </Button>
          ) : null}
        </div>
      ) : null}

      {hasNightOption ? (
        <div className="border-t border-separator pt-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2 text-footnote">
            <span className="text-muted-foreground">
              Supplément nuit ({windowKey}) · Plancher :{" "}
              <strong className="font-medium text-foreground">{formatXaf(nightFloor)}</strong>
            </span>
            <span className={cn("font-semibold tabular-nums", nightBelowFloor ? "text-destructive" : "text-positive")}>
              Gain nuit : +{formatXaf(nightGainXaf)} / vente
            </span>
          </div>
          {nightBelowFloor && onUseNightFloor ? (
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-destructive/10 px-3 py-1.5 text-footnote text-destructive">
              <span>Le supplément nuit est sous le plancher ({formatXaf(nightFloor)}).</span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => onUseNightFloor(nightFloor)}
                className="h-7 border-destructive/30 text-destructive hover:bg-destructive/15"
              >
                Utiliser {formatXaf(nightFloor)}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
