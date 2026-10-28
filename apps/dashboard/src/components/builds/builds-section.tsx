import { Suspense } from "react";
import Link from "next/link";
import { Icon } from "@/components/common/icon";
import { PhonePreview } from "@/components/common/phone-preview";
import { ShareAppCard } from "@/components/common/qr-code";
import { UpdatedAt } from "@/components/common/updated-at";
import { EmptyBlock, ForbiddenBlock } from "@/components/page/empty";
import { TableCard, TableMessage, TableRows, TableRowsSkeleton } from "@/components/page/table";
import { Button } from "@/components/ui/button";
import { can } from "@/lib/roles";
import { getCommunities, getMe, withSession } from "@/server/context";
import { getServices } from "@/server/services";
import { BuildTrigger } from "./build-trigger";
import { BUILD_COLUMNS, buildCells } from "./builds-columns";
import { brandMissingText } from "./builds-format";

/**
 * Onglet « Application » de la page sujet Offres :
 * aperçu téléphone Android en direct (`PhonePreview`), lien d'installation + QR SVG + partage WhatsApp (`ShareAppCard`),
 * demande / lancement de build (`BuildTrigger`) et table des versions (`?build=id`).
 */
export async function BuildsSection({ params }: { params: Promise<{ communityId: string }> }) {
  const { communityId } = await params;
  const [me, communities] = await Promise.all([getMe(), getCommunities()]);
  if (!can(me, "plans.manage", communityId)) return <ForbiddenBlock />;

  const community = communities.find((c) => c.id === communityId);
  const apps = (await withSession(() => getServices().plans.listApps())).filter((a) => a.communityId === communityId);
  if (apps.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3">
        <EmptyBlock icon="smartphone" title="Aucune application" description="Créez d'abord l'identité visuelle de votre marque pour construire son APK." />
        <Button asChild size="sm">
          <Link href="/onboarding">Configurer mon application (Assistant)</Link>
        </Button>
      </div>
    );
  }

  const isOwner = me.platformRole === "owner";

  return (
    <>
      {apps.map((app) => (
        <section key={app.id} aria-label={app.name} className="flex flex-col gap-5">
          <div className="grid gap-5 rounded-section border border-separator bg-background p-5 lg:grid-cols-[1fr_auto]">
            <div className="flex flex-col justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-title-3 font-semibold tracking-tight">{app.name}</h2>
                    <p className="font-mono text-footnote text-muted-foreground">{app.packageName}</p>
                  </div>
                  <Button asChild variant="outline" size="sm">
                    <Link href="/onboarding">
                      <Icon name="pen" className="size-4" />
                      Personnaliser la marque
                    </Link>
                  </Button>
                </div>

                {!app.brandReady ? (
                  <p role="status" className="mt-3 flex items-start gap-2 rounded-xl border border-border bg-warning-soft px-4 py-3 text-footnote text-warning-text">
                    <Icon name="warning" className="mt-0.5 size-4" />
                    Marque incomplète. À renseigner avant un build : {brandMissingText(app.brandMissing)}.
                  </p>
                ) : null}
              </div>

              <Suspense fallback={null}>
                <AppShareBanner
                  appId={app.id}
                  appName={app.name}
                  whatsappGroupUrl={community?.whatsappGroupUrl}
                />
              </Suspense>

              <BuildTrigger appId={app.id} brandReady={app.brandReady} isOwner={isOwner} />
            </div>

            <div className="flex items-center justify-center rounded-section border border-separator bg-muted/30 p-4">
              <PhonePreview
                displayName={app.name}
                packageName={app.packageName}
                communityName={community?.name}
                whatsappGroupUrl={community?.whatsappGroupUrl}
                compact
              />
            </div>
          </div>

          <TableCard label={`Versions et builds de ${app.name}`} columns={BUILD_COLUMNS} footer={<UpdatedAt />}>
            <Suspense fallback={<TableRowsSkeleton columns={BUILD_COLUMNS} rows={3} />}>
              <BuildRows appId={app.id} />
            </Suspense>
          </TableCard>
        </section>
      ))}
    </>
  );
}

async function AppShareBanner({
  appId,
  appName,
  whatsappGroupUrl,
}: {
  appId: string;
  appName: string;
  whatsappGroupUrl?: string | null;
}) {
  const builds = await withSession(() => getServices().builds.listBuilds({ appId })).catch(() => []);
  const ready = builds.find((b) => b.apkUrl && (b.status === "Ready" || b.status === "succeeded")) ?? builds.find((b) => b.apkUrl);
  return (
    <ShareAppCard
      appName={appName}
      apkUrl={ready?.apkUrl ?? null}
      versionName={ready?.versionName ?? null}
      whatsappGroupUrl={whatsappGroupUrl}
    />
  );
}

/** Lignes des builds d'une marque (seule partie suspendue de la carte). */
async function BuildRows({ appId }: { appId: string }) {
  const builds = await withSession(() => getServices().builds.listBuilds({ appId }));
  if (builds.length === 0) {
    return (
      <TableMessage columns={BUILD_COLUMNS}>
        <EmptyBlock icon="download" title="Aucun build" description="Demandez une version pour lancer la compilation de l'APK." />
      </TableMessage>
    );
  }
  return <TableRows rows={builds} columns={BUILD_COLUMNS} getKey={(b) => b.id} cells={buildCells} />;
}
