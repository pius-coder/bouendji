import type { Metadata } from "next";
import { Suspense } from "react";
import { CouponTypesManager } from "@/components/coupons/coupon-types-manager";
import { UniversalDrawerSection } from "@/components/drawers/universal-drawer-host";
import { ForbiddenBlock } from "@/components/page/empty";
import { PageContent, PageHeader } from "@/components/page/page";
import type { SearchParamsLike } from "@/lib/drawers";
import { platformRolesOf } from "@/lib/roles";
import { getMe } from "@/server/context";
import { getServices } from "@/server/services";

export const metadata: Metadata = { title: "Types de coupon" };

/** Page owner (104, décision 1) : seul le propriétaire définit les types de coupon. */
export default function CouponTypesPage({ searchParams }: { searchParams: Promise<SearchParamsLike> }) {
  return (
    <PageContent>
      <PageHeader
        title="Types de coupon"
        description="Libellé et durée d'accès illimité offerts par un coupon de réduction. Les administrateurs émettent ces coupons depuis la fiche d'un abonné."
      />
      <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-fill" />}>
        <CouponTypesSection />
      </Suspense>
      <Suspense fallback={null}>
        <UniversalDrawerSection searchParams={searchParams} routeSegment="coupons" />
      </Suspense>
    </PageContent>
  );
}

async function CouponTypesSection() {
  const me = await getMe();
  if (!platformRolesOf(me).includes("owner")) return <ForbiddenBlock />;
  const apps = await getServices().plans.listApps();
  return <CouponTypesManager apps={apps.map((a) => ({ id: a.id, name: a.name }))} />;
}
