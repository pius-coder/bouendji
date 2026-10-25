import { InsightBand } from "@/components/common/insight-band";
import { dailySeries, isPaidIn, periodStart, saleDate, windowDays } from "@/lib/home-metrics";
import { can } from "@/lib/roles";
import { getCommunityOrders, getCommunitySubscribers, getHomeAccess, getRequestNow } from "@/server/loaders/home";
import { loadHomeParams, PERIOD_DAYS, PERIOD_LABEL } from "@/server/query/home.params";
import type { Order } from "@/server/services/orders/orders.schema";
import type { Subscriber } from "@/server/services/subscribers/subscribers.schema";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * Tendance de la période (orya `AdminInsightBand`) : ventes encaissées (ou commandes
 * payées si le rôle ne voit pas les montants) en série principale, abonnés en série
 * secondaire, répartition par communauté à côté. Calculé sur les listes de l'API
 * (100 commandes / 100 abonnés par communauté au plus) : la note le dit.
 */
export async function HomeTrend({ searchParams }: { searchParams: SearchParams }) {
  const [{ period }, access] = await Promise.all([loadHomeParams(searchParams), getHomeAccess()]);
  const now = await getRequestNow();
  const since = periodStart(now, PERIOD_DAYS[period]);
  const days = windowDays(now, PERIOD_DAYS[period]);

  const [orderResults, subscriberResults] = await Promise.all([
    Promise.allSettled(access.ordersCommunities.map(async (c) => ({ community: c, page: await getCommunityOrders(c.id) }))),
    Promise.allSettled(access.subscribersCommunities.map((c) => getCommunitySubscribers(c.id))),
  ]);
  const byCommunity = orderResults.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
  const paid: Order[] = byCommunity.flatMap(({ page }) => page.items.filter((o) => isPaidIn(o, since)));
  const subscribers: Subscriber[] = subscriberResults.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
  const money = access.moneyVisible && paid.some((o) => o.amountXaf !== undefined);
  const truncated = byCommunity.some(({ page }) => Boolean(page.nextCursor));

  const salesKey = money ? "sales" : "orders";
  const salesValues = dailySeries(paid, days, saleDate, money ? (o) => o.amountXaf ?? 0 : () => 1);
  const ordersValues = dailySeries(paid, days, saleDate);
  const subscriberValues = dailySeries(subscribers, days, (s) => s.createdAt);

  const series = [
    money
      ? { key: "sales", label: "Ventes", color: "var(--chart-1)", heavy: true, format: "xaf" as const }
      : { key: "orders", label: "Commandes payées", color: "var(--chart-1)", heavy: true, format: "number" as const },
    ...(money ? [{ key: "orders", label: "Commandes", color: "var(--chart-2)", format: "number" as const }] : []),
    ...(access.subscribersCommunities.length > 0
      ? [{ key: "subscribers", label: "Nouveaux abonnés", color: "var(--chart-3)", format: "number" as const }]
      : []),
  ];

  if (access.ordersCommunities.length === 0 && access.subscribersCommunities.length === 0) {
    return null;
  }

  const data = days.map((x, i) => ({
    x,
    values: { [salesKey]: salesValues[i], orders: ordersValues[i], subscribers: subscriberValues[i] },
  }));
  const totals = {
    sales: salesValues.reduce((a, b) => a + b, 0),
    orders: ordersValues.reduce((a, b) => a + b, 0),
    subscribers: subscriberValues.reduce((a, b) => a + b, 0),
  };

  const breakdown = byCommunity
    .map(({ community, page }) => {
      const own = page.items.filter((o) => isPaidIn(o, since));
      const showMoney = money && can(access.me, "money.read", community.id);
      return { id: community.id, label: community.name, value: showMoney ? own.reduce((s, o) => s + (o.amountXaf ?? 0), 0) : own.length };
    })
    .filter((b) => b.value > 0)
    .sort((a, b) => b.value - a.value);

  // Carte à bordure fine, comme les lignes de la file ; la bande garde son propre fond et son padding.
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <InsightBand
        label={`${money ? "Ventes encaissées" : "Commandes payées"} par jour, ${PERIOD_LABEL[period]}`}
        series={series}
        data={data}
        totals={totals}
        format={money ? "xaf" : "number"}
        breakdown={byCommunity.length > 1 ? { title: money ? "Ventes par communauté" : "Commandes par communauté", items: breakdown } : undefined}
        note={truncated ? "Calculé sur les 100 dernières commandes de chaque communauté (limite de l’API)." : undefined}
      />
    </div>
  );
}
