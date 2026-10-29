import { UpdatedAt } from "@/components/common/updated-at";
import { EmptyBlock } from "@/components/page/empty";
import { drawerOpenHref, type DrawerKind } from "@/lib/drawers";
import { formatDateTime } from "@/lib/format";
import { can } from "@/lib/roles";
import { getCommunities, getMe, withSession } from "@/server/context";
import { getServices } from "@/server/services";
import { HomeRow } from "./home-row";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function targetToDrawerKind(targetType?: string | null): DrawerKind | null {
  if (!targetType) return null;
  const t = targetType.toLowerCase();
  if (t.includes("user") || t.includes("subscri")) return "abonne";
  if (t.includes("device")) return "appareil";
  if (t.includes("order")) return "commande";
  if (t.includes("plan")) return "forfait";
  if (t.includes("payout")) return "versement";
  if (t.includes("build")) return "build";
  return null;
}

/**
 * Bloc « Activité récente » de l'accueil (GET /v1/admin/audit-log).
 * Chaque ligne ouvre le tiroir de l'objet concerné lorsqu'un identifiant est disponible.
 */
export async function HomeRecentActivity({ searchParams }: { searchParams: SearchParams }) {
  const [resolvedSearch, me, communities] = await Promise.all([
    searchParams,
    getMe(),
    getCommunities(),
  ]);

  const readableCommunity = communities.find((c) => can(me, "audit.read", c.id));
  if (!readableCommunity && me.platformRole !== "owner") {
    return (
      <EmptyBlock
        icon="history"
        title="Journal non accessible"
        description="Votre rôle ne consulte pas le journal d'audit."
      />
    );
  }

  const entries = await withSession(() =>
    getServices().audit.listAuditEntries({
      communityId: me.platformRole === "owner" ? undefined : readableCommunity?.id,
      limit: 6,
    }),
  );

  if (entries.length === 0) {
    return (
      <div className="flex flex-col gap-2">
        <EmptyBlock
          icon="history"
          title="Aucune activité récente"
          description="Les dernières commandes, inscriptions et révocations apparaîtront ici."
        />
        <UpdatedAt />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {entries.map((entry) => {
        const kind = targetToDrawerKind(entry.targetType);
        const href =
          kind && entry.targetId
            ? drawerOpenHref("/", resolvedSearch, kind, entry.targetId)
            : undefined;
        const targetLabel = entry.targetType
          ? `${entry.targetType} ${entry.targetId?.slice(0, 8) ?? ""}`.trim()
          : "Plateforme";
        return (
          <HomeRow
            key={entry.id}
            href={href}
            replace
            scroll={false}
            icon="history"
            tone="info"
            title={entry.action}
            subtitle={`${targetLabel} · ${formatDateTime(entry.createdAt)}`}
            value={entry.actorRole ?? undefined}
          />
        );
      })}
      <UpdatedAt />
    </div>
  );
}
