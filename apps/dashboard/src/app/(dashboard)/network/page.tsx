import type { Metadata } from "next";
import { Suspense } from "react";
import { ManualEndpointAction } from "@/components/network/manual-endpoint-action";
import { NETWORK_COLUMNS } from "@/components/network/network-columns";
import { NetworkFooter, NetworkRows } from "@/components/network/network-table";
import { PageContent, PageHeader } from "@/components/page/page";
import { TableCard, TableRowsSkeleton } from "@/components/page/table";

export const metadata: Metadata = { title: "Réseau" };

export default function NetworkPage() {
  return (
    <PageContent>
      <PageHeader
        title="Réseau"
        description="Nœuds du pool, santé et ajout manuel."
        actions={
          <Suspense fallback={null}>
            <ManualEndpointAction />
          </Suspense>
        }
      />
      <TableCard
        label="Nœuds"
        columns={NETWORK_COLUMNS}
        footer={
          <Suspense fallback={<span className="h-5" />}>
            <NetworkFooter />
          </Suspense>
        }
      >
        <Suspense fallback={<TableRowsSkeleton columns={NETWORK_COLUMNS} />}>
          <NetworkRows />
        </Suspense>
      </TableCard>
    </PageContent>
  );
}
