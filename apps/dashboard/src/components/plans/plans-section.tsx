import { Suspense } from "react";
import Link from "next/link";
import { Icon } from "@/components/common/icon";
import { UpdatedAt } from "@/components/common/updated-at";
import { EmptyBlock, ForbiddenBlock } from "@/components/page/empty";
import { TableCard, TableRowsSkeleton } from "@/components/page/table";
import { Button } from "@/components/ui/button";
import { can } from "@/lib/roles";
import { getCommunities, getMe, withSession } from "@/server/context";
import { getServices } from "@/server/services";
import { AppPlansRows } from "./app-plans-table";
import { CustomOfferCard } from "./custom-offer-card";
import { PLAN_COLUMNS } from "./plans-columns";
import { PlanSheet } from "./plan-sheet";

const MISSING_LABELS: Record<string, string> = {
  appName: "nom de l'application",
  packageName: "identifiant de paquet",
  theme: "thème",
  supportUrl: "lien d'assistance",
};

/**
 * Une carte par marque de la communauté, avec indicateur de prix plancher en direct.
 */
export async function PlansSection({ params }: { params: Promise<{ communityId: string }> }) {
  const { communityId } = await params;
  const [me, communities, pricing] = await Promise.all([
    getMe(),
    getCommunities(),
    getServices().pricing.getPricing().catch(() => undefined),
  ]);
  if (!can(me, "plans.read", communityId)) return <ForbiddenBlock />;

  const community = communities.find((c) => c.id === communityId);
  const commissionBps = community?.commissionBps ?? 1500;
  const apps = (await withSession(() => getServices().plans.listApps())).filter((a) => a.communityId === communityId);
  if (apps.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3">
        <EmptyBlock icon="smartphone" title="Aucune marque" description="Cette communauté n'a pas encore d'application configurée." />
        <Button asChild size="sm">
          <Link href="/onboarding">Configurer mon application (Assistant)</Link>
        </Button>
      </div>
    );
  }
  const canManage = can(me, "plans.manage", communityId);

  return (
    <>
      {apps.map((app) => (
        <section key={app.id} aria-label={app.name} className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-title-3 font-semibold tracking-tight">{app.name}</h2>
              <p className="font-mono text-footnote text-muted-foreground">{app.packageName}</p>
            </div>
            {canManage ? (
              <PlanSheet mode="create" appId={app.id} pricing={pricing} commissionBps={commissionBps} />
            ) : null}
          </div>
          {!app.brandReady ? (
            <p role="status" className="flex items-start gap-2 rounded-xl border border-border bg-warning-soft px-4 py-3 text-footnote text-warning-text">
              <Icon name="warning" className="mt-0.5 size-4" />
              Marque incomplète. À renseigner avant un build : {app.brandMissing.map((m) => MISSING_LABELS[m] ?? m).join(", ")}.
            </p>
          ) : null}
          <Suspense fallback={<div className="h-32 animate-pulse rounded-2xl border border-border bg-muted/40" />}>
            <CustomOfferCard appId={app.id} canManage={canManage} />
          </Suspense>
          <TableCard label={`Forfaits de ${app.name}`} columns={PLAN_COLUMNS} footer={<UpdatedAt />}>
            <Suspense fallback={<TableRowsSkeleton columns={PLAN_COLUMNS} rows={3} />}>
              <AppPlansRows
                appId={app.id}
                canManage={canManage}
                pricing={pricing}
                commissionBps={commissionBps}
              />
            </Suspense>
          </TableCard>
        </section>
      ))}
    </>
  );
}
