"use client";

import { useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { Icon, type IconName } from "@/components/common/icon";
import { StatusBadge, statusLabel } from "@/components/common/status-badge";
import { ConfirmDialog } from "@/components/page/confirm-dialog";
import { OfflineStatusBadge } from "@/components/offline/offline-status-badge";
import { offlineFileStatus, shortId } from "@/components/offline/offline-status";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { formatDateTime, NO_VALUE } from "@/lib/format";
import { revokeDeviceAction } from "@/server/actions/devices.action";
import type { Device, OfflineBundleState } from "@/server/services/devices/devices.schema";
import { OfflineBundleSection } from "./offline-bundle-section";

export interface DeviceCaps {
  /** `can(me, "devices.revoke", communityId)` */
  revoke: boolean;
  /** `can(me, "devices.offline", communityId)` */
  offline: boolean;
}

/**
 * Tiroir de détail d'un appareil (modèle : `payouts/payout-drawer.tsx`, Chariow :
 * 500 px). En-tête : nom, plateforme, statut ; rangée d'actions : fichier de
 * secours (rendu inline, pas de feuille imbriquée) et révocation (confirmée).
 * Les actions suivent l'état (révoqué = rien à faire) et le rôle ; l'API revérifie
 * tout (403 affiché tel quel par toast).
 */
export function DeviceDrawer({
  device,
  subscriber,
  bundles,
  caps,
}: {
  device: Device;
  subscriber: string;
  bundles: readonly OfflineBundleState[];
  caps: DeviceCaps;
}) {
  const [open, setOpen] = useState(false);
  const [showOffline, setShowOffline] = useState(false);
  const [revokeOpen, setRevokeOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const name = device.name || shortId(device.deviceId);
  const live = !device.revokedAt && device.status !== "revoked";

  function revoke() {
    startTransition(async () => {
      const result = await revokeDeviceAction(device.deviceId);
      if (result.ok) {
        const n = result.data.sessionsRevoked;
        toast.success(`Appareil révoqué · ${n} session${n > 1 ? "s" : ""} fermée${n > 1 ? "s" : ""}`);
        setRevokeOpen(false);
        setOpen(false);
      } else {
        toast.error(result.message);
      }
    });
  }

  return (
    <>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button variant="outline" size="sm">
            Détails
          </Button>
        </SheetTrigger>
        <SheetContent className="w-full overflow-y-auto sm:max-w-[500px]">
          <SheetHeader>
            <SheetTitle>{name}</SheetTitle>
            <SheetDescription className="flex items-center gap-1.5">
              <Icon name="smartphone" className="size-4" /> {device.platform || NO_VALUE}
            </SheetDescription>
            <div className="pt-2">
              <StatusBadge status={device.status} />
            </div>
            {live && (caps.offline || caps.revoke) ? (
              <div className="flex flex-wrap gap-2 pt-3">
                {caps.offline ? (
                  <Button size="sm" variant="outline" aria-expanded={showOffline} onClick={() => setShowOffline((v) => !v)}>
                    <Icon name="file-download" /> Fichier de secours
                  </Button>
                ) : null}
                {caps.revoke ? (
                  <Button size="sm" variant="destructive" disabled={pending} onClick={() => setRevokeOpen(true)}>
                    Révoquer
                  </Button>
                ) : null}
              </div>
            ) : null}
          </SheetHeader>

          <div className="flex flex-col gap-6 px-5 pb-6">
            {live && caps.offline && showOffline ? (
              <DrawerSection icon="file-download" title="Nouveau fichier de secours">
                <OfflineBundleSection deviceId={device.deviceId} deviceName={name} />
              </DrawerSection>
            ) : null}

            <DrawerSection icon="smartphone" title="Appareil">
              <Line label="Identifiant" value={shortId(device.deviceId)} />
              <Line label="Plateforme" value={device.platform || NO_VALUE} />
              <Line label="Statut" value={statusLabel(device.status)} />
              <Line label="Créé" value={formatDateTime(device.createdAt)} />
              <Line label="Dernière activité" value={formatDateTime(device.lastSeenAt)} />
              <Line label="Révoqué le" value={formatDateTime(device.revokedAt)} />
            </DrawerSection>

            <DrawerSection icon="users" title="Abonné">
              <Line label="Nom" value={subscriber} />
            </DrawerSection>

            <DrawerSection icon="file-download" title="Fichiers de secours de cet appareil">
              {bundles.length === 0 ? (
                <p className="text-footnote text-muted-foreground">Aucun fichier de secours émis pour cet appareil.</p>
              ) : (
                <ul className="flex flex-col divide-y divide-border">
                  {bundles.map((b) => (
                    <li key={b.id} className="flex items-center justify-between gap-3 py-2.5 text-subhead">
                      <span className="flex min-w-0 flex-col">
                        <span className="text-foreground">Valable jusqu&apos;au {formatDateTime(b.notAfter)}</span>
                        <span className="text-footnote text-muted-foreground tabular-nums">Réf. {shortId(b.id)}</span>
                      </span>
                      <OfflineStatusBadge state={offlineFileStatus(b)} />
                    </li>
                  ))}
                </ul>
              )}
            </DrawerSection>
          </div>
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={revokeOpen}
        onOpenChange={setRevokeOpen}
        title={`Révoquer « ${name} » ?`}
        description="L'appareil perd son accès et ses sessions sont fermées. Il devra être enregistré à nouveau."
        confirmLabel="Révoquer"
        pending={pending}
        onConfirm={revoke}
      />
    </>
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

/** Ligne du tiroir : libellé gris à gauche, valeur à droite. */
function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 text-subhead">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-foreground tabular-nums">{value}</span>
    </div>
  );
}
