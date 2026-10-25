"use client";

import { useState, type ReactNode } from "react";
import { Icon, type IconName } from "@/components/common/icon";
import { StatusBadge } from "@/components/common/status-badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { formatBps, formatDateTime, formatXaf, NO_VALUE } from "@/lib/format";
import type { Order } from "@/server/services/orders/orders.schema";

/**
 * Tiroir de détail d'une commande (Chariow : 500 px, en-tête identifiant + date +
 * statut, sections à tuile d'icône). Lecture seule : l'API n'expose aucune écriture
 * sur une commande, donc aucune action n'est proposée. Montants absents (rôle
 * `support`) : « — », jamais 0.
 */
export function OrderDrawer({ order: o, subscriber }: { order: Order; subscriber: { name: string; email?: string } }) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm">
          Détails
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full overflow-y-auto sm:max-w-[500px]">
        <SheetHeader>
          <SheetTitle>Commande {o.id.slice(0, 8)}</SheetTitle>
          <SheetDescription className="flex items-center gap-1.5">
            <Icon name="history" className="size-4" /> {formatDateTime(o.createdAt)}
          </SheetDescription>
          <div className="pt-2">
            <StatusBadge status={o.status} />
          </div>
        </SheetHeader>

        <div className="flex flex-col gap-6 px-5 pb-6">
          <DrawerSection icon="users" title="Abonné">
            <Line label="Nom" value={subscriber.name} />
            <Line label="Email" value={subscriber.email ?? NO_VALUE} />
          </DrawerSection>
          <DrawerSection icon="wallet" title="Paiement">
            <Line label="Montant" value={o.amountXaf === undefined ? NO_VALUE : formatXaf(o.amountXaf)} strong />
            <Line label="Commission" value={o.commissionXaf === undefined ? NO_VALUE : formatXaf(o.commissionXaf)} />
            <Line label="Taux de commission" value={o.commissionBps === undefined ? NO_VALUE : formatBps(o.commissionBps)} />
            <Line label="Devise" value={o.currency} />
          </DrawerSection>
          <DrawerSection icon="history" title="Étapes">
            <Line label="Créée" value={formatDateTime(o.createdAt)} />
            <Line label="Payée" value={formatDateTime(o.paidAt)} />
            <Line label="Activée" value={formatDateTime(o.activatedAt)} />
          </DrawerSection>
          <DrawerSection icon="tag" title="Forfait">
            <Line label="Identifiant du forfait" value={o.planId} />
          </DrawerSection>
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

function Line({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 text-subhead">
      <span className="text-muted-foreground">{label}</span>
      <span className={strong ? "font-bold text-foreground tabular-nums" : "text-foreground tabular-nums"}>{value}</span>
    </div>
  );
}
