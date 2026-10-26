import { EmptyBlock } from "@/components/page/empty";
import { TableMessage, TableRows } from "@/components/page/table";
import { withSession } from "@/server/context";
import { getServices } from "@/server/services";
import { PLAN_COLUMNS, planCells } from "./plans-columns";

/** Lignes des forfaits d'une marque (seule partie suspendue de la carte). */
export async function AppPlansRows({ appId, canManage }: { appId: string; canManage: boolean }) {
  // L'offre sur mesure a sa propre carte (`CustomOfferCard`) : elle n'est pas un billet classique.
  const plans = (await withSession(() => getServices().plans.listPlans({ appId }))).filter((p) => p.family !== "custom");
  if (plans.length === 0) {
    return (
      <TableMessage columns={PLAN_COLUMNS}>
        <EmptyBlock icon="tag" title="Aucun forfait" description="Cette marque ne propose encore aucune offre." />
      </TableMessage>
    );
  }
  return <TableRows rows={plans} columns={PLAN_COLUMNS} getKey={(p) => p.id} cells={(p) => planCells(p, { canManage })} />;
}
