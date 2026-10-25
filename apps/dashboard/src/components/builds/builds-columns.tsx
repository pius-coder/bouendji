import { StatusBadge } from "@/components/common/status-badge";
import { CellStack, type TableColumn } from "@/components/page/table";
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
] as const satisfies readonly TableColumn[];

/**
 * Lien de l'APK : seulement quand l'API l'a reçu du callback CI (`apkUrl`). Sans
 * lien, un tiret : le build n'est pas encore terminé, ou il a échoué.
 */
export function buildCells(build: Build) {
  const sha = shortSha256(build.sha256);
  return {
    version: <CellStack title={formatVersion(build.versionName, build.versionCode)} />,
    status: <StatusBadge status={build.status} />,
    createdAt: formatDateTime(build.createdAt),
    updatedAt: formatDateTime(build.updatedAt),
    link: build.apkUrl ? (
      <span className="flex flex-wrap items-center gap-2">
        <CopyLinkButton url={build.apkUrl} />
        {sha ? (
          <span className="font-mono text-footnote text-muted-foreground" title={build.sha256 ?? undefined}>
            SHA-256 {sha}…
          </span>
        ) : null}
      </span>
    ) : (
      <span className="text-muted-foreground" title="Le lien apparaît quand le build est terminé.">
        {NO_VALUE}
      </span>
    ),
  };
}
