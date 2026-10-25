import type { Metadata } from "next";
import { Suspense } from "react";
import { ORDER_COLUMNS, ORDER_STATUS_OPTIONS } from "@/components/orders/orders-columns";
import { OrdersFilters } from "@/components/orders/orders-filters";
import { OrdersPager, OrdersRows } from "@/components/orders/orders-table";
import { ChipFilter } from "@/components/page/chip-filter";
import { PageContent, PageHeader, TOOLBAR_HEIGHT, Toolbar } from "@/components/page/page";
import { TableCard, TableRowsSkeleton } from "@/components/page/table";

export const metadata: Metadata = { title: "Commandes" };

/**
 * Composition (D104) : titre, puces et en-têtes du tableau sont statiques ; seules
 * les lignes et le pied (pagination) attendent les données.
 */
export default function OrdersPage({ params, searchParams }: PageProps<"/[communityId]/orders">) {
  return (
    <PageContent>
      <PageHeader title="Commandes" description="Les plus récentes d'abord." />
      <Toolbar>
        <Suspense fallback={<ChipFilter label="Filtrer par statut" options={ORDER_STATUS_OPTIONS} value="" />}>
          <OrdersFilters />
        </Suspense>
      </Toolbar>
      <TableCard
        label="Commandes"
        columns={ORDER_COLUMNS}
        stickyTop={TOOLBAR_HEIGHT.chips}
        footer={
          <Suspense fallback={<span className="h-5" />}>
            <OrdersPager params={params} searchParams={searchParams} />
          </Suspense>
        }
      >
        <Suspense fallback={<TableRowsSkeleton columns={ORDER_COLUMNS} />}>
          <OrdersRows params={params} searchParams={searchParams} />
        </Suspense>
      </TableCard>
    </PageContent>
  );
}
