import { Suspense } from "react";
import { PageTabs, type PageTabItem } from "@/components/common/page-tabs";
import { DEVICE_COLUMNS, DEVICE_STATUS_OPTIONS, DEVICES_SEARCH_LABEL } from "@/components/devices/devices-columns";
import { DevicesFilters } from "@/components/devices/devices-filters";
import { DevicesFooter, DevicesRows } from "@/components/devices/devices-table";
import { UniversalDrawerHost } from "@/components/drawers/universal-drawer-host";
import { OFFLINE_COLUMNS } from "@/components/offline/offline-columns";
import { OfflineFooter, OfflineRows } from "@/components/offline/offline-table";
import { ORDER_COLUMNS, ORDER_STATUS_OPTIONS } from "@/components/orders/orders-columns";
import { OrdersFilters } from "@/components/orders/orders-filters";
import { OrdersPager, OrdersRows } from "@/components/orders/orders-table";
import { ChipFilter } from "@/components/page/chip-filter";
import { PageContent, PageHeader, TOOLBAR_HEIGHT, Toolbar } from "@/components/page/page";
import { SearchBox } from "@/components/page/search-box";
import { TableCard, TableRowsSkeleton } from "@/components/page/table";
import { SUBSCRIBER_COLUMNS, SUBSCRIBERS_SEARCH_LABEL } from "@/components/subscribers/subscribers-columns";
import { SubscribersFilters } from "@/components/subscribers/subscribers-filters";
import { SubscribersFooter, SubscribersRows } from "@/components/subscribers/subscribers-table";
import type { SearchParamsLike } from "@/lib/drawers";
import { getMe } from "@/server/context";
import { getServices } from "@/server/services";

export type SubscribersSubjectTab = "abonnes" | "appareils" | "commandes" | "secours";

const TABS: readonly PageTabItem[] = [
  { id: "abonnes", label: "Abonnés" },
  { id: "appareils", label: "Appareils" },
  { id: "commandes", label: "Commandes" },
  { id: "secours", label: "Secours" },
];

export async function SubscribersSubjectView({
  params,
  searchParams,
  defaultTab = "abonnes",
  routeSegment = "subscribers",
}: {
  params: Promise<{ communityId: string }>;
  searchParams: Promise<SearchParamsLike>;
  defaultTab?: SubscribersSubjectTab;
  routeSegment?: string;
}) {
  const [{ communityId }, resolvedSearch] = await Promise.all([params, searchParams]);
  const rawTab = Array.isArray(resolvedSearch.tab) ? resolvedSearch.tab[0] : resolvedSearch.tab;
  const activeTab: SubscribersSubjectTab =
    rawTab === "abonnes" || rawTab === "appareils" || rawTab === "commandes" || rawTab === "secours"
      ? rawTab
      : defaultTab;

  return (
    <PageContent>
      <PageHeader
        title="Abonnés"
        description="Comptes inscrits, téléphones enregistrés, commandes et fichiers de secours (.bvpn)."
      />
      <Suspense fallback={null}>
        <PageTabs tabs={TABS} activeTab={activeTab} />
      </Suspense>

      {activeTab === "abonnes" ? (
        <>
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
        </>
      ) : null}

      {activeTab === "appareils" ? (
        <>
          <Toolbar>
            <Suspense
              fallback={
                <>
                  <SearchBox label={DEVICES_SEARCH_LABEL} placeholder={DEVICES_SEARCH_LABEL} value="" />
                  <ChipFilter label="Filtrer par statut" options={DEVICE_STATUS_OPTIONS} value="" />
                </>
              }
            >
              <DevicesFilters />
            </Suspense>
          </Toolbar>
          <TableCard
            label="Appareils"
            columns={DEVICE_COLUMNS}
            stickyTop={TOOLBAR_HEIGHT.searchAndChips}
            footer={
              <Suspense fallback={<span className="h-5" />}>
                <DevicesFooter params={params} />
              </Suspense>
            }
          >
            <Suspense fallback={<TableRowsSkeleton columns={DEVICE_COLUMNS} />}>
              <DevicesRows params={params} searchParams={searchParams} />
            </Suspense>
          </TableCard>
        </>
      ) : null}

      {activeTab === "commandes" ? (
        <>
          <Toolbar>
            <Suspense fallback={<ChipFilter label="Filtrer par statut" options={ORDER_STATUS_OPTIONS} value="" />}>
              <OrdersFilters />
            </Suspense>
          </Toolbar>
          <TableCard
            label="Commandes"
            columns={ORDER_COLUMNS}
            stickyTop={TOOLBAR_HEIGHT.chips}
            footer={
              <Suspense fallback={<span className="h-5" />}>
                <OrdersPager params={params} searchParams={searchParams} />
              </Suspense>
            }
          >
            <Suspense fallback={<TableRowsSkeleton columns={ORDER_COLUMNS} />}>
              <OrdersRows params={params} searchParams={searchParams} />
            </Suspense>
          </TableCard>
        </>
      ) : null}

      {activeTab === "secours" ? (
        <TableCard
          label="Fichiers de secours"
          columns={OFFLINE_COLUMNS}
          footer={
            <Suspense fallback={<span className="h-5" />}>
              <OfflineFooter params={params} />
            </Suspense>
          }
        >
          <Suspense fallback={<TableRowsSkeleton columns={OFFLINE_COLUMNS} />}>
            <OfflineRows params={params} />
          </Suspense>
        </TableCard>
      ) : null}

      <Suspense fallback={null}>
        <SubscribersDrawerLoader
          pathname={`/${communityId}/${routeSegment}`}
          communityId={communityId}
          searchParams={searchParams}
        />
      </Suspense>
    </PageContent>
  );
}

async function SubscribersDrawerLoader({
  pathname,
  communityId,
  searchParams,
}: {
  pathname: string;
  communityId: string;
  searchParams: Promise<SearchParamsLike>;
}) {
  const services = getServices();
  const [me, offlineBundles] = await Promise.all([
    getMe(),
    services.devices.listOfflineBundles().catch(() => []),
  ]);

  return (
    <UniversalDrawerHost
      pathname={pathname}
      searchParams={searchParams}
      me={me}
      communityId={communityId}
      offlineBundles={offlineBundles}
    />
  );
}
