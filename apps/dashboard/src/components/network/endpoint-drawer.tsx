"use client";

import { useState, type ReactNode } from "react";
import { Icon, type IconName } from "@/components/common/icon";
import { StatusBadge } from "@/components/common/status-badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { formatDateTime, NO_VALUE } from "@/lib/format";
import type { PoolEndpoint } from "@/server/services/network/network.schema";
import { ENDPOINT_TIER_LABEL, type EndpointTier } from "@/server/services/plans/plans.schema";
import { ForceHealthButton } from "./force-health-button";

/**
 * Tiroir de détail d'un nœud (modèle : `payouts/payout-drawer.tsx`, Chariow 500 px).
 * L'hôte, le port et l'identifiant de connexion ne sont jamais affichés : inutiles à
 * l'exploitation courante. Les actions suivent le rôle ; l'API revérifie (403 affiché).
 */
export function EndpointDrawer({ endpoint: e, canWrite }: { endpoint: PoolEndpoint; canWrite: boolean }) {
  const [open, setOpen] = useState(false);
  const tierLabel = ENDPOINT_TIER_LABEL[e.tier as EndpointTier] ?? e.tier;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="min-h-11 sm:min-h-9">
          Détails
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full overflow-y-auto sm:max-w-[500px]">
        <SheetHeader>
          <SheetTitle>{e.label}</SheetTitle>
          <SheetDescription className="flex items-center gap-1.5">
            <Icon name="server" className="size-4" /> {e.region} · {tierLabel}
          </SheetDescription>
          <div className="pt-2">
            <StatusBadge status={e.health} />
          </div>
          {canWrite ? (
            <div className="flex flex-wrap gap-2 pt-3">
              <ForceHealthButton endpointId={e.endpointId} label={e.label} health={e.health} />
            </div>
          ) : null}
        </SheetHeader>

        <div className="flex flex-col gap-6 px-5 pb-6">
          <DrawerSection icon="shield" title="Connexion">
            <Line label="Protocole" value={e.protocol} />
            <Line label="Transport" value={e.transport} />
            <Line label="Sécurité" value={e.security} />
          </DrawerSection>
          <DrawerSection icon="chart" title="Charge">
            <Line label="Occupation" value={String(e.inUse)} strong />
            <Line label="Capacité" value={String(e.capacity)} />
            <Line label="Latence" value={e.latencyMs === null ? NO_VALUE : `${e.latencyMs} ms`} />
          </DrawerSection>
          <DrawerSection icon="warning" title="Santé">
            <Line label="Hors service depuis" value={formatDateTime(e.downSince)} />
            <Line label="Motif" value={e.downReason ?? NO_VALUE} />
          </DrawerSection>
          <DrawerSection icon="history" title="Durée de vie">
            <Line label="Vu le" value={formatDateTime(e.lastSeenAt)} />
            <Line label="Expire le" value={formatDateTime(e.expiresAt)} />
          </DrawerSection>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/** Section du tiroir (Chariow) : petite tuile d'icône + titre gras + filet, puis contenu. */
function DrawerSection({ icon, title, children }: { icon: IconName; title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="flex items-center gap-2 border-b border-border pb-3 text-subhead font-bold text-foreground">
        <span className="grid size-6 place-items-center rounded-md bg-group text-muted-foreground">
          <Icon name={icon} className="size-4" />
        </span>
        {title}
      </h3>
      <div className="flex flex-col gap-2">{children}</div>
    </section>
  );
}

function Line({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 text-subhead">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className={`min-w-0 break-words text-end ${strong ? "font-bold text-foreground tabular-nums" : "text-foreground tabular-nums"}`}>
        {value}
      </span>
    </div>
  );
}
