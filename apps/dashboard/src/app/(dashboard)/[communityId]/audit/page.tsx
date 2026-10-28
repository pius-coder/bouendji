import type { Metadata } from "next";
import { CommunauteSubjectView } from "@/components/communities/communaute-subject-view";

export const metadata: Metadata = { title: "Journal" };

export default function AuditPage({ params, searchParams }: PageProps<"/[communityId]/audit">) {
  return (
    <CommunauteSubjectView
      params={params}
      searchParams={searchParams}
      defaultTab="journal"
      routeSegment="audit"
    />
  );
}
