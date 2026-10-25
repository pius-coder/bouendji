import type { Metadata } from "next";
import { Suspense } from "react";
import { ChipFilter } from "@/components/page/chip-filter";
import { PageContent, PageHeader, TOOLBAR_HEIGHT, Toolbar } from "@/components/page/page";
import { TableCard, TableRowsSkeleton } from "@/components/page/table";
import { PAYOUT_COLUMNS } from "@/components/payouts/payouts-columns";
import { PayoutsFilters } from "@/components/payouts/payouts-filters";
import { PAYOUT_STATUS_OPTIONS } from "@/components/payouts/payouts-options";
import { PayoutsFooter, PayoutsRows } from "@/components/payouts/payouts-table";
import { PreparePayoutAction } from "@/components/payouts/prepare-payout-action";

export const metadata: Metadata = { title: "Versements" };

/** Flux D65 complet : préparer, approuver, payer, confirmer, trancher (tiroir de détail). */
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
    </PageContent>
  );
}
