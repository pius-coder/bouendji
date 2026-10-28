import type { Metadata } from "next";
import { Suspense } from "react";
import { DataBoundary } from "@/components/common/data-boundary";
import { InsightBandSkeleton } from "@/components/common/insight-band";
import { ListSkeleton } from "@/components/common/list-row";
import { SplitView } from "@/components/common/page-layout";
import { UniversalDrawerSection } from "@/components/drawers/universal-drawer-host";
import { HomeAppShare, HomeOnboardingBanner } from "@/components/home/home-app-share";
import { HomeRecentActivity } from "@/components/home/home-activity";
import { HomeCommunities } from "@/components/home/home-communities";
import { HomeDetail } from "@/components/home/home-detail";
import { HomePeriod, HomePeriodSkeleton } from "@/components/home/home-period";
import { HomeQueue } from "@/components/home/home-queue";
import {
  NodesHint,
  NodesValue,
  PaidHint,
  PaidValue,
  SalesHint,
  SalesValue,
  SubscribersHint,
  SubscribersValue,
} from "@/components/home/home-stats";
import { HomeTrend } from "@/components/home/home-trend";
import { PageContent, PageHeader } from "@/components/page/page";
import { Section } from "@/components/page/section";
import { StatCard, StatGrid, StatValueSkeleton } from "@/components/page/stat";

export const metadata: Metadata = { title: "Accueil" };

const hint = <span className="block h-4 w-28 animate-pulse rounded bg-group-strong" />;

/**
 * Accueil (D104) : titre, libellés des cartes et titres de section sont statiques ;
 * chaque chiffre, chaque indication et chaque liste attend SA donnée dans sa propre
 * frontière `<Suspense>`.
 */
export default function HomePage({ searchParams }: PageProps<"/">) {
  return (
    <PageContent wide>
      <PageHeader
        title="Accueil"
        description="Ventes, abonnés, application et réseau de vos communautés."
        actions={
          <Suspense fallback={<HomePeriodSkeleton />}>
            <HomePeriod />
          </Suspense>
        }
      />
      <Suspense fallback={null}>
        <HomeOnboardingBanner />
      </Suspense>
      <StatGrid>
        <StatCard label="Ventes encaissées" icon="wallet" hint={<Suspense fallback={hint}><SalesHint searchParams={searchParams} /></Suspense>}>
          <Suspense fallback={<StatValueSkeleton />}>
            <SalesValue searchParams={searchParams} />
          </Suspense>
        </StatCard>
        <StatCard label="Commandes payées" icon="receipt" hint={<Suspense fallback={hint}><PaidHint searchParams={searchParams} /></Suspense>}>
          <Suspense fallback={<StatValueSkeleton />}>
            <PaidValue searchParams={searchParams} />
          </Suspense>
        </StatCard>
        <StatCard label="Nouveaux abonnés" icon="users" hint={<Suspense fallback={hint}><SubscribersHint searchParams={searchParams} /></Suspense>}>
          <Suspense fallback={<StatValueSkeleton />}>
            <SubscribersValue searchParams={searchParams} />
          </Suspense>
        </StatCard>
        <StatCard label="Nœuds en service" icon="server" hint={<Suspense fallback={hint}><NodesHint searchParams={searchParams} /></Suspense>}>
          <Suspense fallback={<StatValueSkeleton />}>
            <NodesValue searchParams={searchParams} />
          </Suspense>
        </StatCard>
      </StatGrid>
      <SplitView
        panel={
          <Suspense fallback={null}>
            <HomeDetail searchParams={searchParams} />
          </Suspense>
        }
      >
        <div className="flex flex-col gap-4">
          <Section title="À traiter" description="Demandes de build, versements et nœuds qui attendent une décision.">
            <DataBoundary fallback={<ListSkeleton count={3} withLeading />} errorTitle="Impossible de charger la file">
              <HomeQueue searchParams={searchParams} />
            </DataBoundary>
          </Section>
          <Section title="Application et partage" description="Lien d'installation, QR code WhatsApp et aperçu Android en direct.">
            <DataBoundary fallback={<div className="h-64 animate-pulse rounded-xl bg-fill" />} errorTitle="Impossible de charger l'application">
              <HomeAppShare />
            </DataBoundary>
          </Section>
          <Section title="Tendance" description="Rythme de la période.">
            <DataBoundary fallback={<InsightBandSkeleton />} errorTitle="Impossible de tracer la tendance">
              <HomeTrend searchParams={searchParams} />
            </DataBoundary>
          </Section>
          <Section title="Par communauté">
            <DataBoundary fallback={<ListSkeleton count={3} withLeading />} errorTitle="Impossible de charger les communautés">
              <HomeCommunities searchParams={searchParams} />
            </DataBoundary>
          </Section>
          <Section title="Activité récente" description="Dernières commandes, inscriptions et révocations enregistrées.">
            <DataBoundary fallback={<ListSkeleton count={4} withLeading />} errorTitle="Impossible de charger l'activité récente">
              <HomeRecentActivity searchParams={searchParams} />
            </DataBoundary>
          </Section>
        </div>
      </SplitView>
      <Suspense fallback={null}>
        <UniversalDrawerSection searchParams={searchParams} pathname="/" />
      </Suspense>
    </PageContent>
  );
}
