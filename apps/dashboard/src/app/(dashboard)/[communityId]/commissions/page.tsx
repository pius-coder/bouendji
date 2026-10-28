import type { Metadata } from "next";
import { ArgentSubjectView } from "@/components/payouts/argent-subject-view";

export const metadata: Metadata = { title: "Commissions" };

export default async function CommissionsPage({ params, searchParams }: PageProps<"/[communityId]/commissions">) {
  const { communityId } = await params;
  return (
    <ArgentSubjectView
      communityIdProp={communityId}
      searchParams={searchParams}
      defaultTab="commissions"
      pathname={`/${communityId}/commissions`}
    />
  );
}
