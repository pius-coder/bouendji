import type { Metadata } from "next";
import { SubscribersSubjectView } from "@/components/subscribers/subscribers-subject-view";

export const metadata: Metadata = { title: "Abonnés" };

export default function SubscribersPage({ params, searchParams }: PageProps<"/[communityId]/subscribers">) {
  return (
    <SubscribersSubjectView
      params={params}
      searchParams={searchParams}
      defaultTab="abonnes"
      routeSegment="subscribers"
    />
  );
}
