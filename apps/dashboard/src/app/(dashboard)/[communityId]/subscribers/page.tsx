import type { Metadata } from "next";
import { Suspense } from "react";
import { PageContent, PageHeader, TOOLBAR_HEIGHT, Toolbar } from "@/components/page/page";
import { SearchBox } from "@/components/page/search-box";
import { TableCard, TableRowsSkeleton } from "@/components/page/table";
import { SUBSCRIBER_COLUMNS, SUBSCRIBERS_SEARCH_LABEL } from "@/components/subscribers/subscribers-columns";
import { SubscribersFilters } from "@/components/subscribers/subscribers-filters";
import { SubscribersFooter, SubscribersRows } from "@/components/subscribers/subscribers-table";

export const metadata: Metadata = { title: "Abonnés" };

export default function SubscribersPage({ params, searchParams }: PageProps<"/[communityId]/subscribers">) {
  return (
    <PageContent>
      <PageHeader title="Abonnés" description="Les comptes inscrits dans l'application de la communauté." />
      <Toolbar>
        <Suspense fallback={<SearchBox label={SUBSCRIBERS_SEARCH_LABEL} placeholder={SUBSCRIBERS_SEARCH_LABEL} value="" />}>
          <SubscribersFilters />
        </Suspense>
      </Toolbar>
      <TableCard
        label="Abonnés"
        columns={SUBSCRIBER_COLUMNS}
        stickyTop={TOOLBAR_HEIGHT.search}
        footer={
          <Suspense fallback={<span className="h-5" />}>
            <SubscribersFooter params={params} />
          </Suspense>
        }
      >
        <Suspense fallback={<TableRowsSkeleton columns={SUBSCRIBER_COLUMNS} />}>
          <SubscribersRows params={params} searchParams={searchParams} />
        </Suspense>
      </TableCard>
    </PageContent>
  );
}
