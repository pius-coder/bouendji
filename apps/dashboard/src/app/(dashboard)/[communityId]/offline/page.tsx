import type { Metadata } from "next";
import { SubscribersSubjectView } from "@/components/subscribers/subscribers-subject-view";

export const metadata: Metadata = { title: "Fichiers de secours" };

export default function OfflinePage({ params, searchParams }: PageProps<"/[communityId]/offline">) {
  return (
    <SubscribersSubjectView
      params={params}
      searchParams={searchParams}
      defaultTab="secours"
      routeSegment="offline"
    />
  );
}
