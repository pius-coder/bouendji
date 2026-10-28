import type { Metadata } from "next";
import { CommunauteSubjectView } from "@/components/communities/communaute-subject-view";

export const metadata: Metadata = { title: "Équipe & Réglages" };

export default function MembersPage({ params, searchParams }: PageProps<"/[communityId]/members">) {
  return (
    <CommunauteSubjectView
      params={params}
      searchParams={searchParams}
      defaultTab="equipe"
      routeSegment="members"
    />
  );
}
