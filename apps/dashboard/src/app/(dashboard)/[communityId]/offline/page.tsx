import type { Metadata } from "next";
import { Suspense } from "react";
import { UniversalDrawerSection } from "@/components/drawers/universal-drawer-host";
import { OFFLINE_COLUMNS } from "@/components/offline/offline-columns";
import { OfflineFooter, OfflineRows } from "@/components/offline/offline-table";
import { PageContent, PageHeader } from "@/components/page/page";
import { TableCard, TableRowsSkeleton } from "@/components/page/table";

export const metadata: Metadata = { title: "Fichiers de secours" };

/** Fichiers de secours émis : lecture seule. L'émission se fait depuis la fiche d'un appareil. */
export default function OfflinePage({ params, searchParams }: PageProps<"/[communityId]/offline">) {
  return (
    <PageContent>
      <PageHeader
        title="Fichiers de secours"
        description="Fichiers émis pour un appareil : valables peu de temps, utilisables une seule fois."
      />
      <TableCard
        label="Fichiers de secours"
        columns={OFFLINE_COLUMNS}
        footer={
          <Suspense fallback={<span className="h-5" />}>
            <OfflineFooter params={params} />
          </Suspense>
        }
      >
        <Suspense fallback={<TableRowsSkeleton columns={OFFLINE_COLUMNS} />}>
          <OfflineRows params={params} />
        </Suspense>
      </TableCard>
      <Suspense fallback={null}>
        <UniversalDrawerSection params={params} searchParams={searchParams} routeSegment="offline" />
      </Suspense>
    </PageContent>
  );
}
