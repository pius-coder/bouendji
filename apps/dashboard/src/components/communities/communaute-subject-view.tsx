import { Suspense } from "react";
import { AuditFilters } from "@/components/audit/audit-filters";
import { AUDIT_LIMIT_OPTIONS } from "@/components/audit/audit-options";
import { AUDIT_COLUMNS, AuditFooter, AuditRows } from "@/components/audit/audit-table";
import { PageTabs, type PageTabItem } from "@/components/common/page-tabs";
import { CommunitySettingsCard } from "@/components/communities/community-settings-card";
import { UniversalDrawerHost } from "@/components/drawers/universal-drawer-host";
import { AddMemberSection } from "@/components/members/add-member-section";
import { MEMBER_COLUMNS } from "@/components/members/members-columns";
import { MembersFilters } from "@/components/members/members-filters";
import { MembersFooter, MembersRows } from "@/components/members/members-table";
import { ChipFilter } from "@/components/page/chip-filter";
import { EmptyBlock } from "@/components/page/empty";
import { PageContent, PageHeader, TOOLBAR_HEIGHT, Toolbar } from "@/components/page/page";
import { TableCard, TableRowsSkeleton } from "@/components/page/table";
import type { SearchParamsLike } from "@/lib/drawers";
import { getCommunities, getMe } from "@/server/context";

export type CommunauteSubjectTab = "equipe" | "reglages" | "journal";

const TABS: readonly PageTabItem[] = [
  { id: "equipe", label: "Équipe" },
  { id: "reglages", label: "Réglages WhatsApp" },
  { id: "journal", label: "Journal" },
];

export async function CommunauteSubjectView({
  params,
  searchParams,
  defaultTab = "equipe",
  routeSegment = "members",
}: {
  params: Promise<{ communityId: string }>;
  searchParams: Promise<SearchParamsLike>;
  defaultTab?: CommunauteSubjectTab;
  routeSegment?: string;
}) {
  const [{ communityId }, resolvedSearch] = await Promise.all([params, searchParams]);
  const rawTab = Array.isArray(resolvedSearch.tab) ? resolvedSearch.tab[0] : resolvedSearch.tab;
  const activeTab: CommunauteSubjectTab =
    rawTab === "equipe" || rawTab === "reglages" || rawTab === "journal" ? rawTab : defaultTab;

  return (
    <PageContent>
      <PageHeader
        title="Communauté"
        description="Membres de l'équipe (support, finance), lien du groupe WhatsApp et journal d'audit."
        actions={
          activeTab === "equipe" ? (
            <Suspense fallback={null}>
              <AddMemberSection params={params} />
            </Suspense>
          ) : undefined
        }
      />
      <Suspense fallback={null}>
        <PageTabs tabs={TABS} activeTab={activeTab} />
      </Suspense>

      {activeTab === "equipe" ? (
        <>
          <Toolbar>
            <Suspense fallback={<span className="block h-11" />}>
              <MembersFilters />
            </Suspense>
          </Toolbar>
          <TableCard
            label="Membres"
            columns={MEMBER_COLUMNS}
            stickyTop={TOOLBAR_HEIGHT.chips}
            footer={
              <Suspense fallback={<span className="h-5" />}>
                <MembersFooter params={params} />
              </Suspense>
            }
          >
            <Suspense fallback={<TableRowsSkeleton columns={MEMBER_COLUMNS} rows={4} />}>
              <MembersRows params={params} searchParams={searchParams} />
            </Suspense>
          </TableCard>
        </>
      ) : null}

      {activeTab === "reglages" ? (
        <Suspense fallback={<div className="h-64 animate-pulse rounded-section bg-muted/40" />}>
          <CommunitySettingsSection communityId={communityId} />
        </Suspense>
      ) : null}

      {activeTab === "journal" ? (
        <>
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
        </>
      ) : null}

      <Suspense fallback={null}>
        <CommunauteDrawerLoader
          pathname={`/${communityId}/${routeSegment}`}
          communityId={communityId}
          searchParams={searchParams}
        />
      </Suspense>
    </PageContent>
  );
}

async function CommunitySettingsSection({ communityId }: { communityId: string }) {
  const [me, communities] = await Promise.all([getMe(), getCommunities()]);
  const community = communities.find((c) => c.id === communityId);
  if (!community) {
    return (
      <EmptyBlock
        icon="building"
        title="Communauté introuvable"
        description="Impossible de charger les réglages de cette communauté."
      />
    );
  }
  return <CommunitySettingsCard community={community} isOwner={me.platformRole === "owner"} />;
}

async function CommunauteDrawerLoader({
  pathname,
  communityId,
  searchParams,
}: {
  pathname: string;
  communityId: string;
  searchParams: Promise<SearchParamsLike>;
}) {
  const me = await getMe();
  return (
    <UniversalDrawerHost
      pathname={pathname}
      searchParams={searchParams}
      me={me}
      communityId={communityId}
    />
  );
}
