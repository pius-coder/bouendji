import type { Metadata } from "next";
import { Suspense } from "react";
import { ADMIN_COLUMNS, AdminsFooter, AdminsRows, CreateAdminAction } from "@/components/admins/admins-table";
import { UniversalDrawerSection } from "@/components/drawers/universal-drawer-host";
import { PageContent, PageHeader } from "@/components/page/page";
import { TableCard, TableRowsSkeleton } from "@/components/page/table";

export const metadata: Metadata = { title: "Administrateurs" };

export default function AdminsPage({ searchParams }: PageProps<"/admins">) {
  return (
    <PageContent>
      <PageHeader
        title="Administrateurs"
        description="Comptes qui peuvent se connecter à la console et rôles plateforme."
        actions={
          <Suspense fallback={null}>
            <CreateAdminAction />
          </Suspense>
        }
      />
      <TableCard
        label="Administrateurs"
        columns={ADMIN_COLUMNS}
        footer={
          <Suspense fallback={<span className="h-5" />}>
            <AdminsFooter />
          </Suspense>
        }
      >
        <Suspense fallback={<TableRowsSkeleton columns={ADMIN_COLUMNS} rows={4} />}>
          <AdminsRows />
        </Suspense>
      </TableCard>
      <Suspense fallback={null}>
        <UniversalDrawerSection searchParams={searchParams} routeSegment="admins" />
      </Suspense>
    </PageContent>
  );
}
