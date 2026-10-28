import type { Metadata } from "next";
import { Suspense } from "react";
import { UniversalDrawerSection } from "@/components/drawers/universal-drawer-host";
import { ChipFilter } from "@/components/page/chip-filter";
import { PageContent, PageHeader, TOOLBAR_HEIGHT, Toolbar } from "@/components/page/page";
import { StatCard, StatGrid, StatValueSkeleton } from "@/components/page/stat";
import { TableCard, TableRowsSkeleton } from "@/components/page/table";
import { PAYOUT_COLUMNS } from "@/components/payouts/payouts-columns";
import { PayoutsFilters } from "@/components/payouts/payouts-filters";
import { PAYOUT_STATUS_OPTIONS } from "@/components/payouts/payouts-options";
import { AvailablePayoutValue, ConfirmedPayoutValue, PendingPayoutValue } from "@/components/payouts/payouts-stats";
import { PayoutsFooter, PayoutsRows } from "@/components/payouts/payouts-table";
import { PreparePayoutAction } from "@/components/payouts/prepare-payout-action";

export const metadata: Metadata = { title: "Versements" };

/**
 * Flux D65 complet avec suspension atomique (D104) : en-tête, cadres de soldes,
 * barre de filtres et colonnes de tableau sont statiques ; seules les valeurs et
 * les lignes suspendent la lecture des données.
 */
export default function PayoutsPage({ searchParams }: PageProps<"/payouts">) {
  return (
    <PageContent>
      <PageHeader
        title="Versements"
        description="Commissions reversées aux communautés."
        actions={
          <Suspense fallback={null}>
            <PreparePayoutAction />
          </Suspense>
        }
      />
      <StatGrid>
        <StatCard label="Disponible à verser" icon="wallet" hint="Commissions prêtes à regrouper">
          <Suspense fallback={<StatValueSkeleton />}>
            <AvailablePayoutValue />
          </Suspense>
        </StatCard>
        <StatCard label="En cours de traitement" icon="history" hint="En attente d'approbation ou de virement">
          <Suspense fallback={<StatValueSkeleton />}>
            <PendingPayoutValue />
          </Suspense>
        </StatCard>
        <StatCard label="Déjà versé et confirmé" icon="check" hint="Total des versements exécutés">
          <Suspense fallback={<StatValueSkeleton />}>
            <ConfirmedPayoutValue />
          </Suspense>
        </StatCard>
      </StatGrid>
      <Toolbar>
        <Suspense fallback={<ChipFilter label="Filtrer par statut" options={PAYOUT_STATUS_OPTIONS} value="" />}>
          <PayoutsFilters />
        </Suspense>
      </Toolbar>
      <TableCard
        label="Versements"
        columns={PAYOUT_COLUMNS}
        stickyTop={TOOLBAR_HEIGHT.chips}
        footer={
          <Suspense fallback={<span className="h-5" />}>
            <PayoutsFooter searchParams={searchParams} />
          </Suspense>
        }
      >
        <Suspense fallback={<TableRowsSkeleton columns={PAYOUT_COLUMNS} />}>
          <PayoutsRows searchParams={searchParams} />
        </Suspense>
      </TableCard>
      <Suspense fallback={null}>
        <UniversalDrawerSection searchParams={searchParams} routeSegment="payouts" />
      </Suspense>
    </PageContent>
  );
}
