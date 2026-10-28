import { StatusBadge } from "@/components/common/status-badge";
import { UpdatedAt } from "@/components/common/updated-at";
import { EmptyBlock } from "@/components/page/empty";
import { drawerOpenHref } from "@/lib/drawers";
import { formatDateTime, formatXaf } from "@/lib/format";
import { payoutsNeedingAttention } from "@/lib/home-metrics";
import { getHomeAccess, getPayouts, getPool } from "@/server/loaders/home";
import { loadHomeParams, serializeHome } from "@/server/query/home.params";
import { getServices } from "@/server/services";
import type { Build } from "@/server/services/builds/builds.service";
import { HomeRow } from "./home-row";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * File « À traiter » : demandes de build APK (owner), versements à vérifier / approuver,
 * puis nœuds hors service. Chaque ligne ouvre le tiroir correspondant sans quitter l'accueil.
 */
export async function HomeQueue({ searchParams }: { searchParams: SearchParams }) {
  const resolvedSearch = await searchParams;
  const [{ period, open }, access] = await Promise.all([loadHomeParams(searchParams), getHomeAccess()]);
  const services = getServices();

  const [payouts, pool, requestedBuilds] = await Promise.all([
    access.payouts ? getPayouts() : Promise.resolve([]),
    access.network ? getPool() : Promise.resolve(null),
    access.me.platformRole === "owner"
      ? (async () => {
          const apps = await services.plans.listApps().catch(() => []);
          const lists = await Promise.all(apps.map((a) => services.builds.listBuilds({ appId: a.id }).catch(() => [])));
          const out: Build[] = [];
          for (const list of lists) {
            for (const b of list) if (b.status === "requested") out.push(b);
          }
          return out;
        })()
      : Promise.resolve([]),
  ]);

  const todo = payoutsNeedingAttention(payouts);
  const down = (pool?.endpoints ?? []).filter((e) => e.health === "down");
  const href = (key: string) => `/${serializeHome({ period, open: open === key ? null : key })}`;
  const totalCount = requestedBuilds.length + todo.length + down.length;

  if (!access.payouts && !access.network && access.me.platformRole !== "owner") {
    return <EmptyBlock icon="lock" tone="warning" title="Rien à suivre ici" description="Votre rôle ne donne pas accès aux versements ni au réseau." />;
  }
  if (totalCount === 0) {
    return (
      <div className="flex flex-col gap-2">
        <EmptyBlock icon="check" tone="success" title="Rien à traiter" description="Aucune demande de build, aucun versement en attente et tous les nœuds sont en service." />
        <UpdatedAt />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {requestedBuilds.map((b) => (
        <HomeRow
          key={`build:${b.id}`}
          href={drawerOpenHref("/", resolvedSearch, "build", b.id)}
          replace
          scroll={false}
          icon="download"
          tone="warning"
          title={`Demande de build APK · v${b.versionName ?? "1.0.0"}`}
          subtitle={`Demandé le ${formatDateTime(b.createdAt)}`}
          trailing={<StatusBadge status="requested" className="hidden sm:inline-flex" />}
        />
      ))}
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
      <UpdatedAt scope={`${totalCount} élément${totalCount > 1 ? "s" : ""}`} />
    </div>
  );
}
