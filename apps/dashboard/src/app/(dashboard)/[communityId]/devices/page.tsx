import type { Metadata } from "next";
import { Suspense } from "react";
import { DEVICE_COLUMNS, DEVICE_STATUS_OPTIONS, DEVICES_SEARCH_LABEL } from "@/components/devices/devices-columns";
import { DevicesFilters } from "@/components/devices/devices-filters";
import { DevicesFooter, DevicesRows } from "@/components/devices/devices-table";
import { ChipFilter } from "@/components/page/chip-filter";
import { PageContent, PageHeader, TOOLBAR_HEIGHT, Toolbar } from "@/components/page/page";
import { SearchBox } from "@/components/page/search-box";
import { TableCard, TableRowsSkeleton } from "@/components/page/table";

export const metadata: Metadata = { title: "Appareils" };

export default function DevicesPage({ params, searchParams }: PageProps<"/[communityId]/devices">) {
  return (
    <PageContent>
      <PageHeader title="Appareils" description="Téléphones enregistrés, révocation et fichiers de secours." />
      <Toolbar>
        <Suspense
          fallback={
            <>
              <SearchBox label={DEVICES_SEARCH_LABEL} placeholder={DEVICES_SEARCH_LABEL} value="" />
              <ChipFilter label="Filtrer par statut" options={DEVICE_STATUS_OPTIONS} value="" />
            </>
          }
        >
          <DevicesFilters />
        </Suspense>
      </Toolbar>
      <TableCard
        label="Appareils"
        columns={DEVICE_COLUMNS}
        stickyTop={TOOLBAR_HEIGHT.searchAndChips}
        footer={
          <Suspense fallback={<span className="h-5" />}>
            <DevicesFooter params={params} />
          </Suspense>
        }
      >
        <Suspense fallback={<TableRowsSkeleton columns={DEVICE_COLUMNS} />}>
          <DevicesRows params={params} searchParams={searchParams} />
        </Suspense>
      </TableCard>
    </PageContent>
  );
}
