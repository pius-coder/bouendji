import type { Metadata } from "next";
import { OffresSubjectView } from "@/components/plans/offres-subject-view";

export const metadata: Metadata = { title: "Forfaits" };

export default function PlansPage({ params, searchParams }: PageProps<"/[communityId]/plans">) {
  return (
    <OffresSubjectView
      params={params}
      searchParams={searchParams}
      defaultTab="forfaits"
      routeSegment="plans"
    />
  );
}
