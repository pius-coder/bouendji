import type { Metadata } from "next";
import { Suspense } from "react";
import { AdminCacheSeed } from "@/components/common/admin-cache-seed";
import { UniversalDrawerSection } from "@/components/drawers/universal-drawer-host";
import { ForbiddenBlock } from "@/components/page/empty";
import { PageContent, PageHeader } from "@/components/page/page";
import { PricingSettingsForm } from "@/components/pricing/pricing-settings-form";
import { getMe } from "@/server/context";
import { getServices } from "@/server/services";

export const metadata: Metadata = { title: "Tarifs et marges" };

export default function PricingPage({ searchParams }: PageProps<"/pricing">) {
  return (
    <PageContent>
      <PageHeader
        title="Tarifs et marges"
        description="Coût de base par Go, coût par créneau de nuit, marge plateforme et plafond de commission (D121, D125)."
      />
      <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-fill" />}>
        <PricingSection />
      </Suspense>
      <Suspense fallback={null}>
        <UniversalDrawerSection searchParams={searchParams} routeSegment="pricing" />
      </Suspense>
    </PageContent>
  );
}

async function PricingSection() {
  const me = await getMe();
  if (me.platformRole !== "owner") return <ForbiddenBlock />;
  const pricing = await getServices().pricing.getPricing();
  return (
    <>
      <AdminCacheSeed path="/v1/admin/pricing" data={pricing} />
      <PricingSettingsForm initialPricing={pricing} />
    </>
  );
}
