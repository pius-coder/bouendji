import type { Metadata } from "next";
import { Suspense } from "react";
import { UniversalDrawerSection } from "@/components/drawers/universal-drawer-host";
import {
  AllCommunitiesRows,
  COMMUNITY_COLUMNS,
  LastSettlementValue,
  OwedCountValue,
  OwedTotalValue,
  SETTLEMENT_COLUMNS,
  SettleAction,
  SettlementRows,
  UNPAID_COLUMNS,
  UnpaidFooter,
  UnpaidRows,
  UnpaidWarning,
} from "@/components/manual-grants/unpaid-section";
import { PageContent, PageHeader } from "@/components/page/page";
import { StatCard, StatGrid, StatValueSkeleton } from "@/components/page/stat";
import { TableCard, TableRowsSkeleton } from "@/components/page/table";
import type { SearchParamsLike } from "@/lib/drawers";
import { platformRolesOf } from "@/lib/roles";
import { getMe } from "@/server/context";

export const metadata: Metadata = { title: "Impayés" };

type Params = Promise<{ communityId: string }>;

/**
 * Impayés (105, décision owner 6) : accès accordés à la main contre un paiement
 * direct à l'administrateur, dus à la plateforme au prix plein du forfait
 * jusqu'au versement. « Verser » ouvre un lien de paiement Fapshi pour le total.
 */
export default function ManualGrantsPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Promise<SearchParamsLike>;
}) {
  return (
    <PageContent>
      <PageHeader
        title="Impayés"
        description="Forfaits accordés à la main après un paiement direct (Orange Money, MTN…). Chacun est dû à la plateforme au prix plein jusqu'au versement ; la commission de la communauté est créditée au versement."
        actions={
          <Suspense fallback={null}>
            <SettleAction params={params} />
          </Suspense>
        }
      />
      <Suspense fallback={null}>
        <UnpaidWarning params={params} />
      </Suspense>
      <StatGrid columns={3}>
        <StatCard label="Total dû à la plateforme" icon="wallet" hint="Prix plein des accès non réglés">
          <Suspense fallback={<StatValueSkeleton />}>
            <OwedTotalValue params={params} />
          </Suspense>
        </StatCard>
        <StatCard label="Accès à régulariser" icon="receipt" hint="Accordés à la main, pas encore versés">
          <Suspense fallback={<StatValueSkeleton />}>
            <OwedCountValue params={params} />
          </Suspense>
        </StatCard>
        <StatCard label="Dernier versement reçu" icon="check" hint="Montant du dernier versement confirmé">
          <Suspense fallback={<StatValueSkeleton />}>
            <LastSettlementValue params={params} />
          </Suspense>
        </StatCard>
      </StatGrid>
      <TableCard
        label="Accès à régulariser"
        columns={UNPAID_COLUMNS}
        footer={
          <Suspense fallback={<span className="h-5" />}>
            <UnpaidFooter params={params} />
          </Suspense>
        }
      >
        <Suspense fallback={<TableRowsSkeleton columns={UNPAID_COLUMNS} />}>
          <UnpaidRows params={params} />
        </Suspense>
      </TableCard>
      <div className="flex flex-col gap-3">
        <h2 className="text-title-3 font-semibold tracking-tight text-foreground">Versements à la plateforme</h2>
        <TableCard label="Versements à la plateforme" columns={SETTLEMENT_COLUMNS}>
          <Suspense fallback={<TableRowsSkeleton columns={SETTLEMENT_COLUMNS} rows={3} />}>
            <SettlementRows params={params} />
          </Suspense>
        </TableCard>
      </div>
      <Suspense fallback={null}>
        <OwnerOverview />
      </Suspense>
      <Suspense fallback={null}>
        <UniversalDrawerSection params={params} searchParams={searchParams} routeSegment="manual-grants" />
      </Suspense>
    </PageContent>
  );
}

/** Owner : impayés de toutes les communautés, chacune menant à sa page. */
async function OwnerOverview() {
  const me = await getMe();
  if (!platformRolesOf(me).includes("owner")) return null;
  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-title-3 font-semibold tracking-tight text-foreground">Toutes les communautés</h2>
      <TableCard label="Impayés de toutes les communautés" columns={COMMUNITY_COLUMNS}>
        <Suspense fallback={<TableRowsSkeleton columns={COMMUNITY_COLUMNS} rows={3} />}>
          <AllCommunitiesRows />
        </Suspense>
      </TableCard>
    </div>
  );
}
