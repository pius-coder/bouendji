import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { DataBoundary } from "@/components/common/data-boundary";
import { GroupedList, GroupedSection } from "@/components/common/grouped-list";
import { ListRow, ListSkeleton } from "@/components/common/list-row";
import { PageHeader } from "@/components/common/page-header";
import { PageBody, SplitView } from "@/components/common/page-layout";
import { Delta, StatStrip } from "@/components/common/stat-strip";
import { EmptyState, ErrorState, ForbiddenState } from "@/components/common/states";
import { StatusBadge } from "@/components/common/status-badge";
import { KitControls } from "@/components/kit/kit-controls";
import { KitDeviceDetail, KitDevicesSection } from "@/components/kit/kit-devices-section";

export const metadata: Metadata = { title: "Kit", robots: { index: false, follow: false } };

/**
 * Démonstration INTERNE du kit `components/common/` (non publiée : 404 en production).
 * Sert de référence visuelle et de patron : table complète sur données fictives
 * déterministes, contrôles, états, graphiques.
 */
export default function KitPage({ searchParams }: PageProps<"/kit">) {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <PageBody wide>
      <PageHeader title="Kit" subtitle="Primitives communes — démonstration interne, absente en production." />
      <SplitView
        panel={
          <Suspense fallback={null}>
            <KitDeviceDetail searchParams={searchParams} />
          </Suspense>
        }
      >
        <GroupedList>
          <GroupedSection title="Table" titleId="kit-table" inset={false} footer="Tri, filtres, recherche et pagination côté serveur ; colonnes et densité mémorisées dans ce navigateur.">
            <DataBoundary fallback={<ListSkeleton count={8} />}>
              <KitDevicesSection searchParams={searchParams} />
            </DataBoundary>
          </GroupedSection>

          <GroupedSection title="Chiffres clés" titleId="kit-stats" inset={false}>
            <StatStrip
              items={[
                { label: "Ventes encaissées", value: "1 240 000 XAF", hint: <Delta value={12} /> },
                { label: "Commandes payées", value: "418", hint: <Delta value={-4} /> },
                { label: "Nouveaux abonnés", value: "57", hint: <Delta value={null} /> },
                { label: "Nœuds en service", value: "11 / 12", tone: "danger", hint: "1 hors service" },
              ]}
            />
          </GroupedSection>

          <GroupedSection title="Liste groupée" titleId="kit-list">
            <ListRow title="Communauté Douala" subtitle="48 abonnés" value="182 000 XAF" href="/kit" />
            <ListRow title="Paiement en attente" trailing={<StatusBadge status="pending" />} />
            <ListRow title="Nœud hors service" trailing={<StatusBadge status="down" />} />
            <ListRow title="Option choisie" accessory="check" />
          </GroupedSection>

          <KitControls />

          <GroupedSection title="États" titleId="kit-states" inset={false}>
            <div className="grid gap-4 md:grid-cols-3">
              <EmptyState title="Aucun appareil" description="Les appareils apparaissent après leur premier enregistrement." />
              <ErrorState />
              <ForbiddenState />
            </div>
          </GroupedSection>
        </GroupedList>
      </SplitView>
    </PageBody>
  );
}
