import type { Metadata } from "next";
import { OffresSubjectView } from "@/components/plans/offres-subject-view";

export const metadata: Metadata = { title: "Application" };

export default function BuildsPage({ params, searchParams }: PageProps<"/[communityId]/builds">) {
  return (
    <OffresSubjectView
      params={params}
      searchParams={searchParams}
      defaultTab="application"
      routeSegment="builds"
    />
  );
}
