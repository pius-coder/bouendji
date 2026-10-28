"use client";

import * as React from "react";
import { toast } from "sonner";
import { DetailFacts } from "@/components/common/detail-panel";
import { Icon } from "@/components/common/icon";
import { ShareAppCard } from "@/components/common/qr-code";
import { StatusBadge } from "@/components/common/status-badge";
import { shortId } from "@/components/offline/offline-status";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useInvalidateAdmin } from "@/hooks/use-admin-query";
import { formatDateTime, NO_VALUE } from "@/lib/format";
import { approveBuildAction, rejectBuildAction } from "@/server/actions/builds.action";
import type { Build } from "@/server/services/builds/builds.service";

/**
 * Contenu de la fiche build (`?build=id`).
 * Pour le propriétaire (`isOwner`) quand `status === "requested"` :
 * boutons « Valider et compiler » (`approveBuildAction`) et « Refuser avec motif » (`rejectBuildAction`).
 */
export function BuildSheetBody({
  build,
  appName,
  isOwner = false,
}: {
  build: Build;
  appName: string;
  isOwner?: boolean;
}) {
  const invalidate = useInvalidateAdmin();
  const [pending, startTransition] = React.useTransition();
  const [rejectReason, setRejectReason] = React.useState("");
  const [showRejectBox, setShowRejectBox] = React.useState(false);

  const handleApprove = () => {
    startTransition(async () => {
      const res = await approveBuildAction(build.id);
      if (res.ok) {
        toast.success("Demande validée · Compilation Android lancée.");
        await invalidate("/v1/admin/apps");
      } else {
        toast.error(res.message);
      }
    });
  };

  const handleReject = () => {
    if (rejectReason.trim().length < 3) {
      toast.error("Indiquez un motif d'au moins 3 caractères.");
      return;
    }
    startTransition(async () => {
      const res = await rejectBuildAction(build.id, rejectReason.trim());
      if (res.ok) {
        toast.success("Demande de build refusée.");
        setShowRejectBox(false);
        await invalidate("/v1/admin/apps");
      } else {
        toast.error(res.message);
      }
    });
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <StatusBadge status={build.status} />
          <span className="font-mono text-subhead font-semibold text-foreground">
            v{build.versionName ?? "1.0.0"} {build.versionCode ? `(#${build.versionCode})` : ""}
          </span>
        </div>
        <span className="text-footnote text-muted-foreground">
          {formatDateTime(build.createdAt)}
        </span>
      </div>

      {isOwner && build.status === "requested" ? (
        <div className="flex flex-col gap-3 rounded-section border border-separator bg-muted/40 p-4">
          <div>
            <p className="text-subhead font-semibold text-foreground">
              Demande d&apos;application en attente de validation
            </p>
            <p className="text-footnote text-muted-foreground">
              Vérifiez l&apos;identité de la marque avant de lancer la compilation GitHub Actions.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={pending} onClick={handleApprove}>
              {pending ? <Spinner /> : <Icon name="check" className="size-4" />}
              Valider et compiler
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => setShowRejectBox((v) => !v)}
            >
              Refuser avec motif
            </Button>
          </div>
          {showRejectBox ? (
            <div className="flex flex-col gap-2 pt-1">
              <Input
                placeholder="Motif du refus (ex. logo illisible, nom réservé…)"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
              />
              <div className="flex justify-end">
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={pending || rejectReason.trim().length < 3}
                  onClick={handleReject}
                >
                  Confirmer le refus
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {build.rejectReason ? (
        <div className="rounded-section border border-destructive/30 bg-destructive/10 p-3.5 text-subhead text-destructive">
          <strong>Motif du refus :</strong> {build.rejectReason}
        </div>
      ) : null}

      {build.apkUrl ? (
        <ShareAppCard
          appName={appName}
          apkUrl={build.apkUrl}
          versionName={build.versionName}
        />
      ) : null}

      <DetailFacts
        items={[
          { label: "Identifiant build", value: shortId(build.id), mono: true },
          {
            label: "Version",
            value: `${build.versionName ?? "1.0.0"}${build.versionCode ? ` (code ${build.versionCode})` : ""}`,
            mono: true,
          },
          { label: "Statut", value: <StatusBadge status={build.status} /> },
          { label: "Empreinte SHA-256", value: build.sha256 || NO_VALUE, mono: true },
          { label: "Demandé le", value: formatDateTime(build.createdAt) },
          { label: "Mis à jour le", value: formatDateTime(build.updatedAt) },
        ]}
      />
    </div>
  );
}
