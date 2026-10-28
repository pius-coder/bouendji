"use client";

import { DetailFacts } from "@/components/common/detail-panel";
import { PriceIndicator } from "@/components/common/price-indicator";
import { StatusBadge } from "@/components/common/status-badge";
import { PlanActiveSwitch } from "@/components/plans/plan-active-switch";
import { PlanSheet } from "@/components/plans/plan-sheet";
import { formatBytes, formatXaf, NO_VALUE } from "@/lib/format";
import { BYTES_PER_GB, NIGHT_WINDOW_LABEL, type Plan } from "@/server/services/plans/plans.schema";
import type { PricingSettings } from "@/server/services/pricing/pricing.schema";

/**
 * Contenu de la fiche forfait (`?forfait=id`).
 * Affiche le détail du forfait, l'indicateur de prix plancher/gain et le bouton de modification.
 */
export function PlanSheetBody({
  plan,
  pricing,
  commissionBps = 1500,
  canManage = false,
}: {
  plan: Plan;
  pricing?: PricingSettings;
  commissionBps?: number;
  canManage?: boolean;
}) {
  const quotaBytes = plan.quotaBytes ?? 0;
  const quotaGb = Math.round(quotaBytes / BYTES_PER_GB);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <StatusBadge status={plan.active ? "active" : "suspended"} />
          {plan.badge ? (
            <span className="rounded-full bg-accent/20 px-2.5 py-0.5 text-caption font-semibold text-foreground">
              {plan.badge}
            </span>
          ) : null}
        </div>
        {canManage ? (
          <div className="flex items-center gap-2">
            <PlanActiveSwitch planId={plan.id} name={plan.name} active={plan.active} disabled={false} />
            <PlanSheet mode="edit" plan={plan} pricing={pricing} commissionBps={commissionBps} />
          </div>
        ) : null}
      </div>

      {pricing ? (
        <PriceIndicator
          quotaGb={quotaGb}
          priceXaf={plan.priceXaf}
          commissionBps={commissionBps}
          pricing={pricing}
        />
      ) : null}

      <DetailFacts
        items={[
          { label: "Nom", value: plan.name },
          { label: "Identifiant", value: plan.code, mono: true },
          {
            label: "Famille",
            value: plan.family === "limited_night" ? "Limité + nuit" : "Limité",
          },
          { label: "Prix de vente", value: formatXaf(plan.priceXaf) },
          { label: "Quota inclus", value: `${quotaGb} Go (${formatBytes(quotaBytes)})` },
          { label: "Durée", value: `${plan.durationDays} jour${plan.durationDays > 1 ? "s" : ""}` },
          { label: "Appareils autorisés", value: String(plan.deviceLimit) },
          { label: "Description", value: plan.description || NO_VALUE },
        ]}
      />

      {plan.nightOptions && plan.nightOptions.length > 0 ? (
        <div className="flex flex-col gap-2">
          <h4 className="text-subhead font-semibold text-foreground">Options de nuit</h4>
          <DetailFacts
            items={plan.nightOptions.map((opt) => ({
              label: NIGHT_WINDOW_LABEL[opt.window] ?? opt.window,
              value: `${formatXaf(opt.priceXaf)} (${opt.active ? "Active" : "Inactive"})`,
            }))}
          />
        </div>
      ) : null}
    </div>
  );
}
