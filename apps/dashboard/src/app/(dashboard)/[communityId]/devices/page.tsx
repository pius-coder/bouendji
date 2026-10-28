import type { Metadata } from "next";
import { SubscribersSubjectView } from "@/components/subscribers/subscribers-subject-view";

export const metadata: Metadata = { title: "Appareils" };

export default function DevicesPage({ params, searchParams }: PageProps<"/[communityId]/devices">) {
  return (
    <SubscribersSubjectView
      params={params}
      searchParams={searchParams}
      defaultTab="appareils"
      routeSegment="devices"
    />
  );
}
