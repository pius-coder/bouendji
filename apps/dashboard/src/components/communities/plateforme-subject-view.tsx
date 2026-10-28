import { Suspense } from "react";
import { ADMIN_COLUMNS, AdminsFooter, AdminsRows, CreateAdminAction } from "@/components/admins/admins-table";
import { BUILD_COLUMNS, buildCells } from "@/components/builds/builds-columns";
import { PageTabs, type PageTabItem } from "@/components/common/page-tabs";
import { COMMUNITY_COLUMNS, CommunitiesFooter, CommunitiesRows } from "@/components/communities/communities-table";
import { CreateCommunitySheet } from "@/components/communities/create-community-sheet";
import { UniversalDrawerHost } from "@/components/drawers/universal-drawer-host";
import { TelegramTestButton } from "@/components/network/telegram-test-button";
import { EmptyBlock, ForbiddenBlock } from "@/components/page/empty";
import { PageContent, PageHeader } from "@/components/page/page";
import { TableCard, TableMessage, TableRows, TableRowsSkeleton } from "@/components/page/table";
import { PricingSettingsForm } from "@/components/pricing/pricing-settings-form";
import type { SearchParamsLike } from "@/lib/drawers";
import { getCommunities, getMe } from "@/server/context";
import { getServices } from "@/server/services";
import type { Build } from "@/server/services/builds/builds.service";

export type PlateformeSubjectTab = "communautes" | "admins" | "builds" | "tarifs";

const TABS: readonly PageTabItem[] = [
  { id: "communautes", label: "Communautés" },
  { id: "admins", label: "Administrateurs & Équipe" },
  { id: "builds", label: "Demandes de build" },
  { id: "tarifs", label: "Tarifs & Marges" },
];

export async function PlateformeSubjectView({
  searchParams,
  defaultTab = "communautes",
  pathname = "/communities",
}: {
  searchParams: Promise<SearchParamsLike>;
  defaultTab?: PlateformeSubjectTab;
  pathname?: string;
}) {
  const resolvedSearch = await searchParams;
  const rawTab = Array.isArray(resolvedSearch.tab) ? resolvedSearch.tab[0] : resolvedSearch.tab;
  const activeTab: PlateformeSubjectTab =
    rawTab === "communautes" || rawTab === "admins" || rawTab === "builds" || rawTab === "tarifs"
      ? rawTab
      : defaultTab;

  return (
    <PageContent>
      <PageHeader
        title="Plateforme"
        description="Gestion globale des communautés, administrateurs, validations de builds Android et tarifs planchers."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <TelegramTestButton />
            {activeTab === "communautes" ? <CreateCommunitySheet /> : null}
            {activeTab === "admins" ? (
              <Suspense fallback={null}>
                <CreateAdminAction />
              </Suspense>
            ) : null}
          </div>
        }
      />
      <Suspense fallback={null}>
        <PageTabs tabs={TABS} activeTab={activeTab} />
      </Suspense>

      {activeTab === "communautes" ? (
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
      ) : null}

      {activeTab === "admins" ? (
        <TableCard
          label="Administrateurs"
          columns={ADMIN_COLUMNS}
          footer={
            <Suspense fallback={<span className="h-5" />}>
              <AdminsFooter />
            </Suspense>
          }
        >
          <Suspense fallback={<TableRowsSkeleton columns={ADMIN_COLUMNS} rows={4} />}>
            <AdminsRows />
          </Suspense>
        </TableCard>
      ) : null}

      {activeTab === "builds" ? (
        <TableCard label="Demandes de build et historique global" columns={BUILD_COLUMNS}>
          <Suspense fallback={<TableRowsSkeleton columns={BUILD_COLUMNS} rows={4} />}>
            <GlobalBuildQueueRows />
          </Suspense>
        </TableCard>
      ) : null}

      {activeTab === "tarifs" ? (
        <Suspense fallback={<div className="h-80 animate-pulse rounded-section bg-muted/40" />}>
          <PricingTabLoaded />
        </Suspense>
      ) : null}

      <Suspense fallback={null}>
        <PlateformeDrawerLoader pathname={pathname} searchParams={searchParams} />
      </Suspense>
    </PageContent>
  );
}

async function GlobalBuildQueueRows() {
  const me = await getMe();
  if (me.platformRole !== "owner") {
    return (
      <TableMessage columns={BUILD_COLUMNS}>
        <ForbiddenBlock />
      </TableMessage>
    );
  }
  const services = getServices();
  const apps = await services.plans.listApps().catch(() => []);
  const allBuilds: Build[] = [];
  const perApp = await Promise.all(
    apps.map((a) => services.builds.listBuilds({ appId: a.id }).catch(() => [])),
  );
  for (const list of perApp) {
    for (const b of list) allBuilds.push(b);
  }
  allBuilds.sort((a, b) => {
    if (a.status === "requested" && b.status !== "requested") return -1;
    if (b.status === "requested" && a.status !== "requested") return 1;
    return (b.createdAt ?? "").localeCompare(a.createdAt ?? "");
  });

  if (allBuilds.length === 0) {
    return (
      <TableMessage columns={BUILD_COLUMNS}>
        <EmptyBlock
          icon="download"
          title="Aucune demande de build"
          description="Les demandes d'APK soumises par les communautés apparaîtront ici."
        />
      </TableMessage>
    );
  }

  return <TableRows rows={allBuilds} columns={BUILD_COLUMNS} getKey={(b) => b.id} cells={buildCells} />;
}

async function PricingTabLoaded() {
  const me = await getMe();
  if (me.platformRole !== "owner") return <ForbiddenBlock />;
  const pricing = await getServices().pricing.getPricing();
  return <PricingSettingsForm initialPricing={pricing} />;
}

async function PlateformeDrawerLoader({
  pathname,
  searchParams,
}: {
  pathname: string;
  searchParams: Promise<SearchParamsLike>;
}) {
  const [me, communities] = await Promise.all([getMe(), getCommunities()]);
  const primary = communities[0];
  return (
    <UniversalDrawerHost
      pathname={pathname}
      searchParams={searchParams}
      me={me}
      communityId={primary?.id}
    />
  );
}
