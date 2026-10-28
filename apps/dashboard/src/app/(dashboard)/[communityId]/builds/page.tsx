import type { Metadata } from "next";
import { Suspense } from "react";
import { BUILD_COLUMNS } from "@/components/builds/builds-columns";
import { BuildsSection } from "@/components/builds/builds-section";
import { UniversalDrawerSection } from "@/components/drawers/universal-drawer-host";
import { PageContent, PageHeader } from "@/components/page/page";
import { TableCard, TableRowsSkeleton } from "@/components/page/table";

export const metadata: Metadata = { title: "Application" };

/**
 * Titre et phrase sont statiques (D104) ; l'aperçu, le partage et l'historique des builds
 * attendent les données dans le Suspense.
 */
export default function BuildsPage({ params, searchParams }: PageProps<"/[communityId]/builds">) {
  return (
    <PageContent>
      <PageHeader
        title="Application"
        description="Prévisualisez votre marque, partagez le lien d'installation et suivez les builds APK."
      />
      <Suspense
        fallback={
          <TableCard label="Builds" columns={BUILD_COLUMNS}>
            <TableRowsSkeleton columns={BUILD_COLUMNS} rows={3} />
          </TableCard>
        }
      >
        <BuildsSection params={params} />
      </Suspense>
      <Suspense fallback={null}>
        <UniversalDrawerSection params={params} searchParams={searchParams} routeSegment="builds" />
      </Suspense>
    </PageContent>
  );
}
