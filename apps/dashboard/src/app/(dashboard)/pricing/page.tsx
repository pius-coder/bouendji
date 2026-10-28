import type { Metadata } from "next";
import { PlateformeSubjectView } from "@/components/communities/plateforme-subject-view";

export const metadata: Metadata = { title: "Tarifs et marges · Plateforme" };

export default function PricingPage({ searchParams }: PageProps<"/pricing">) {
  return (
    <PlateformeSubjectView
      searchParams={searchParams}
      defaultTab="tarifs"
      pathname="/pricing"
    />
  );
}
