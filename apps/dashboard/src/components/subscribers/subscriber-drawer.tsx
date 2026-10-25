"use client";

import { useState, type ReactNode } from "react";
import { Icon, type IconName } from "@/components/common/icon";
import { StatusBadge } from "@/components/common/status-badge";
import { CellStack } from "@/components/page/table";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { formatDateTime, formatXaf, NO_VALUE } from "@/lib/format";
import type { Device } from "@/server/services/devices/devices.schema";
import type { Order } from "@/server/services/orders/orders.schema";
import type { Subscriber } from "@/server/services/subscribers/subscribers.schema";

/**
 * Tiroir de détail d'un abonné (Chariow : 500 px). Lecture seule : l'API n'expose
 * aucune écriture sur un abonné. Appareils et commandes arrivent déjà filtrés par le
 * composant serveur (aucun appel réseau ici). `undefined` = droit absent : la section
 * n'est pas affichée.
 */
export function SubscriberDrawer({
  subscriber: s,
  devices,
  orders,
}: {
  subscriber: Subscriber;
  devices?: readonly Device[];
  orders?: readonly Order[];
}) {
  const [open, setOpen] = useState(false);
  const state = s.deleted ? "deleted" : s.emailVerified ? "verified" : "unverified";
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm">
          Détails
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full overflow-y-auto sm:max-w-[500px]">
        <SheetHeader>
          <SheetTitle>{s.name || s.email}</SheetTitle>
          <SheetDescription className="flex items-center gap-1.5">
            <Icon name="history" className="size-4" /> {formatDateTime(s.createdAt)}
          </SheetDescription>
          <div className="pt-2">
            <StatusBadge status={state} />
          </div>
        </SheetHeader>

        <div className="flex flex-col gap-6 px-5 pb-6">
          <DrawerSection icon="users" title="Identité">
            <Line label="Nom" value={s.name || NO_VALUE} />
            <Line label="Email" value={s.email} />
            <Line label="Langue" value={s.locale.toUpperCase()} />
            <Line label="Email vérifié" value={s.emailVerified ? "Oui" : "Non"} />
            <Line label="Supprimé" value={s.deleted ? "Oui" : "Non"} />
            <Line label="Inscrit le" value={formatDateTime(s.createdAt)} />
          </DrawerSection>

          {devices ? (
            <DrawerSection icon="smartphone" title="Appareils">
              {devices.length === 0 ? (
                <p className="text-subhead text-muted-foreground">Aucun appareil.</p>
              ) : (
                devices.map((d) => (
                  <div key={d.deviceId} className="flex items-center justify-between gap-3">
                    <CellStack title={d.name || d.deviceId.slice(0, 8)} subtitle={d.platform} />
                    <StatusBadge status={d.status} />
                  </div>
                ))
              )}
              <p className="text-footnote text-muted-foreground">Parmi les 100 appareils les plus récents de la communauté.</p>
            </DrawerSection>
          ) : null}

          {orders ? (
            <DrawerSection icon="receipt" title="Commandes">
              {orders.length === 0 ? (
                <p className="text-subhead text-muted-foreground">Aucune commande.</p>
              ) : (
                orders.map((o) => (
                  <div key={o.id} className="flex items-center justify-between gap-3">
                    <CellStack
                      title={`Commande ${o.id.slice(0, 8)}`}
                      subtitle={formatDateTime(o.createdAt)}
                    />
                    <span className="flex shrink-0 items-center gap-3">
                      <span className="text-subhead tabular-nums text-foreground">
                        {o.amountXaf === undefined ? NO_VALUE : formatXaf(o.amountXaf)}
                      </span>
                      <StatusBadge status={o.status} />
                    </span>
                  </div>
                ))
              )}
              <p className="text-footnote text-muted-foreground">Parmi les 100 commandes les plus récentes de la communauté.</p>
            </DrawerSection>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}

/** Section du tiroir (Chariow) : petite tuile d'icône + titre gras + filet, puis contenu. Même patron que `payout-drawer.tsx`. */
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

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 text-subhead">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-foreground tabular-nums">{value}</span>
    </div>
  );
}
