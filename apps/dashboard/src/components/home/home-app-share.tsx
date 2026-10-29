import "server-only";
import Link from "next/link";
import { Icon } from "@/components/common/icon";
import { PhonePreview } from "@/components/common/phone-preview";
import { ShareAppCard } from "@/components/common/qr-code";
import { StatusBadge } from "@/components/common/status-badge";
import { EmptyBlock } from "@/components/page/empty";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format";
import { getCommunities } from "@/server/context";
import { getServices } from "@/server/services";
import { BRAND_THEMES, type BrandTheme } from "@/server/services/onboarding/onboarding.schema";

/**
 * Bandeau atomique d'onboarding / dernier build sur l'accueil (D104).
 */
export async function HomeOnboardingBanner() {
  const services = getServices();
  const [communities, onboarding, apps] = await Promise.all([
    getCommunities(),
    services.onboarding.getOnboarding(),
    services.plans.listApps(),
  ]);

  const primary = communities[0] ?? null;
  const primaryApp = primary ? apps.find((a) => a.communityId === primary.id) : apps[0];
  const builds = primaryApp
    ? await services.builds.listBuilds({ appId: primaryApp.id })
    : [];
  const latestBuild = builds[0] ?? null;

  if (!primary || (onboarding && onboarding.completedAt === null && onboarding.step < 6)) {
    const currentStep = onboarding?.step ?? 1;
    return (
      <div className="flex flex-col justify-between gap-4 rounded-2xl bg-accent-soft/55 p-5 sm:flex-row sm:items-center">
        <div className="flex items-start gap-3.5">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground">
            <Icon name="tag" className="size-5" />
          </span>
          <div>
            <p className="text-subhead font-bold text-foreground">
              Configuration de votre marque en cours (Étape {currentStep} / 6)
            </p>
            <p className="mt-0.5 text-footnote text-muted-foreground">
              Terminez l&apos;assistant pour personnaliser votre application Android, définir vos forfaits et générer votre APK.
            </p>
          </div>
        </div>
        <Button asChild size="sm" className="shrink-0">
          <Link href="/onboarding">Reprendre l&apos;assistant</Link>
        </Button>
      </div>
    );
  }

  if (!latestBuild) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-3">
      <div className="flex items-center gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-group text-foreground">
          <Icon name="smartphone" className="size-4" />
        </span>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-footnote font-semibold text-foreground">
              Application {primaryApp?.name ?? primary.name}
            </p>
            <StatusBadge status={latestBuild.status} />
          </div>
          <p className="text-caption text-muted-foreground">
            Version {latestBuild.versionName ?? "1.0.0"} · {formatDateTime(latestBuild.createdAt)}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {latestBuild.apkUrl ? (
          <Button asChild size="sm" variant="outline">
            <a href={latestBuild.apkUrl} target="_blank" rel="noreferrer">
              <Icon name="download" className="size-4" />
              Télécharger l&apos;APK
            </a>
          </Button>
        ) : null}
        <Button asChild size="sm" variant="ghost">
          <Link href={`/${primary.id}/builds`}>Gérer l&apos;application</Link>
        </Button>
      </div>
    </div>
  );
}

/**
 * Bloc atomique « Application et partage » sur l'accueil :
 * `ShareAppCard` (QR SVG + WhatsApp) et `PhonePreview` fidèle au thème Android de la marque.
 */
export async function HomeAppShare() {
  const services = getServices();
  const [communities, apps] = await Promise.all([
    getCommunities(),
    services.plans.listApps(),
  ]);

  const primary = communities[0] ?? null;
  if (!primary) {
    return (
      <EmptyBlock
        icon="smartphone"
        title="Aucune marque configurée"
        description="Lancez l'assistant de configuration pour créer votre marque et obtenir votre lien de téléchargement."
      />
    );
  }

  const primaryApp = apps.find((a) => a.communityId === primary.id) ?? apps[0];
  const builds = primaryApp
    ? await services.builds.listBuilds({ appId: primaryApp.id })
    : [];
  const latestReady = builds.find((b) => b.status === "ready" && b.apkUrl) ?? builds[0] ?? null;
  const safeTheme: BrandTheme =
    primaryApp && (BRAND_THEMES as readonly string[]).includes(primaryApp.theme)
      ? (primaryApp.theme as BrandTheme)
      : "billet";

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <ShareAppCard
        appName={primaryApp?.name ?? primary.name}
        apkUrl={latestReady?.apkUrl ?? null}
        versionName={latestReady?.versionName}
        whatsappGroupUrl={primary.whatsappGroupUrl}
      />
      <div className="flex items-center justify-center rounded-xl border border-border bg-card p-4">
        <PhonePreview
          appName={primaryApp?.name ?? primary.name}
          communityName={primary.name}
          theme={safeTheme}
          whatsappGroupUrl={primary.whatsappGroupUrl}
          contactWhatsapp={primary.contactWhatsapp}
          compact
        />
      </div>
    </div>
  );
}
