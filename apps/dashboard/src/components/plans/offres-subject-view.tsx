import { Suspense } from "react";
import { BuildsSection } from "@/components/builds/builds-section";
import { DataBoundary } from "@/components/common/data-boundary";
import { PageTabs, type PageTabItem } from "@/components/common/page-tabs";
import { UniversalDrawerHost } from "@/components/drawers/universal-drawer-host";
import { PageContent, PageHeader } from "@/components/page/page";
import { PlansSection } from "@/components/plans/plans-section";
import type { SearchParamsLike } from "@/lib/drawers";
import { getCommunities, getMe } from "@/server/context";
import { getServices } from "@/server/services";

export type OffresSubjectTab = "forfaits" | "application";

const TABS: readonly PageTabItem[] = [
  { id: "forfaits", label: "Forfaits" },
  { id: "application", label: "Application" },
];

export async function OffresSubjectView({
  params,
  searchParams,
  defaultTab = "forfaits",
  routeSegment = "plans",
}: {
  params: Promise<{ communityId: string }>;
  searchParams: Promise<SearchParamsLike>;
  defaultTab?: OffresSubjectTab;
  routeSegment?: string;
}) {
  const [{ communityId }, resolvedSearch] = await Promise.all([params, searchParams]);
  const rawTab = Array.isArray(resolvedSearch.tab) ? resolvedSearch.tab[0] : resolvedSearch.tab;
  const activeTab: OffresSubjectTab =
    rawTab === "forfaits" || rawTab === "application" ? rawTab : defaultTab;

  return (
    <PageContent>
      <PageHeader
        title="Offres & Application"
        description="Forfaits proposés dans l'application, indicateur de prix plancher et compilation de l'APK."
      />
      <Suspense fallback={null}>
        <PageTabs tabs={TABS} activeTab={activeTab} />
      </Suspense>

      {activeTab === "forfaits" ? (
        <DataBoundary
          fallback={<div className="h-64 animate-pulse rounded-section bg-muted/40" />}
          errorTitle="Impossible de charger les forfaits"
        >
          <PlansSection params={params} />
        </DataBoundary>
      ) : null}

      {activeTab === "application" ? (
        <DataBoundary
          fallback={<div className="h-64 animate-pulse rounded-section bg-muted/40" />}
          errorTitle="Impossible de charger l'application"
        >
          <BuildsSection params={params} />
        </DataBoundary>
      ) : null}

      <Suspense fallback={null}>
        <OffresDrawerLoader
          pathname={`/${communityId}/${routeSegment}`}
          communityId={communityId}
          searchParams={searchParams}
        />
      </Suspense>
    </PageContent>
  );
}

async function OffresDrawerLoader({
  pathname,
  communityId,
  searchParams,
}: {
  pathname: string;
  communityId: string;
  searchParams: Promise<SearchParamsLike>;
}) {
  const services = getServices();
  const [me, communities, pricing] = await Promise.all([
    getMe(),
    getCommunities(),
    services.pricing.getPricing().catch(() => undefined),
  ]);
  const community = communities.find((c) => c.id === communityId);

  return (
    <UniversalDrawerHost
      pathname={pathname}
      searchParams={searchParams}
      me={me}
      communityId={communityId}
      commissionBps={community?.commissionBps}
      pricing={pricing}
      appName={community?.name ? `${community.name} VPN` : "Application VPN"}
    />
  );
}
