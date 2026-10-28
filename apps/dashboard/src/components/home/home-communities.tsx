import { EmptyBlock } from "@/components/page/empty";
import { formatXaf } from "@/lib/format";
import { periodStart, summarizeSales } from "@/lib/home-metrics";
import { can } from "@/lib/roles";
import { getCommunityOrders, getHomeAccess, getHomeScope, getRequestNow } from "@/server/loaders/home";
import { loadHomeParams, PERIOD_DAYS } from "@/server/query/home.params";
import { HomeRow } from "./home-row";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export async function HomeCommunities({ searchParams }: { searchParams: SearchParams }) {
  const [{ period }, access, scope] = await Promise.all([loadHomeParams(searchParams), getHomeAccess(), getHomeScope()]);
  const since = periodStart(await getRequestNow(), PERIOD_DAYS[period]);

  if (access.communities.length === 0) {
    return <EmptyBlock icon="building" title="Aucune communauté" description="Aucune communauté n’est rattachée à votre compte." />;
  }

  const rows = await Promise.all(
    access.communities.map(async (c) => {
      if (!can(access.me, "orders.read", c.id)) return { community: c, sales: null, failed: false };
      try {
        const page = await getCommunityOrders(c.id);
        return { community: c, sales: summarizeSales([page], since), failed: false };
      } catch {
        return { community: c, sales: null, failed: true };
      }
    }),
  );
  rows.sort((a, b) => (b.sales?.amountXaf ?? b.sales?.paidCount ?? -1) - (a.sales?.amountXaf ?? a.sales?.paidCount ?? -1));

  return (
    <div className="flex flex-col gap-2">
      {rows.map(({ community, sales, failed }) => {
        const money = sales && sales.amountXaf !== null && can(access.me, "money.read", community.id);
        return (
          <HomeRow
            key={community.id}
            href={`/${community.id}/orders`}
            icon="building"
            tone="neutral"
            title={community.name}
            subtitle={
              failed
                ? "Commandes indisponibles"
                : sales
                  ? `${sales.paidCount} commande${sales.paidCount > 1 ? "s" : ""} payée${sales.paidCount > 1 ? "s" : ""}${sales.truncated ? " (au moins)" : ""}`
                  : community.suspended
                    ? "Suspendue"
                    : "Commandes non visibles pour votre rôle"
            }
            value={money ? formatXaf(sales.amountXaf!) : undefined}
          />
        );
      })}
      {scope.cappedFrom ? <p className="px-1 text-footnote text-muted-foreground">{HOME_CAP_NOTE(scope.cappedFrom)}</p> : null}
    </div>
  );
}

const HOME_CAP_NOTE = (n: number) => `Les 25 premières communautés sur ${n} sont affichées.`;
