import type { Metadata } from "next";
import { Suspense } from "react";
import { UniversalDrawerSection } from "@/components/drawers/universal-drawer-host";
import { ForbiddenBlock } from "@/components/page/empty";
import { PageContent, PageHeader } from "@/components/page/page";
import { PaymentOperatorsPanel } from "@/components/payment-operators/payment-operators-panel";
import type { SearchParamsLike } from "@/lib/drawers";
import { can } from "@/lib/roles";
import { getMe } from "@/server/context";
import { getServices } from "@/server/services";

export const metadata: Metadata = { title: "Paiements" };

/**
 * Page owner (106, décision 2) : disponibilité d'Orange Money et de MTN MoMo
 * sur la page Fapshi. Les administrateurs de communauté ne la voient pas.
 */
export default function PaymentsPage({ searchParams }: { searchParams: Promise<SearchParamsLike> }) {
  return (
    <PageContent>
      <PageHeader
        title="Paiements"
        description="Opérateurs proposés sur la page de paiement Fapshi. Réglage manuel : aucune détection automatique."
      />
      <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-fill" />}>
        <PaymentOperatorsSection />
      </Suspense>
      <Suspense fallback={null}>
        <UniversalDrawerSection searchParams={searchParams} routeSegment="payments" />
      </Suspense>
    </PageContent>
  );
}

async function PaymentOperatorsSection() {
  const me = await getMe();
  if (!can(me, "payment_operators.manage", null)) return <ForbiddenBlock />;
  const state = await getServices().paymentOperators.getState();
  return <PaymentOperatorsPanel initialState={state} />;
}
