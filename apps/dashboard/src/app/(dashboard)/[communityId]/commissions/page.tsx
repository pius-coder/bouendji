import type { Metadata } from "next";
import { Suspense } from "react";
import { COMMISSION_COLUMNS, CommissionsFooter, CommissionsRows } from "@/components/commissions/commissions-table";
import { UniversalDrawerSection } from "@/components/drawers/universal-drawer-host";
import { PageContent, PageHeader } from "@/components/page/page";
import { StatCard, StatGrid, StatValueSkeleton } from "@/components/page/stat";
import { TableCard, TableRowsSkeleton } from "@/components/page/table";
import { AvailablePayoutValue, ConfirmedPayoutValue, PendingPayoutValue } from "@/components/payouts/payouts-stats";

export const metadata: Metadata = { title: "Commissions" };

export default function CommissionsPage({ params, searchParams }: PageProps<"/[communityId]/commissions">) {
  return (
    <PageContent>
      <PageHeader title="Commissions" description="Part de la communauté sur chaque vente, jusqu'à son versement." />
      <StatGrid>
        <StatCard label="Disponible à verser" icon="wallet" hint="Commissions prêtes à regrouper">
          <Suspense fallback={<StatValueSkeleton />}>
            <AvailablePayoutValue params={params} />
          </Suspense>
        </StatCard>
        <StatCard label="En cours de traitement" icon="history" hint="En attente d'approbation ou de virement">
          <Suspense fallback={<StatValueSkeleton />}>
            <PendingPayoutValue params={params} />
          </Suspense>
        </StatCard>
        <StatCard label="Déjà versé et confirmé" icon="check" hint="Total des versements exécutés">
          <Suspense fallback={<StatValueSkeleton />}>
            <ConfirmedPayoutValue params={params} />
          </Suspense>
        </StatCard>
      </StatGrid>
      <TableCard
        label="Commissions"
        columns={COMMISSION_COLUMNS}
        footer={
          <Suspense fallback={<span className="h-5" />}>
            <CommissionsFooter params={params} />
          </Suspense>
        }
      >
        <Suspense fallback={<TableRowsSkeleton columns={COMMISSION_COLUMNS} />}>
          <CommissionsRows params={params} />
        </Suspense>
      </TableCard>
      <Suspense fallback={null}>
        <UniversalDrawerSection params={params} searchParams={searchParams} routeSegment="commissions" />
      </Suspense>
    </PageContent>
  );
}
