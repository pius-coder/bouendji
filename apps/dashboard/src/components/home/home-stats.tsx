import { cache } from "react";
import { Delta, deltaPercent } from "@/components/common/stat-strip";
import { formatXaf, NO_VALUE } from "@/lib/format";
import { countCreatedIn, periodStart, previousWindowSales, summarizePool, summarizeSales } from "@/lib/home-metrics";
import { getCommunityOrders, getCommunitySubscribers, getHomeAccess, getPool, getRequestNow, SUBSCRIBERS_CAP } from "@/server/loaders/home";
import { loadHomeParams, PERIOD_DAYS, type HomePeriod } from "@/server/query/home.params";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * Indicateurs de l'accueil, calculés UNE fois par requête (`cache`) et lus par
 * quatre composants de valeur : chaque carte garde son libellé statique et ne
 * suspend que son chiffre (D104). Une valeur hors du rôle s'affiche « — ».
 */
const computeStats = cache(async (period: HomePeriod) => {
  const access = await getHomeAccess();
  const since = periodStart(await getRequestNow(), PERIOD_DAYS[period]);
  const [orderPages, subscriberLists, pool] = await Promise.all([
    Promise.allSettled(access.ordersCommunities.map((c) => getCommunityOrders(c.id))),
    Promise.allSettled(access.subscribersCommunities.map((c) => getCommunitySubscribers(c.id))),
    access.network ? getPool().then((p) => p, () => null) : Promise.resolve(null),
  ]);

  const pages = orderPages.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
  const ordersFailed = orderPages.some((r) => r.status === "rejected");
  const sales = access.ordersCommunities.length > 0 ? summarizeSales(pages, since) : null;
  const previous = sales && !sales.truncated && !ordersFailed ? previousWindowSales(pages, since, PERIOD_DAYS[period]) : null;
  const partial = sales?.truncated ? "au moins · 100 dernières commandes par communauté" : ordersFailed ? "données partielles" : null;

  let subscribers: { count: number; truncated: boolean } | null = null;
  if (access.subscribersCommunities.length > 0) {
    subscribers = { count: 0, truncated: false };
    for (const r of subscriberLists) {
      if (r.status !== "fulfilled") continue;
      const c = countCreatedIn(r.value, since, SUBSCRIBERS_CAP);
      subscribers.count += c.count;
      subscribers.truncated ||= c.truncated;
    }
  }
  return { access, sales, previous, partial, subscribers, pool: pool ? summarizePool(pool.endpoints) : null };
});

async function read(searchParams: SearchParams) {
  const { period } = await loadHomeParams(searchParams);
  return computeStats(period);
}

export async function SalesValue({ searchParams }: { searchParams: SearchParams }) {
  const s = await read(searchParams);
  if (!s.sales || !s.access.moneyVisible || s.sales.amountXaf === null) return <>{NO_VALUE}</>;
  return <>{formatXaf(s.sales.amountXaf)}</>;
}

export async function SalesHint({ searchParams }: { searchParams: SearchParams }) {
  const s = await read(searchParams);
  if (!s.sales || !s.access.moneyVisible || s.sales.amountXaf === null) return <>Non visible pour votre rôle</>;
  return s.partial ?? <Delta value={s.previous ? deltaPercent(s.sales.amountXaf, s.previous.amountXaf) : null} />;
}

export async function PaidValue({ searchParams }: { searchParams: SearchParams }) {
  const s = await read(searchParams);
  return <>{s.sales ? s.sales.paidCount.toLocaleString("fr-FR") : NO_VALUE}</>;
}

export async function PaidHint({ searchParams }: { searchParams: SearchParams }) {
  const s = await read(searchParams);
  if (!s.sales) return <>Non visible pour votre rôle</>;
  return s.partial ?? <Delta value={s.previous ? deltaPercent(s.sales.paidCount, s.previous.paidCount) : null} />;
}

export async function SubscribersValue({ searchParams }: { searchParams: SearchParams }) {
  const s = await read(searchParams);
  return <>{s.subscribers ? s.subscribers.count.toLocaleString("fr-FR") : NO_VALUE}</>;
}

export async function SubscribersHint({ searchParams }: { searchParams: SearchParams }) {
  const s = await read(searchParams);
  if (!s.subscribers) return <>Non visible pour votre rôle</>;
  return <>{s.subscribers.truncated ? "au moins · 100 derniers par communauté" : "sur la période"}</>;
}

export async function NodesValue({ searchParams }: { searchParams: SearchParams }) {
  const s = await read(searchParams);
  return <>{s.pool ? `${s.pool.healthy} / ${s.pool.total}` : NO_VALUE}</>;
}

export async function NodesHint({ searchParams }: { searchParams: SearchParams }) {
  const s = await read(searchParams);
  if (!s.pool) return <>Non visible pour votre rôle</>;
  return <span className={s.pool.down > 0 ? "text-destructive" : undefined}>{s.pool.down > 0 ? `${s.pool.down} hors service` : "maintenant"}</span>;
}
