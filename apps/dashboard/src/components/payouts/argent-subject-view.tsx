import { Suspense } from "react";
import { COMMISSION_COLUMNS, CommissionsFooter, CommissionsRows } from "@/components/commissions/commissions-table";
import { PageTabs, type PageTabItem } from "@/components/common/page-tabs";
import { UniversalDrawerHost } from "@/components/drawers/universal-drawer-host";
import { ChipFilter } from "@/components/page/chip-filter";
import { PageContent, PageHeader, TOOLBAR_HEIGHT, Toolbar } from "@/components/page/page";
import { StatCard, StatGrid } from "@/components/page/stat";
import { TableCard, TableRowsSkeleton } from "@/components/page/table";
import { PAYOUT_COLUMNS } from "@/components/payouts/payouts-columns";
import { PayoutsFilters } from "@/components/payouts/payouts-filters";
import { PAYOUT_STATUS_OPTIONS } from "@/components/payouts/payouts-options";
import { PayoutsFooter, PayoutsRows } from "@/components/payouts/payouts-table";
import { PreparePayoutAction } from "@/components/payouts/prepare-payout-action";
import type { SearchParamsLike } from "@/lib/drawers";
import { formatXaf } from "@/lib/format";
import { can } from "@/lib/roles";
import { getCommunities, getMe, withSession } from "@/server/context";
import { getServices } from "@/server/services";

export type ArgentSubjectTab = "versements" | "commissions";

const TABS: readonly PageTabItem[] = [
  { id: "versements", label: "Versements" },
  { id: "commissions", label: "Commissions" },
];

export async function ArgentSubjectView({
  communityIdProp,
  searchParams,
  defaultTab = "versements",
  pathname = "/payouts",
}: {
  communityIdProp?: string;
  searchParams: Promise<SearchParamsLike>;
  defaultTab?: ArgentSubjectTab;
  pathname?: string;
}) {
  const resolvedSearch = await searchParams;
  const rawTab = Array.isArray(resolvedSearch.tab) ? resolvedSearch.tab[0] : resolvedSearch.tab;
  const activeTab: ArgentSubjectTab =
    rawTab === "versements" || rawTab === "commissions" ? rawTab : defaultTab;

  return (
    <PageContent>
      <PageHeader
        title="Argent & Versements"
        description="Solde disponible, commissions générées sur chaque abonnement et virements vers les communautés."
        actions={
          <Suspense fallback={null}>
            <PreparePayoutAction />
          </Suspense>
        }
      />

      <Suspense fallback={null}>
        <ArgentSoldeBanner communityIdProp={communityIdProp} />
      </Suspense>

      <Suspense fallback={null}>
        <PageTabs tabs={TABS} activeTab={activeTab} />
      </Suspense>

      {activeTab === "versements" ? (
        <>
          <Toolbar>
            <Suspense fallback={<ChipFilter label="Filtrer par statut" options={PAYOUT_STATUS_OPTIONS} value="" />}>
              <PayoutsFilters />
            </Suspense>
          </Toolbar>
          <TableCard
            label="Versements"
            columns={PAYOUT_COLUMNS}
            stickyTop={TOOLBAR_HEIGHT.chips}
            footer={
              <Suspense fallback={<span className="h-5" />}>
                <PayoutsFooter searchParams={searchParams} />
              </Suspense>
            }
          >
            <Suspense fallback={<TableRowsSkeleton columns={PAYOUT_COLUMNS} />}>
              <PayoutsRows searchParams={searchParams} />
            </Suspense>
          </TableCard>
        </>
      ) : null}

      {activeTab === "commissions" ? (
        <Suspense fallback={<TableRowsSkeleton columns={COMMISSION_COLUMNS} />}>
          <CommissionsTabResolved communityIdProp={communityIdProp} />
        </Suspense>
      ) : null}

      <Suspense fallback={null}>
        <ArgentDrawerLoader
          pathname={pathname}
          communityIdProp={communityIdProp}
          searchParams={searchParams}
        />
      </Suspense>
    </PageContent>
  );
}

async function ArgentSoldeBanner({ communityIdProp }: { communityIdProp?: string }) {
  const services = getServices();
  const [me, communities] = await Promise.all([getMe(), getCommunities()]);
  const targetCommunityId = communityIdProp ?? communities[0]?.id;

  const [payouts, commissions] = await Promise.all([
    can(me, "payouts.read", null)
      ? withSession(() => services.payouts.listPayouts({})).catch(() => [])
      : Promise.resolve([]),
    targetCommunityId && can(me, "money.read", targetCommunityId)
      ? withSession(() => services.orders.listCommissions({ communityId: targetCommunityId, limit: 100 })).catch(() => [])
      : Promise.resolve([]),
  ]);

  const availableXaf = commissions
    .filter((c) => c.status === "available" && !c.payoutId)
    .reduce((acc, c) => acc + c.amountXaf, 0);
  const pendingXaf = payouts
    .filter((p) => p.status === "pending" || p.status === "approved" || p.status === "processing")
    .reduce((acc, p) => acc + p.amountXaf, 0);
  const paidXaf = payouts
    .filter((p) => p.status === "paid")
    .reduce((acc, p) => acc + p.amountXaf, 0);

  return (
    <StatGrid>
      <StatCard label="Disponible au retrait" icon="wallet" hint="Commissions prêtes à verser">
        <span>{formatXaf(availableXaf)}</span>
      </StatCard>
      <StatCard label="Versements en cours" icon="history" hint="En attente d'approbation ou virement">
        <span>{formatXaf(pendingXaf)}</span>
      </StatCard>
      <StatCard label="Total déjà versé" icon="check" hint="Virements confirmés">
        <span>{formatXaf(paidXaf)}</span>
      </StatCard>
    </StatGrid>
  );
}

async function CommissionsTabResolved({ communityIdProp }: { communityIdProp?: string }) {
  const communities = await getCommunities();
  const communityId = communityIdProp ?? communities[0]?.id;
  if (!communityId) {
    return (
      <p className="py-8 text-center text-subhead text-muted-foreground">
        Sélectionnez une communauté pour consulter ses commissions.
      </p>
    );
  }
  const paramsPromise = Promise.resolve({ communityId });
  return (
    <TableCard
      label="Commissions"
      columns={COMMISSION_COLUMNS}
      footer={
        <Suspense fallback={<span className="h-5" />}>
          <CommissionsFooter params={paramsPromise} />
        </Suspense>
      }
    >
      <Suspense fallback={<TableRowsSkeleton columns={COMMISSION_COLUMNS} />}>
        <CommissionsRows params={paramsPromise} />
      </Suspense>
    </TableCard>
  );
}

async function ArgentDrawerLoader({
  pathname,
  communityIdProp,
  searchParams,
}: {
  pathname: string;
  communityIdProp?: string;
  searchParams: Promise<SearchParamsLike>;
}) {
  const [me, communities] = await Promise.all([getMe(), getCommunities()]);
  const community = communityIdProp
    ? communities.find((c) => c.id === communityIdProp)
    : communities[0];

  return (
    <UniversalDrawerHost
      pathname={pathname}
      searchParams={searchParams}
      me={me}
      communityId={community?.id}
      commissionBps={community?.commissionBps}
    />
  );
}
