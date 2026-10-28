import type { Metadata } from "next";
import { Suspense } from "react";
import { AuditFilters } from "@/components/audit/audit-filters";
import { AUDIT_LIMIT_OPTIONS } from "@/components/audit/audit-options";
import { AUDIT_COLUMNS, AuditFooter, AuditRows } from "@/components/audit/audit-table";
import { UniversalDrawerSection } from "@/components/drawers/universal-drawer-host";
import { ChipFilter } from "@/components/page/chip-filter";
import { PageContent, PageHeader, TOOLBAR_HEIGHT, Toolbar } from "@/components/page/page";
import { TableCard, TableRowsSkeleton } from "@/components/page/table";

export const metadata: Metadata = { title: "Journal" };

export default function AuditPage({ params, searchParams }: PageProps<"/[communityId]/audit">) {
  return (
    <PageContent>
      <PageHeader title="Journal" description="Toutes les actions d'administration de la communauté." />
      <Toolbar>
        <Suspense fallback={<ChipFilter label="Nombre d'entrées affichées" options={AUDIT_LIMIT_OPTIONS} value="50" />}>
          <AuditFilters />
        </Suspense>
      </Toolbar>
      <TableCard
        label="Journal"
        columns={AUDIT_COLUMNS}
        stickyTop={TOOLBAR_HEIGHT.chips}
        footer={
          <Suspense fallback={<span className="h-5" />}>
            <AuditFooter params={params} />
          </Suspense>
        }
      >
        <Suspense fallback={<TableRowsSkeleton columns={AUDIT_COLUMNS} />}>
          <AuditRows params={params} searchParams={searchParams} />
        </Suspense>
      </TableCard>
      <Suspense fallback={null}>
        <UniversalDrawerSection params={params} searchParams={searchParams} routeSegment="audit" />
      </Suspense>
    </PageContent>
  );
}
