import type { Metadata } from "next";
import { Suspense } from "react";
import { BUILD_COLUMNS } from "@/components/builds/builds-columns";
import { COMMUNITY_COLUMNS, CommunitiesFooter, CommunitiesRows } from "@/components/communities/communities-table";
import { CreateCommunitySheet } from "@/components/communities/create-community-sheet";
import { GlobalBuildQueueRows } from "@/components/communities/global-builds-table";
import { UniversalDrawerSection } from "@/components/drawers/universal-drawer-host";
import { TelegramTestButton } from "@/components/network/telegram-test-button";
import { PageContent, PageHeader } from "@/components/page/page";
import { Section } from "@/components/page/section";
import { TableCard, TableRowsSkeleton } from "@/components/page/table";

export const metadata: Metadata = { title: "Communautés" };

export default function CommunitiesPage({ searchParams }: PageProps<"/communities">) {
  return (
    <PageContent>
      <PageHeader
        title="Communautés"
        description="Les marques gérées sur la plateforme et la file globale des demandes de build APK."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <TelegramTestButton />
            <CreateCommunitySheet />
          </div>
        }
      />
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
      <Section
        title="Demandes de build et historique APK"
        description="Validez ou rejetez les demandes soumises par les administrateurs de communauté (D117)."
      >
        <TableCard label="Demandes de build" columns={BUILD_COLUMNS}>
          <Suspense fallback={<TableRowsSkeleton columns={BUILD_COLUMNS} rows={3} />}>
            <GlobalBuildQueueRows />
          </Suspense>
        </TableCard>
      </Section>
      <Suspense fallback={null}>
        <UniversalDrawerSection searchParams={searchParams} routeSegment="communities" />
      </Suspense>
    </PageContent>
  );
}
