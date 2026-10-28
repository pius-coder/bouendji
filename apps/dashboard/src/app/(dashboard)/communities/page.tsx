import type { Metadata } from "next";
import { PlateformeSubjectView } from "@/components/communities/plateforme-subject-view";

export const metadata: Metadata = { title: "Communautés · Plateforme" };

export default function CommunitiesPage({ searchParams }: PageProps<"/communities">) {
  return (
    <PlateformeSubjectView
      searchParams={searchParams}
      defaultTab="communautes"
      pathname="/communities"
    />
  );
}
