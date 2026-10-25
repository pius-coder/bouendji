import type { Metadata } from "next";
import { Suspense } from "react";
import { COMMUNITY_COLUMNS, CommunitiesFooter, CommunitiesRows } from "@/components/communities/communities-table";
import { CreateCommunitySheet } from "@/components/communities/create-community-sheet";
import { PageContent, PageHeader } from "@/components/page/page";
import { TableCard, TableRowsSkeleton } from "@/components/page/table";

export const metadata: Metadata = { title: "Communautés" };

export default function CommunitiesPage() {
  return (
    <PageContent>
      <PageHeader title="Communautés" description="Les marques gérées sur la plateforme." actions={<CreateCommunitySheet />} />
      <TableCard
        label="Communautés"
        columns={COMMUNITY_COLUMNS}
        footer={
          <Suspense fallback={<span className="h-5" />}>
            <CommunitiesFooter />
          </Suspense>
        }
      >
        <Suspense fallback={<TableRowsSkeleton columns={COMMUNITY_COLUMNS} rows={4} />}>
          <CommunitiesRows />
        </Suspense>
      </TableCard>
    </PageContent>
  );
}
