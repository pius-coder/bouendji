"use client";

import * as React from "react";
import { toast } from "sonner";
import { DetailFacts } from "@/components/common/detail-panel";
import { Icon } from "@/components/common/icon";
import { StatusBadge, statusLabel } from "@/components/common/status-badge";
import { OfflineBundleSection } from "@/components/devices/offline-bundle-section";
import { EntityLink } from "@/components/drawers/entity-link";
import { OfflineStatusBadge } from "@/components/offline/offline-status-badge";
import { offlineFileStatus, shortId } from "@/components/offline/offline-status";
import { ConfirmDialog } from "@/components/page/confirm-dialog";
import { Button } from "@/components/ui/button";
import { formatDateTime, NO_VALUE } from "@/lib/format";
import { revokeDeviceAction } from "@/server/actions/devices.action";
import type { DeviceDetail, OfflineBundleState } from "@/server/services/devices/devices.schema";

export interface DeviceSheetCaps {
  revoke: boolean;
  offline: boolean;
}

/**
 * Contenu de la fiche appareil (`?appareil=id`) chargée via `GET /v1/admin/devices/:deviceId`.
 * Inclut le lien cliquable vers l'abonné (`?abonne=`), la santé 24h, la génération
 * de fichier de secours `.bvpn` et la révocation confirmée.
 */
export function DeviceSheetBody({
  detail,
  bundles = [],
  caps,
}: {
  detail: DeviceDetail;
  bundles?: readonly OfflineBundleState[];
  caps: DeviceSheetCaps;
}) {
  const { reports24h } = detail;
  const [showOffline, setShowOffline] = React.useState(false);
  const [revokeOpen, setRevokeOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();

  const name = detail.name || shortId(detail.deviceId);
  const live = !detail.revokedAt && detail.status !== "revoked";
  const totalReports = reports24h.ok + reports24h.failed;
  const healthRate =
    totalReports > 0
      ? `${Math.round((reports24h.ok / totalReports) * 100)} % (${reports24h.ok}/${totalReports})`
      : "Aucun relevé sur 24h";

  const handleRevoke = () => {
    startTransition(async () => {
      const result = await revokeDeviceAction(detail.deviceId);
      if (result.ok) {
        const n = result.data.sessionsRevoked;
        toast.success(`Appareil révoqué · ${n} session${n > 1 ? "s" : ""} fermée${n > 1 ? "s" : ""}`);
        setRevokeOpen(false);
      } else {
        toast.error(result.message);
      }
    });
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <StatusBadge status={detail.status} />
        {live && (caps.offline || caps.revoke) ? (
          <div className="flex flex-wrap items-center gap-2">
            {caps.offline ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setShowOffline((v) => !v)}
              >
                <Icon name="file-download" className="size-4" />
                Fichier de secours (.bvpn)
              </Button>
            ) : null}
            {caps.revoke ? (
              <Button
                type="button"
                size="sm"
                variant="destructive"
                disabled={pending}
                onClick={() => setRevokeOpen(true)}
              >
                Révoquer l&apos;appareil
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      {live && caps.offline && showOffline ? (
        <div className="rounded-section border border-separator bg-muted/40 p-4">
          <h4 className="mb-2 text-subhead font-semibold text-foreground">
            Émettre un fichier de secours (.bvpn)
          </h4>
          <OfflineBundleSection deviceId={detail.deviceId} deviceName={name} />
        </div>
      ) : null}

      <DetailFacts
        items={[
          {
            label: "Abonné",
            value: detail.userId ? (
              <EntityLink kind="abonne" id={detail.userId}>
                <Icon name="users" className="size-3.5 text-muted-foreground" />
                <span>{detail.userName || detail.userEmail || shortId(detail.userId)}</span>
              </EntityLink>
            ) : (
              NO_VALUE
            ),
          },
          { label: "Identifiant", value: shortId(detail.deviceId), mono: true },
          { label: "Plateforme", value: detail.platform || NO_VALUE },
          { label: "Statut", value: statusLabel(detail.status) },
          { label: "Santé tunnel (24h)", value: healthRate },
          { label: "Dernière activité", value: formatDateTime(detail.lastSeenAt) },
          { label: "Enregistré le", value: formatDateTime(detail.createdAt) },
          ...(detail.revokedAt
            ? [{ label: "Révoqué le", value: formatDateTime(detail.revokedAt) }]
            : []),
        ]}
      />

      <div className="flex flex-col gap-2">
        <h4 className="text-subhead font-semibold text-foreground">
          Fichiers de secours émis ({bundles.length})
        </h4>
        {bundles.length === 0 ? (
          <p className="text-footnote text-muted-foreground">
            Aucun fichier de secours émis pour cet appareil.
          </p>
        ) : (
          <ul className="divide-y divide-separator overflow-hidden rounded-section border border-separator bg-background">
            {bundles.map((b) => (
              <li key={b.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-subhead">
                <span className="flex min-w-0 flex-col">
                  <span className="text-foreground">Valable jusqu&apos;au {formatDateTime(b.notAfter)}</span>
                  <span className="font-mono text-caption text-muted-foreground">Réf. {shortId(b.id)}</span>
                </span>
                <OfflineStatusBadge state={offlineFileStatus(b)} />
              </li>
            ))}
          </ul>
        )}
      </div>

      <ConfirmDialog
        open={revokeOpen}
        onOpenChange={setRevokeOpen}
        title={`Révoquer « ${name} » ?`}
        description="L'appareil perd immédiatement son accès et ses sessions sont fermées. L'abonné devra enregistrer son téléphone à nouveau."
        confirmLabel="Révoquer"
        pending={pending}
        onConfirm={handleRevoke}
      />
    </div>
  );
}
