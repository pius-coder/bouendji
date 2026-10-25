import { Suspense } from "react";
import { Icon } from "@/components/common/icon";
import { UpdatedAt } from "@/components/common/updated-at";
import { EmptyBlock, ForbiddenBlock } from "@/components/page/empty";
import { TableCard, TableMessage, TableRows, TableRowsSkeleton } from "@/components/page/table";
import { can } from "@/lib/roles";
import { getMe, withSession } from "@/server/context";
import { getServices } from "@/server/services";
import { BuildTrigger } from "./build-trigger";
import { BUILD_COLUMNS, buildCells } from "./builds-columns";
import { brandMissingText } from "./builds-format";

/**
 * Une section par marque de la communauté : nom, identifiant de paquet, encart si la
 * marque est incomplète, bouton de build, puis la table de ses builds. La liste des
 * marques vient de l'API : elle est dans le Suspense de la page ; seules les lignes
 * de chaque table suspendent ensuite.
 */
export async function BuildsSection({ params }: { params: Promise<{ communityId: string }> }) {
  const { communityId } = await params;
  const me = await getMe();
  if (!can(me, "plans.manage", communityId)) return <ForbiddenBlock />;

  const apps = (await withSession(() => getServices().plans.listApps())).filter((a) => a.communityId === communityId);
  if (apps.length === 0) {
    return <EmptyBlock icon="smartphone" title="Aucune application" description="Créez d'abord une marque pour pouvoir construire son APK." />;
  }

  return (
    <>
      {apps.map((app) => (
        <section key={app.id} aria-label={app.name} className="flex flex-col gap-3">
          <div className="min-w-0">
            <h2 className="text-title-3 font-semibold tracking-tight">{app.name}</h2>
            <p className="font-mono text-footnote text-muted-foreground">{app.packageName}</p>
          </div>
          {!app.brandReady ? (
            <p role="status" className="flex items-start gap-2 rounded-xl border border-border bg-warning-soft px-4 py-3 text-footnote text-warning-text">
              <Icon name="warning" className="mt-0.5 size-4" />
              Marque incomplète. À renseigner avant un build : {brandMissingText(app.brandMissing)}.
            </p>
          ) : null}
          <BuildTrigger appId={app.id} brandReady={app.brandReady} />
          <TableCard label={`Builds de ${app.name}`} columns={BUILD_COLUMNS} footer={<UpdatedAt />}>
            <Suspense fallback={<TableRowsSkeleton columns={BUILD_COLUMNS} rows={3} />}>
              <BuildRows appId={app.id} />
            </Suspense>
          </TableCard>
        </section>
      ))}
    </>
  );
}

/** Lignes des builds d'une marque (seule partie suspendue de la carte). */
async function BuildRows({ appId }: { appId: string }) {
  const builds = await withSession(() => getServices().builds.listBuilds({ appId }));
  if (builds.length === 0) {
    return (
      <TableMessage columns={BUILD_COLUMNS}>
        <EmptyBlock icon="download" title="Aucun build" description="Construisez l'APK pour obtenir un lien de téléchargement." />
      </TableMessage>
    );
  }
  return <TableRows rows={builds} columns={BUILD_COLUMNS} getKey={(b) => b.id} cells={buildCells} />;
}
