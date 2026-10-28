import type { Metadata } from "next";
import { SubscribersSubjectView } from "@/components/subscribers/subscribers-subject-view";

export const metadata: Metadata = { title: "Commandes" };

export default function OrdersPage({ params, searchParams }: PageProps<"/[communityId]/orders">) {
  return (
    <SubscribersSubjectView
      params={params}
      searchParams={searchParams}
      defaultTab="commandes"
      routeSegment="orders"
    />
  );
}
