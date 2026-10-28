import type { Metadata } from "next";
import { ArgentSubjectView } from "@/components/payouts/argent-subject-view";

export const metadata: Metadata = { title: "Versements & Commissions" };

export default function PayoutsPage({ searchParams }: PageProps<"/payouts">) {
  return (
    <ArgentSubjectView
      searchParams={searchParams}
      defaultTab="versements"
      pathname="/payouts"
    />
  );
}
