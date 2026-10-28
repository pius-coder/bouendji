import type { Metadata } from "next";
import { PlateformeSubjectView } from "@/components/communities/plateforme-subject-view";

export const metadata: Metadata = { title: "Administrateurs · Plateforme" };

export default function AdminsPage({ searchParams }: PageProps<"/admins">) {
  return (
    <PlateformeSubjectView
      searchParams={searchParams}
      defaultTab="admins"
      pathname="/admins"
    />
  );
}
