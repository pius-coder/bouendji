import { StatusBadge } from "@/components/common/status-badge";
import { UpdatedAt } from "@/components/common/updated-at";
import { EmptyBlock } from "@/components/page/empty";
import { formatDateTime, formatXaf } from "@/lib/format";
import { payoutsNeedingAttention } from "@/lib/home-metrics";
import { getHomeAccess, getPayouts, getPool } from "@/server/loaders/home";
import { loadHomeParams, serializeHome } from "@/server/query/home.params";
import { HomeRow } from "./home-row";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * File « À traiter » : versements à vérifier, échoués ou à approuver, puis nœuds hors
 * service. Chaque ligne ouvre le panneau de détail (`h_open`), sans quitter l'accueil.
 */
export async function HomeQueue({ searchParams }: { searchParams: SearchParams }) {
  const [{ period, open }, access] = await Promise.all([loadHomeParams(searchParams), getHomeAccess()]);
  const [payouts, pool] = await Promise.all([
    access.payouts ? getPayouts() : Promise.resolve([]),
    access.network ? getPool() : Promise.resolve(null),
  ]);

  const todo = payoutsNeedingAttention(payouts);
  const down = (pool?.endpoints ?? []).filter((e) => e.health === "down");
  const href = (key: string) => `/${serializeHome({ period, open: open === key ? null : key })}`;

  if (!access.payouts && !access.network) {
    return <EmptyBlock icon="lock" tone="warning" title="Rien à suivre ici" description="Votre rôle ne donne pas accès aux versements ni au réseau." />;
  }
  if (todo.length === 0 && down.length === 0) {
    return (
      <div className="flex flex-col gap-2">
        <EmptyBlock icon="check" tone="success" title="Rien à traiter" description="Aucun versement en attente et tous les nœuds sont en service." />
        <UpdatedAt />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {todo.map((p) => {
        const key = `payout:${p.id}`;
        const pending = p.status === "pending";
        return (
          <HomeRow
            key={key}
            href={href(key)}
            replace
            scroll={false}
            selected={open === key}
            icon={pending ? "wallet" : "danger"}
            tone={pending ? "warning" : "danger"}
            title={`Versement · ${p.communityName ?? "communauté"}`}
            subtitle={`Créé le ${formatDateTime(p.createdAt)}`}
            value={formatXaf(p.amountXaf)}
            trailing={<StatusBadge status={p.status} className="hidden sm:inline-flex" />}
          />
        );
      })}
      {down.map((e) => {
        const key = `endpoint:${e.endpointId}`;
        return (
          <HomeRow
            key={key}
            href={href(key)}
            replace
            scroll={false}
            selected={open === key}
            icon="server"
            tone="danger"
            title={`Nœud ${e.label}`}
            subtitle={e.downReason ?? `Région ${e.region}`}
            trailing={<StatusBadge status="down" className="hidden sm:inline-flex" />}
          />
        );
      })}
      <UpdatedAt scope={`${todo.length + down.length} élément${todo.length + down.length > 1 ? "s" : ""}`} />
    </div>
  );
}
