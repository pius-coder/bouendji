"use client";

import { useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { Icon, type IconName } from "@/components/common/icon";
import { StatusBadge } from "@/components/common/status-badge";
import { ConfirmDialog } from "@/components/page/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { formatDateTime, NO_VALUE } from "@/lib/format";
import type { PoolEndpoint } from "@/server/services/network/network.schema";
import { ENDPOINT_TIER_LABEL, type EndpointTier } from "@/server/services/plans/plans.schema";
import { deleteEndpointAction, setEndpointHealthAction, setEndpointStatusAction } from "@/server/actions/network.action";

export function EndpointDrawer({ endpoint: e, canWrite }: { endpoint: PoolEndpoint; canWrite: boolean }) {
  const [open, setOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmDown, setConfirmDown] = useState(false);
  const [pending, startTransition] = useTransition();
  const tierLabel = ENDPOINT_TIER_LABEL[e.tier as EndpointTier] ?? e.tier;
  const isDown = e.health === "down";

  function changeHealth(newHealth: "healthy" | "down") {
    startTransition(async () => {
      const res = await setEndpointHealthAction(e.endpointId, newHealth);
      if (res.ok) {
        setConfirmDown(false);
        toast.success(newHealth === "healthy" ? `Nœud « ${e.label} » rétabli en service` : `Nœud « ${e.label} » mis hors service`);
      } else {
        toast.error(res.message);
      }
    });
  }

  function changeStatus(newStatus: "active" | "draining" | "expired") {
    startTransition(async () => {
      const res = await setEndpointStatusAction(e.endpointId, newStatus);
      if (res.ok) {
        const labels: Record<string, string> = { active: "Actif", draining: "En vidange", expired: "Expiré" };
        toast.success(`Statut mis à jour : ${labels[newStatus] ?? newStatus}`);
      } else {
        toast.error(res.message);
      }
    });
  }

  function handleDelete() {
    startTransition(async () => {
      const res = await deleteEndpointAction(e.endpointId);
      if (res.ok) {
        setConfirmDelete(false);
        setOpen(false);
        toast.success(`Nœud « ${e.label} » définitivement supprimé`);
      } else {
        toast.error(res.message);
      }
    });
  }

  return (
    <>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="font-medium text-foreground hover:border-primary hover:text-primary transition-colors"
          >
            <Icon name="pen" className="mr-1.5 size-3.5" />
            Gérer
          </Button>
        </SheetTrigger>
        <SheetContent className="w-full overflow-y-auto sm:max-w-[500px]">
          <SheetHeader className="border-b border-border pb-4">
            <div className="flex items-center justify-between">
              <SheetTitle className="text-xl font-bold">{e.label}</SheetTitle>
              <div className="flex items-center gap-2">
                <StatusBadge status={e.health} />
                <StatusBadge status={e.status} />
              </div>
            </div>
            <SheetDescription className="flex items-center gap-2 text-sm text-muted-foreground pt-1">
              <Icon name="server" className="size-4" /> {e.region.toUpperCase()} · Tier {tierLabel}
            </SheetDescription>
          </SheetHeader>

          <div className="flex flex-col gap-6 px-4 py-5">
            {/* PANNEAU DE PILOTAGE RAPIDE */}
            {canWrite && (
              <div className="flex flex-col gap-4 rounded-xl border border-border bg-group/40 p-4">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Icon name="widget" className="size-4 text-primary" />
                  Pilotage du serveur
                </h3>

                {/* 1. SANTÉ / DISTRIBUTION */}
                <div className="flex flex-col gap-2">
                  <span className="text-xs font-medium text-muted-foreground">
                    Santé du nœud (distribution aux clients) :
                  </span>
                  {isDown ? (
                    <Button
                      variant="default"
                      size="sm"
                      disabled={pending}
                      className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold flex items-center justify-center gap-2"
                      onClick={() => changeHealth("healthy")}
                    >
                      <Icon name="check" className="size-4" />
                      Rétablir en service (Réactiver la distribution)
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={pending}
                      className="w-full border-rose-500/50 text-rose-400 hover:bg-rose-500/10 font-semibold flex items-center justify-center gap-2"
                      onClick={() => setConfirmDown(true)}
                    >
                      <Icon name="close-circle" className="size-4" />
                      Mettre hors service (Sortir du pool)
                    </Button>
                  )}
                  <p className="text-[11px] text-muted-foreground">
                    {isDown
                      ? "⚠️ Ce nœud est actuellement exclu des bundles chiffrés. Les clients ne le reçoivent plus."
                      : "✓ Ce nœud est distribué dans les bundles chiffrés des abonnés éligibles."}
                  </p>
                </div>

                {/* 2. STATUT DE CONNEXION */}
                <div className="flex flex-col gap-2 pt-2 border-t border-border">
                  <span className="text-xs font-medium text-muted-foreground">
                    Cycle de vie (Statut du trafic) :
                  </span>
                  <div className="grid grid-cols-3 gap-2">
                    <Button
                      type="button"
                      variant={e.status === "active" ? "default" : "outline"}
                      size="sm"
                      disabled={pending || e.status === "active"}
                      className={e.status === "active" ? "bg-primary font-bold" : "text-xs"}
                      onClick={() => changeStatus("active")}
                    >
                      {e.status === "active" ? "✓ Actif" : "Activer"}
                    </Button>
                    <Button
                      type="button"
                      variant={e.status === "draining" ? "default" : "outline"}
                      size="sm"
                      disabled={pending || e.status === "draining"}
                      className={e.status === "draining" ? "bg-amber-600 font-bold text-white" : "text-xs"}
                      onClick={() => changeStatus("draining")}
                    >
                      {e.status === "draining" ? "En vidange" : "Vidanger"}
                    </Button>
                    <Button
                      type="button"
                      variant={e.status === "expired" ? "default" : "outline"}
                      size="sm"
                      disabled={pending || e.status === "expired"}
                      className={e.status === "expired" ? "bg-zinc-700 font-bold" : "text-xs"}
                      onClick={() => changeStatus("expired")}
                    >
                      {e.status === "expired" ? "Expiré" : "Expirer"}
                    </Button>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    • <strong>Actif</strong> : accepte les connexions.
                    <br />• <strong>En vidange</strong> : termine les sessions en cours sans nouvelles attributions.
                    <br />• <strong>Expiré</strong> : serveur inactif archivé.
                  </p>
                </div>

                {/* 3. SUPPRESSION DÉFINITIVE */}
                <div className="pt-2 border-t border-border flex justify-end">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={pending}
                    className="text-xs text-rose-400 hover:bg-rose-500/10 hover:text-rose-300"
                    onClick={() => setConfirmDelete(true)}
                  >
                    <Icon name="trash" className="mr-1.5 size-3.5" />
                    Supprimer définitivement ce nœud
                  </Button>
                </div>
              </div>
            )}

            {/* DÉTAILS TECHNIQUES */}
            <DrawerSection icon="shield" title="Spécifications">
              <Line label="Protocole" value={e.protocol} />
              <Line label="Transport" value={e.transport} />
              <Line label="Sécurité" value={e.security} />
            </DrawerSection>

            <DrawerSection icon="chart" title="Charge & Capacité">
              <Line label="Occupation actuelle" value={`${e.inUse} / ${e.capacity}`} strong />
              <Line label="Latence de référence" value={e.latencyMs === null ? NO_VALUE : `${e.latencyMs} ms`} />
            </DrawerSection>

            <DrawerSection icon="history" title="Cycle de vie">
              <Line label="Dernier signe de vie" value={formatDateTime(e.lastSeenAt)} />
              <Line label="Date d'expiration" value={formatDateTime(e.expiresAt)} />
              {isDown && <Line label="Hors service depuis" value={formatDateTime(e.downSince)} />}
            </DrawerSection>
          </div>
        </SheetContent>
      </Sheet>

      {/* CONFIRMATION METTRE HORS SERVICE */}
      <ConfirmDialog
        open={confirmDown}
        onOpenChange={setConfirmDown}
        title={`Mettre « ${e.label} » hors service ?`}
        description="Le nœud sera immédiatement retiré du pool distribué aux abonnés. Les clients ne recevront plus ce serveur lors des synchronisations."
        confirmLabel="Mettre hors service"
        pending={pending}
        onConfirm={() => changeHealth("down")}
      />

      {/* CONFIRMATION SUPPRESSION */}
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Supprimer « ${e.label} » ?`}
        description="Cette action est irréversible. Le nœud sera retiré de la base de données et de tous les pools de connexion."
        confirmLabel="Supprimer définitivement"
        pending={pending}
        onConfirm={handleDelete}
      />
    </>
  );
}

function DrawerSection({
  icon,
  title,
  children,
}: {
  icon: IconName;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border p-4">
      <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
        <Icon name={icon} className="size-4" />
        {title}
      </div>
      <div className="divide-y divide-border/50">{children}</div>
    </div>
  );
}

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between py-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={strong ? "font-semibold text-foreground" : "text-muted-foreground"}>{value}</span>
    </div>
  );
}
