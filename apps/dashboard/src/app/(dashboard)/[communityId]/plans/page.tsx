import type { Metadata } from "next";
import { Suspense } from "react";
import { PageContent, PageHeader } from "@/components/page/page";
import { TableCard, TableRowsSkeleton } from "@/components/page/table";
import { PLAN_COLUMNS } from "@/components/plans/plans-columns";
import { PlansSection } from "@/components/plans/plans-section";

export const metadata: Metadata = { title: "Forfaits" };

export default function PlansPage({ params }: PageProps<"/[communityId]/plans">) {
  return (
    <PageContent>
      <PageHeader title="Forfaits" description="Les offres vendues par chaque marque de la communauté." />
      <Suspense
        fallback={
          <TableCard label="Forfaits" columns={PLAN_COLUMNS}>
            <TableRowsSkeleton columns={PLAN_COLUMNS} rows={3} />
          </TableCard>
        }
      >
        <PlansSection params={params} />
      </Suspense>
    </PageContent>
  );
}
