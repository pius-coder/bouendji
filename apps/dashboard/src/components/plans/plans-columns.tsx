import { EntityLink } from "@/components/drawers/entity-link";
import { CellStack, type TableColumn } from "@/components/page/table";
import { Badge } from "@/components/ui/badge";
import { formatXaf } from "@/lib/format";
import { BYTES_PER_GB, ENDPOINT_TIER_LABEL, PLAN_FAMILY_LABEL, type Plan } from "@/server/services/plans/plans.schema";
import { isPlanBelowFloor, type PricingSettings } from "@/server/services/pricing/pricing.schema";
import { PlanActiveSwitch } from "./plan-active-switch";
import { PlanSheet } from "./plan-sheet";

export const PLAN_COLUMNS = [
  { id: "name", header: "Forfait", mobile: "primary" },
  { id: "family", header: "Formule", mobile: "secondary" },
  { id: "price", header: "Prix", align: "right", mobile: "secondary" },
  { id: "duration", header: "Durée", align: "right" },
  { id: "devices", header: "Appareils", align: "right" },
  { id: "tier", header: "Serveurs" },
  { id: "status", header: "Vente", mobile: "trailing" },
  { id: "actions", header: "", align: "right", mobile: "trailing" },
] as const satisfies readonly TableColumn[];

/** Résumé d'une ligne : famille, quota et plages de nuit proposées. */
function familySummary(p: Plan): string {
  const quota = p.quotaBytes ? `${Math.round(p.quotaBytes / BYTES_PER_GB)} Go` : "sans quota";
  const nights = (p.nightOptions ?? []).filter((o) => o.active).length;
  const family = p.family ? PLAN_FAMILY_LABEL[p.family] : "—";
  return nights > 0 ? `${family} · ${quota} · ${nights} plage(s) de nuit` : `${family} · ${quota}`;
}

export function planCells(
  p: Plan,
  {
    canManage,
    pricing,
    commissionBps = 1500,
  }: {
    canManage: boolean;
    pricing?: PricingSettings;
    commissionBps?: number;
  },
) {
  const belowFloor = pricing ? isPlanBelowFloor(p, pricing) : false;

  return {
    name: (
      <span className="flex min-w-0 flex-wrap items-center gap-2">
        <EntityLink kind="forfait" id={p.id} className="no-underline hover:underline">
          <CellStack title={p.name} subtitle={p.code} />
        </EntityLink>
        {p.badge ? <Badge variant="secondary">{p.badge}</Badge> : null}
        {p.featured ? <Badge variant="outline">Mis en avant</Badge> : null}
        {belowFloor ? <Badge variant="destructive">Sous le plancher</Badge> : null}
      </span>
    ),
    family: familySummary(p),
    price: formatXaf(p.priceXaf),
    duration: `${p.durationDays} j`,
    devices: String(p.deviceLimit),
    tier: ENDPOINT_TIER_LABEL[p.endpointTier],
    status: canManage ? <PlanActiveSwitch planId={p.id} name={p.name} active={p.active} disabled={!canManage} /> : p.active ? "Oui" : "Non",
    actions: canManage ? (
      <span className="flex flex-wrap justify-end gap-2">
        <PlanSheet mode="create" appId={p.appId} from={p} pricing={pricing} commissionBps={commissionBps} />
        <PlanSheet mode="edit" plan={p} pricing={pricing} commissionBps={commissionBps} />
      </span>
    ) : null,
  };
}
