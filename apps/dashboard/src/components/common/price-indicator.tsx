"use client";

import { Button } from "@/components/ui/button";
import { formatXaf } from "@/lib/format";
import { cn } from "@/lib/utils";
import { BYTES_PER_GB } from "@/server/services/plans/plans.schema";
import {
  baseFloorXaf,
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
 * Affiche **uniquement les planchers** dans le créateur de forfait :
 * - plancher du prix de jour (ou de l'illimité selon la durée) ;
 * - plancher du supplément nuit s'il est proposé.
 *
 * Aucune commission, aucun gain, aucune répartition : l'admin voit le minimum
 * à respecter, et le bouton « Utiliser le plancher » si son prix est en dessous.
 */
export function PriceIndicator({
  quotaGb,
  priceXaf,
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
  /** Conservé pour compatibilité des appelants ; plus affiché. */
  commissionBps?: number;
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
  const belowFloor = safePrice < floorXaf;

  const windowKey = toNightWindow(nightWindowHours);
  const nightFloor = hasNightOption ? (nightOptionFloorXaf(windowKey, pricing) ?? 0) : 0;
  const safeNightPrice = Number.isFinite(nightPriceXaf) && (nightPriceXaf ?? 0) >= 0 ? (nightPriceXaf ?? 0) : 0;
  const nightBelowFloor = hasNightOption && safeNightPrice < nightFloor;

  return (
    <div className={cn("flex flex-col gap-3 rounded-section border border-separator bg-muted/40 p-3.5", className)}>
      <span className="text-subhead font-medium text-foreground">
        Prix minimum (plancher) : {formatXaf(floorXaf)}
      </span>

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
        <div className="flex flex-col gap-2 border-t border-separator pt-2.5">
          <span className="text-footnote text-muted-foreground">
            Supplément nuit ({windowKey}) · Plancher :{" "}
            <strong className="font-medium text-foreground">{formatXaf(nightFloor)}</strong>
          </span>
          {nightBelowFloor && onUseNightFloor ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-destructive/10 px-3 py-1.5 text-footnote text-destructive">
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
