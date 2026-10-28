import type { Metadata } from "next";
import { Suspense } from "react";
import { PageTabs, type PageTabItem } from "@/components/common/page-tabs";
import { StatusBadge } from "@/components/common/status-badge";
import { ManualEndpointAction } from "@/components/network/manual-endpoint-action";
import { NETWORK_COLUMNS } from "@/components/network/network-columns";
import { NetworkFooter, NetworkRows } from "@/components/network/network-table";
import { NightSlotsClient } from "@/components/network/night-slots-section";
import { TelegramTestButton } from "@/components/network/telegram-test-button";
import { XuiServersSection } from "@/components/network/xui-servers";
import { EmptyBlock, ForbiddenBlock } from "@/components/page/empty";
import { PageContent, PageHeader } from "@/components/page/page";
import { TableCard, TableMessage, TableRows, TableRowsSkeleton, type TableColumn } from "@/components/page/table";
import { formatDateTime } from "@/lib/format";
import { can } from "@/lib/roles";
import { getMe, withSession } from "@/server/context";
import { getServices } from "@/server/services";

export const metadata: Metadata = { title: "Réseau" };

export type NetworkTab = "ce-soir" | "jour" | "historique";

const TABS: readonly PageTabItem[] = [
  { id: "ce-soir", label: "Ce soir (Nuit)" },
  { id: "jour", label: "Jour (3x-ui & Pool)" },
  { id: "historique", label: "Historique" },
];

const HISTORY_COLUMNS = [
  { id: "window", header: "Créneau", mobile: "primary" },
  { id: "startsAt", header: "Début", mobile: "secondary" },
  { id: "operator", header: "Opérateur" },
  { id: "endpoints", header: "Nœud", align: "right" },
  { id: "status", header: "Statut", mobile: "trailing" },
] as const satisfies readonly TableColumn[];

export default async function NetworkPage({ searchParams }: PageProps<"/network">) {
  const resolved = await searchParams;
  const rawTab = Array.isArray(resolved.tab) ? resolved.tab[0] : resolved.tab;
  const activeTab: NetworkTab =
    rawTab === "ce-soir" || rawTab === "jour" || rawTab === "historique" ? rawTab : "ce-soir";

  return (
    <PageContent>
      <PageHeader
        title="Réseau"
        description="Créneaux de nuit (20h et minuit), serveurs de jour 3x-ui et pool d'endpoints."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <TelegramTestButton />
            <Suspense fallback={null}>
              <ManualEndpointAction />
            </Suspense>
          </div>
        }
      />

      <Suspense fallback={null}>
        <PageTabs tabs={TABS} activeTab={activeTab} />
      </Suspense>

      {activeTab === "ce-soir" ? (
        <div className="flex flex-col gap-5">
          <Suspense fallback={<div className="h-52 animate-pulse rounded-section bg-muted/40" />}>
            <TonightSlotsLoaded />
          </Suspense>

          <TableCard
            label="Nœuds actifs du pool"
            columns={NETWORK_COLUMNS}
            footer={
              <Suspense fallback={<span className="h-5" />}>
                <NetworkFooter />
              </Suspense>
            }
          >
            <Suspense fallback={<TableRowsSkeleton columns={NETWORK_COLUMNS} />}>
              <NetworkRows />
            </Suspense>
          </TableCard>
        </div>
      ) : null}

      {activeTab === "jour" ? (
        <div className="flex flex-col gap-5">
          <Suspense fallback={<div className="h-28 animate-pulse rounded-2xl border border-border bg-muted/40" />}>
            <XuiServersSection />
          </Suspense>

          <TableCard
            label="Nœuds du pool"
            columns={NETWORK_COLUMNS}
            footer={
              <Suspense fallback={<span className="h-5" />}>
                <NetworkFooter />
              </Suspense>
            }
          >
            <Suspense fallback={<TableRowsSkeleton columns={NETWORK_COLUMNS} />}>
              <NetworkRows />
            </Suspense>
          </TableCard>
        </div>
      ) : null}

      {activeTab === "historique" ? (
        <TableCard label="Historique des créneaux de nuit" columns={HISTORY_COLUMNS}>
          <Suspense fallback={<TableRowsSkeleton columns={HISTORY_COLUMNS} rows={4} />}>
            <NightHistoryRows />
          </Suspense>
        </TableCard>
      ) : null}
    </PageContent>
  );
}

async function TonightSlotsLoaded() {
  const me = await getMe();
  if (!can(me, "network.read", null)) return <ForbiddenBlock />;
  const data = await withSession(() => getServices().network.getNightSlots()).catch(() => null);
  const slots = data ? [...data.today, ...data.upcoming] : [];
  if (slots.length === 0) {
    return (
      <EmptyBlock
        icon="moon"
        title="Aucun créneau de nuit planifié"
        description="Les créneaux 20h00–00h00 et 00h00–04h00 apparaissent automatiquement chaque soir."
      />
    );
  }
  return <NightSlotsClient slots={slots} />;
}

async function NightHistoryRows() {
  const me = await getMe();
  if (!can(me, "network.read", null)) {
    return (
      <TableMessage columns={HISTORY_COLUMNS}>
        <ForbiddenBlock />
      </TableMessage>
    );
  }
  const slots = await withSession(() => getServices().network.getNightSlotsHistory()).catch(() => []);
  if (slots.length === 0) {
    return (
      <TableMessage columns={HISTORY_COLUMNS}>
        <EmptyBlock
          icon="history"
          title="Aucun historique de nuit"
          description="Les créneaux passés s'afficheront ici."
        />
      </TableMessage>
    );
  }
  return (
    <TableRows
      rows={slots}
      columns={HISTORY_COLUMNS}
      getKey={(s) => s.slotId}
      cells={(s) => ({
        window: s.label || (s.slot.includes("20") ? "20h00 – 00h00" : "00h00 – 04h00"),
        startsAt: formatDateTime(s.startsAt),
        operator: s.claimedBy?.name || "Non assigné",
        endpoints: s.endpoint ? s.endpoint.label : "—",
        status: <StatusBadge status={s.state} />,
      })}
    />
  );
}
