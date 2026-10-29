import { Suspense } from "react";
import { DataBoundary } from "@/components/common/data-boundary";
import { OnboardingWizard, type InitialAppInfo } from "@/components/onboarding/onboarding-wizard";
import { PageContent, PageHeader } from "@/components/page/page";
import { getCommunities, getMe } from "@/server/context";
import { getServices } from "@/server/services";
import type { Build } from "@/server/services/builds/builds.service";
import { BRAND_THEMES, type BrandTheme, previewPackageName, slugFromName } from "@/server/services/onboarding/onboarding.schema";
import type { Plan } from "@/server/services/plans/plans.schema";

export default function OnboardingPage() {
  return (
    <PageContent>
      <PageHeader
        title="Assistant de configuration"
        description="Créez votre communauté, personnalisez votre application Android et préparez vos forfaits en 6 étapes."
      />
      <Suspense fallback={<div className="h-96 animate-pulse rounded-section bg-muted/40" />}>
        <OnboardingContent />
      </Suspense>
    </PageContent>
  );
}

async function OnboardingContent() {
  return (
    <DataBoundary
      fallback={<div className="h-96 animate-pulse rounded-section bg-muted/40" />}
      errorTitle="Impossible de charger l'assistant de configuration"
    >
      <OnboardingLoaded />
    </DataBoundary>
  );
}

async function OnboardingLoaded() {
  const services = getServices();
  const [me, communities, onboarding, pricing, allApps] = await Promise.all([
    getMe(),
    getCommunities(),
    services.onboarding.getOnboarding(),
    services.pricing.getPricing(),
    services.plans.listApps(),
  ]);

  const initialCommunity = communities[0] ?? null;
  let initialApp: InitialAppInfo | null = null;
  let initialPlans: readonly Plan[] = [];
  let initialBuilds: readonly Build[] = [];

  if (initialCommunity) {
    const firstApp = allApps.find((a) => a.communityId === initialCommunity.id);
    if (firstApp) {
      const safeTheme: BrandTheme = (BRAND_THEMES as readonly string[]).includes(firstApp.theme)
        ? (firstApp.theme as BrandTheme)
        : "billet";
      initialApp = {
        id: firstApp.id,
        slug: slugFromName(firstApp.name) ?? "app",
        displayName: firstApp.name,
        packageName: firstApp.packageName ?? previewPackageName(firstApp.name),
        theme: safeTheme,
      };
      const [appPlans, appBuilds] = await Promise.all([
        services.plans.listPlans({ appId: firstApp.id }),
        services.builds.listBuilds({ appId: firstApp.id }),
      ]);
      initialPlans = appPlans.filter((p) => p.family !== "custom");
      initialBuilds = appBuilds;
    }
  }

  return (
    <OnboardingWizard
      adminName={me.name}
      onboarding={onboarding}
      initialCommunity={initialCommunity}
      initialApp={initialApp}
      initialPlans={initialPlans}
      initialBuilds={initialBuilds}
      pricing={pricing}
    />
  );
}
