import type { Metadata } from "next";
import { Suspense } from "react";
import { COMMISSION_COLUMNS, CommissionsFooter, CommissionsRows } from "@/components/commissions/commissions-table";
import { PageContent, PageHeader } from "@/components/page/page";
import { TableCard, TableRowsSkeleton } from "@/components/page/table";

export const metadata: Metadata = { title: "Commissions" };

export default function CommissionsPage({ params }: PageProps<"/[communityId]/commissions">) {
  return (
    <PageContent>
      <PageHeader title="Commissions" description="Part de la communauté sur chaque vente, jusqu'à son versement." />
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
    </PageContent>
  );
}
