import "server-only";
import { BUILD_COLUMNS, buildCells } from "@/components/builds/builds-columns";
import { AdminCacheSeed } from "@/components/common/admin-cache-seed";
import { EmptyBlock, ForbiddenBlock } from "@/components/page/empty";
import { TableMessage, TableRows } from "@/components/page/table";
import { getMe } from "@/server/context";
import { getServices } from "@/server/services";
import type { Build } from "@/server/services/builds/builds.service";

export async function GlobalBuildQueueRows() {
  const me = await getMe();
  if (me.platformRole !== "owner") {
    return (
      <TableMessage columns={BUILD_COLUMNS}>
        <ForbiddenBlock />
      </TableMessage>
    );
  }
  const services = getServices();
  const apps = await services.plans.listApps();
  const allBuilds: Build[] = [];
  const perApp = await Promise.all(
    apps.map((a) => services.builds.listBuilds({ appId: a.id })),
  );
  for (const list of perApp) {
    for (const b of list) allBuilds.push(b);
  }
  allBuilds.sort((a, b) => {
    if (a.status === "requested" && b.status !== "requested") return -1;
    if (b.status === "requested" && a.status !== "requested") return 1;
    return (b.createdAt ?? "").localeCompare(a.createdAt ?? "");
  });

  if (allBuilds.length === 0) {
    return (
      <TableMessage columns={BUILD_COLUMNS}>
        <EmptyBlock
          icon="download"
          title="Aucune demande de build"
          description="Les demandes d'APK soumises par les communautés apparaîtront ici."
        />
      </TableMessage>
    );
  }

  return (
    <>
      <AdminCacheSeed path="/v1/admin/apps" data={apps} />
      <TableRows rows={allBuilds} columns={BUILD_COLUMNS} getKey={(b) => b.id} cells={buildCells} />
    </>
  );
}
