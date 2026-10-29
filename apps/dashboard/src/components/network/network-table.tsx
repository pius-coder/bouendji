import { cache } from "react";
import { ForbiddenBlock } from "@/components/page/empty";
import { can } from "@/lib/roles";
import { getMe, withSession } from "@/server/context";
import { getServices } from "@/server/services";
import { NetworkEndpointsClient } from "./network-endpoints-client";

const readPool = cache(async () => {
  const me = await getMe();
  if (!can(me, "network.read", null)) return null;
  return { me, pool: await withSession(() => getServices().network.getPool()) };
});

export async function NetworkEndpointsSection() {
  const data = await readPool();
  if (!data) return <ForbiddenBlock />;
  return (
    <NetworkEndpointsClient
      endpoints={data.pool.endpoints}
      canWrite={can(data.me, "network.write", null)}
      poolRevision={data.pool.poolRevision}
    />
  );
}
