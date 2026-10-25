import type { Metadata } from "next";
import { Suspense } from "react";
import { AddMemberSection } from "@/components/members/add-member-section";
import { MEMBER_COLUMNS } from "@/components/members/members-columns";
import { MembersFilters } from "@/components/members/members-filters";
import { MembersFooter, MembersRows } from "@/components/members/members-table";
import { PageContent, PageHeader, TOOLBAR_HEIGHT, Toolbar } from "@/components/page/page";
import { TableCard, TableRowsSkeleton } from "@/components/page/table";

export const metadata: Metadata = { title: "Membres" };

export default function MembersPage({ params, searchParams }: PageProps<"/[communityId]/members">) {
  return (
    <PageContent>
      <PageHeader
        title="Membres"
        description="L'équipe de la communauté et son rôle."
        actions={
          <Suspense fallback={null}>
            <AddMemberSection params={params} />
          </Suspense>
        }
      />
      <Toolbar>
        <Suspense fallback={<span className="block h-11" />}>
          <MembersFilters />
        </Suspense>
      </Toolbar>
      <TableCard
        label="Membres"
        columns={MEMBER_COLUMNS}
        stickyTop={TOOLBAR_HEIGHT.chips}
        footer={
          <Suspense fallback={<span className="h-5" />}>
            <MembersFooter params={params} />
          </Suspense>
        }
      >
        <Suspense fallback={<TableRowsSkeleton columns={MEMBER_COLUMNS} rows={4} />}>
          <MembersRows params={params} searchParams={searchParams} />
        </Suspense>
      </TableCard>
    </PageContent>
  );
}
