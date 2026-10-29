import type { Metadata } from "next";
import { Suspense } from "react";
import { ManualEndpointAction } from "@/components/network/manual-endpoint-action";
import { NetworkEndpointsSection } from "@/components/network/network-table";
import { PurgeExpiredButton } from "@/components/network/purge-button";
import { TelegramTestButton } from "@/components/network/telegram-test-button";
import { XuiServersSection } from "@/components/network/xui-servers";
import { PageContent, PageHeader } from "@/components/page/page";

export const metadata: Metadata = { title: "Réseau" };

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
        description="Serveurs 3x-ui et pool VLESS partagé par les forfaits illimités et le trafic de nuit."
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

      <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl border border-border bg-muted/40" />}>
        <NetworkEndpointsSection />
      </Suspense>

      <Suspense fallback={<div className="h-24 animate-pulse rounded-2xl border border-border bg-muted/40" />}>
        <XuiServersSection />
      </Suspense>

    </PageContent>
  );
}
