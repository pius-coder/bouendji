import type { Metadata } from "next";
import { Suspense } from "react";
import { AdminCacheSeed } from "@/components/common/admin-cache-seed";
import { StatusBadge } from "@/components/common/status-badge";
import { ManualEndpointAction } from "@/components/network/manual-endpoint-action";
import { NetworkEndpointsSection } from "@/components/network/network-table";
import { NightSlotsClient } from "@/components/network/night-slots-section";
import { PurgeExpiredButton } from "@/components/network/purge-button";
import { TelegramTestButton } from "@/components/network/telegram-test-button";
import { XuiServersSection } from "@/components/network/xui-servers";
import { EmptyBlock, ForbiddenBlock } from "@/components/page/empty";
import { PageContent, PageHeader } from "@/components/page/page";
import { Section } from "@/components/page/section";
import { TableCard, TableMessage, TableRows, TableRowsSkeleton, type TableColumn } from "@/components/page/table";
import { formatDateTime } from "@/lib/format";
import { can } from "@/lib/roles";
import { getMe, withSession } from "@/server/context";
import { getServices } from "@/server/services";

export const metadata: Metadata = { title: "Réseau" };

const HISTORY_COLUMNS = [
  { id: "window", header: "Créneau", mobile: "primary" },
  { id: "startsAt", header: "Début", mobile: "secondary" },
  { id: "operator", header: "Opérateur" },
  { id: "endpoints", header: "Nœud", align: "right" },
  { id: "status", header: "Statut", mobile: "trailing" },
] as const satisfies readonly TableColumn[];

/**
 * Page Réseau synchrone et atomiquement suspendue (D104) :
 * aucun `await searchParams` hors `<Suspense>`, chaque section charge sa donnée
 * indépendamment.
 */
export default function NetworkPage() {
  return (
    <PageContent>
      <PageHeader
        title="Réseau"
        description="Créneaux de nuit (20h et minuit), serveurs de jour 3x-ui et pool d'endpoints."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <TelegramTestButton />
            <PurgeExpiredButton />
            <Suspense fallback={null}>
              <ManualEndpointAction />
            </Suspense>
          </div>
        }
      />

      <Section
        title="Créneaux de nuit (20h00 et 00h00)"
        description="Prenez en charge un créneau, générez une clé de déploiement à usage unique (D124) et suivez le rappel Telegram (D119)."
      >
        <Suspense fallback={<div className="h-44 animate-pulse rounded-xl bg-fill" />}>
          <TonightSlotsLoaded />
        </Suspense>
      </Section>

      <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl border border-border bg-muted/40" />}>
        <NetworkEndpointsSection />
      </Suspense>

      <Suspense fallback={<div className="h-24 animate-pulse rounded-2xl border border-border bg-muted/40" />}>
        <XuiServersSection />
      </Suspense>

      <Section
        title="Historique des créneaux de nuit"
        description="Suivi des prises en charge et des nœuds enregistrés sur les créneaux précédents."
      >
        <TableCard label="Historique des créneaux de nuit" columns={HISTORY_COLUMNS}>
          <Suspense fallback={<TableRowsSkeleton columns={HISTORY_COLUMNS} rows={4} />}>
            <NightHistoryRows />
          </Suspense>
        </TableCard>
      </Section>
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
  return (
    <>
      <AdminCacheSeed path="/v1/admin/night-slots" data={data} />
      <NightSlotsClient slots={slots} />
    </>
  );
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
    <>
      <AdminCacheSeed path="/v1/admin/night-slots/history" data={slots} />
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
    </>
  );
}
