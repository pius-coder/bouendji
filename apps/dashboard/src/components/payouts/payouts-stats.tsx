import "server-only";
import { cache } from "react";
import { AdminCacheSeed } from "@/components/common/admin-cache-seed";
import { formatXaf, NO_VALUE } from "@/lib/format";
import { can } from "@/lib/roles";
import { getCommunities, getMe, withSession } from "@/server/context";
import { getServices } from "@/server/services";

/**
 * Totaux de la section Argent, dédoublonnés par requête (`cache`) et exposés
 * en composants atomiques (D104) pour que chaque `StatCard` reste statique et ne
 * suspende que sa valeur.
 */
const computeArgentStats = cache(async (communityIdProp?: string) => {
  const services = getServices();
  const [me, communities] = await Promise.all([getMe(), getCommunities()]);
  const targetCommunityId = communityIdProp ?? communities[0]?.id;

  const [payouts, commissions] = await Promise.all([
    can(me, "payouts.read", null)
      ? withSession(() => services.payouts.listPayouts({}))
      : Promise.resolve([]),
    targetCommunityId && can(me, "money.read", targetCommunityId)
      ? withSession(() => services.orders.listCommissions({ communityId: targetCommunityId, limit: 100 }))
      : Promise.resolve([]),
  ]);

  const visible = can(me, "payouts.read", null) || Boolean(targetCommunityId && can(me, "money.read", targetCommunityId));
  if (!visible) return null;

  const availableXaf = commissions
    .filter((c) => c.status === "available" && !c.payoutId)
    .reduce((acc, c) => acc + c.amountXaf, 0);

  const pendingXaf = payouts
    .filter((p) => p.status === "pending" || p.status === "approved" || p.status === "processing")
    .reduce((acc, p) => acc + p.amountXaf, 0);

  const confirmedXaf = payouts
    .filter((p) => p.status === "paid" || p.status === "confirmed")
    .reduce((acc, p) => acc + p.amountXaf, 0);

  return { availableXaf, pendingXaf, confirmedXaf, payouts };
});

export async function AvailablePayoutValue({ params }: { params?: Promise<{ communityId: string }> }) {
  const resolved = params ? await params : undefined;
  const stats = await computeArgentStats(resolved?.communityId);
  if (!stats) return <>{NO_VALUE}</>;
  return (
    <>
      <AdminCacheSeed path="/v1/admin/payouts" data={stats.payouts} />
      {formatXaf(stats.availableXaf)}
    </>
  );
}

export async function PendingPayoutValue({ params }: { params?: Promise<{ communityId: string }> }) {
  const resolved = params ? await params : undefined;
  const stats = await computeArgentStats(resolved?.communityId);
  if (!stats) return <>{NO_VALUE}</>;
  return <>{formatXaf(stats.pendingXaf)}</>;
}

export async function ConfirmedPayoutValue({ params }: { params?: Promise<{ communityId: string }> }) {
  const resolved = params ? await params : undefined;
  const stats = await computeArgentStats(resolved?.communityId);
  if (!stats) return <>{NO_VALUE}</>;
  return <>{formatXaf(stats.confirmedXaf)}</>;
}
