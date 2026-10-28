import type { Metadata } from "next";
import { Suspense } from "react";
import { UniversalDrawerSection } from "@/components/drawers/universal-drawer-host";
import { AddMemberSection } from "@/components/members/add-member-section";
import { CommunitySettingsSection } from "@/components/members/community-settings-section";
import { MEMBER_COLUMNS } from "@/components/members/members-columns";
import { MembersFilters } from "@/components/members/members-filters";
import { MembersFooter, MembersRows } from "@/components/members/members-table";
import { PageContent, PageHeader, TOOLBAR_HEIGHT, Toolbar } from "@/components/page/page";
import { Section } from "@/components/page/section";
import { TableCard, TableRowsSkeleton } from "@/components/page/table";

export const metadata: Metadata = { title: "Équipe & Réglages" };

export default function MembersPage({ params, searchParams }: PageProps<"/[communityId]/members">) {
  return (
    <PageContent>
      <PageHeader
        title="Équipe & Réglages"
        description="Les membres de la communauté, leur rôle et les coordonnées WhatsApp injectées dans l'application."
        actions={
          <Suspense fallback={null}>
            <AddMemberSection params={params} />
          </Suspense>
        }
      />
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
      <Section
        title="Réglages WhatsApp de la communauté"
        description="Ces coordonnées alimentent le pop-up de bienvenue et le bouton d'assistance WhatsApp dans l'APK (D116)."
      >
        <Suspense fallback={<div className="h-44 animate-pulse rounded-xl bg-fill" />}>
          <CommunitySettingsSection params={params} />
        </Suspense>
      </Section>
      <Suspense fallback={null}>
        <UniversalDrawerSection params={params} searchParams={searchParams} routeSegment="members" />
      </Suspense>
    </PageContent>
  );
}
