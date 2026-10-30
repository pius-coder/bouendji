import { StatusBadge } from "@/components/common/status-badge";
import { EntityLink } from "@/components/drawers/entity-link";
import { CellStack, type TableColumn } from "@/components/page/table";
import { Button } from "@/components/ui/button";
import { formatDateTime, NO_VALUE } from "@/lib/format";
import type { Build } from "@/server/services/builds/builds.service";
import { formatVersion, shortSha256 } from "./builds-format";
import { CopyLinkButton } from "./copy-link-button";

export const BUILD_COLUMNS = [
  { id: "version", header: "Version", mobile: "primary" },
  { id: "status", header: "Statut", mobile: "trailing" },
  { id: "createdAt", header: "Créé" },
  { id: "updatedAt", header: "Mis à jour", wide: true },
  { id: "link", header: "Lien", mobile: "secondary" },
  { id: "open", header: "", align: "right", mobile: "trailing" },
] as const satisfies readonly TableColumn[];

/**
 * Chaque ligne de build ouvre son tiroir (`?build=id`) permettant de voir le SHA-256,
 * le motif de refus éventuel ou de valider/refuser la demande (owner).
 */
export function buildCells(build: Build) {
  const sha = shortSha256(build.sha256);
  return {
    version: (
      <EntityLink kind="build" id={build.id} className="no-underline hover:underline">
        <CellStack
          title={formatVersion(build.versionName, build.versionCode)}
          subtitle={build.rejectReason ? `Refusé : ${build.rejectReason}` : undefined}
        />
      </EntityLink>
    ),
    status: <StatusBadge status={build.status} />,
    createdAt: formatDateTime(build.createdAt),
    updatedAt: formatDateTime(build.updatedAt),
    link: build.downloadPageUrl ? (
      <span className="flex flex-wrap items-center gap-2">
        <CopyLinkButton url={build.downloadPageUrl} />
        {sha ? (
          <span className="font-mono text-footnote text-muted-foreground" title={build.sha256 ?? undefined}>
            SHA-256 {sha}…
          </span>
        ) : null}
      </span>
    ) : (
      <span className="text-muted-foreground" title="La page apparaît quand la marque a un sous-domaine publié.">
        {NO_VALUE}
      </span>
    ),
    open: (
      <Button asChild variant="outline" size="sm">
        <EntityLink kind="build" id={build.id} className="no-underline">
          Fiche
        </EntityLink>
      </Button>
    ),
  };
}
