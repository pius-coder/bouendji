import type { Metadata } from "next";
import { Suspense } from "react";
import { BUILD_COLUMNS } from "@/components/builds/builds-columns";
import { BuildsSection } from "@/components/builds/builds-section";
import { PageContent, PageHeader } from "@/components/page/page";
import { TableCard, TableRowsSkeleton } from "@/components/page/table";

export const metadata: Metadata = { title: "Applications" };

/**
 * Titre et phrase sont statiques (D104) ; la liste des marques et leurs builds
 * attendent les données dans le Suspense.
 */
export default function BuildsPage({ params }: { params: Promise<{ communityId: string }> }) {
  return (
    <PageContent>
      <PageHeader title="Applications" description="Construisez l'APK de chaque marque et récupérez son lien de téléchargement." />
      <Suspense
        fallback={
          <TableCard label="Builds" columns={BUILD_COLUMNS}>
            <TableRowsSkeleton columns={BUILD_COLUMNS} rows={3} />
          </TableCard>
        }
      >
        <BuildsSection params={params} />
      </Suspense>
    </PageContent>
  );
}
