import { Icon } from "@/components/common/icon";
import { EmptyBlock } from "@/components/page/empty";
import { TableMessage, TableRows } from "@/components/page/table";
import { withSession } from "@/server/context";
import { getServices } from "@/server/services";
import { isPlanBelowFloor, type PricingSettings } from "@/server/services/pricing/pricing.schema";
import { PLAN_COLUMNS, planCells } from "./plans-columns";

/** Lignes des forfaits d'une marque (seule partie suspendue de la carte). */
export async function AppPlansRows({
  appId,
  canManage,
  pricing,
  commissionBps = 1500,
}: {
  appId: string;
  canManage: boolean;
  pricing?: PricingSettings;
  commissionBps?: number;
}) {
  const plans = (await withSession(() => getServices().plans.listPlans({ appId }))).filter((p) => p.family !== "custom");
  if (plans.length === 0) {
    return (
      <TableMessage columns={PLAN_COLUMNS}>
        <EmptyBlock icon="tag" title="Aucun forfait" description="Cette marque ne propose encore aucune offre." />
      </TableMessage>
    );
  }

  const belowFloorPlans = pricing
    ? plans.filter((p) => isPlanBelowFloor(p, pricing))
    : [];

  return (
    <>
      {belowFloorPlans.length > 0 ? (
        <TableMessage columns={PLAN_COLUMNS}>
          <div className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-start text-footnote text-destructive">
            <Icon name="warning" className="size-4 shrink-0" />
            <span>
              {belowFloorPlans.length} forfait{belowFloorPlans.length > 1 ? "s sont" : " est"} sous le prix plancher actuel ({belowFloorPlans.map((p) => p.name).join(", ")}). Cliquez sur « Modifier » puis « Utiliser le plancher ».
            </span>
          </div>
        </TableMessage>
      ) : null}
      <TableRows
        rows={plans}
        columns={PLAN_COLUMNS}
        getKey={(p) => p.id}
        cells={(p) => planCells(p, { canManage, pricing, commissionBps })}
      />
    </>
  );
}
