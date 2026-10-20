"use client";

import { useSession } from "./SessionProvider";
import { useCommunities } from "./CommunitiesProvider";
import { useAsync } from "@/lib/useAsync";
import { list, normalizeAudit, normalizePool } from "@/lib/normalize";
import { can, isOwner } from "@/lib/permissions";
import { countLabel, dateTime, intFormat, relative } from "@/lib/format";
import type { AuditEntry, EndpointRow, PoolSnapshot } from "@/lib/types";
import {
  DataTable,
  Fact,
  Facts,
  FailurePanel,
  Loading,
  Metric,
  Notice,
  Panel,
  Pill,
  ScreenHeader,
  TimeTag,
} from "./ui";
import { RefreshIcon } from "./Icons";

interface Alert {
  tone: "warn" | "danger";
  text: string;
  detail?: string;
}

function buildAlerts(communities: { name: string; status: string }[], endpoints: EndpointRow[] | null): Alert[] {
  const alerts: Alert[] = [];
  for (const community of communities) {
    if (community.status === "suspended") {
      alerts.push({
        tone: "warn",
        text: `${community.name} est suspendue.`,
        detail: "Les accès de cette communauté sont bloqués.",
      });
    }
  }
  if (!endpoints) return alerts;
  const soon = 60 * 60 * 1000; // seuil d'affichage, pas une limite d'API
  for (const endpoint of endpoints) {
    const expires = endpoint.expiresAt ? Date.parse(endpoint.expiresAt) : Number.NaN;
    if (Number.isFinite(expires) && expires <= Date.now()) {
      alerts.push({ tone: "danger", text: `${endpoint.label} est expiré.`, detail: dateTime(endpoint.expiresAt) });
    } else if (Number.isFinite(expires) && expires - Date.now() < soon) {
      alerts.push({
        tone: "warn",
        text: `${endpoint.label} expire ${relative(endpoint.expiresAt)}.`,
        detail: dateTime(endpoint.expiresAt),
      });
    }
    if (endpoint.health === "down") {
      alerts.push({
        tone: "danger",
        text: `${endpoint.label} ne répond plus.`,
        detail: `Dernière vue : ${dateTime(endpoint.lastSeenAt)}`,
      });
    } else if (endpoint.health === "degraded") {
      alerts.push({
        tone: "warn",
        text: `${endpoint.label} est dégradé.`,
        detail: endpoint.latencyMs !== null ? `Latence : ${intFormat(endpoint.latencyMs)} ms` : undefined,
      });
    }
    if (endpoint.status === "draining") {
      alerts.push({
        tone: "warn",
        text: `${endpoint.label} est en drainage.`,
        detail: "Il ne reçoit plus de nouveaux clients.",
      });
    }
  }
  return alerts;
}

/**
 * Vue d'ensemble. Aucun revenu, aucun abonné global : l'API n'expose pas
 * d'agrégat, et cette vue n'en fabrique pas. Chaque chiffre est compté sur une
 * liste réellement reçue, avec sa source écrite à côté.
 */
export function OverviewScreen() {
  const { admin, request } = useSession();
  const { communities, loading, error, reload, selectedId } = useCommunities();

  const canReadPool = can(admin, "endpoint.read", null);
  const canReadAudit = isOwner(admin) || can(admin, "audit.read", selectedId);

  const pool = useAsync<PoolSnapshot | null>(
    async () => {
      if (!canReadPool) return null;
      return normalizePool(await request("/v1/admin/pool"));
    },
    [canReadPool],
  );

  const audit = useAsync<AuditEntry[] | null>(
    async () => {
      if (!canReadAudit) return null;
      const query = isOwner(admin)
        ? "/v1/admin/audit-log?limit=50"
        : `/v1/admin/audit-log?limit=50&community_id=${encodeURIComponent(selectedId ?? "")}`;
      return list(await request(query)).map(normalizeAudit);
    },
    [canReadAudit, selectedId],
  );

  if (loading && communities.length === 0) return <Loading label="Chargement de la vue d’ensemble…" />;
  if (error && communities.length === 0) {
    return <FailurePanel error={error} onRetry={() => void reload()} />;
  }

  const endpoints = pool.data ? pool.data.endpoints : null;
  const active = endpoints ? endpoints.filter((endpoint) => endpoint.status === "active").length : null;
  const suspended = communities.filter((community) => community.status === "suspended").length;
  const alerts = buildAlerts(communities, endpoints);
  const revision = pool.data?.poolRevision ?? null;

  return (
    <section className="stack" aria-busy={pool.loading || audit.loading}>
      <ScreenHeader
        title="Vue d’ensemble"
        description="État consolidé à partir des listes accessibles à votre rôle."
        actions={
          <button
            className="button button-quiet"
            type="button"
            onClick={() => {
              void reload();
              pool.reload();
              audit.reload();
            }}
          >
            <RefreshIcon />
            Rafraîchir
          </button>
        }
      />

      <Notice>
        L’API n’expose pas d’agrégat global (abonnés, revenus). Cette vue n’affiche que des chiffres comptés sur les
        listes accessibles — jamais une estimation, jamais un revenu inventé.
      </Notice>

      <div className="metrics">
        <Metric
          label="Communautés"
          value={intFormat(communities.length)}
          hint={suspended ? countLabel(suspended, "suspendue", "suspendues") : "Aucune suspendue"}
          tone={suspended ? "warn" : "ok"}
        />
        <Metric
          label="Endpoints actifs"
          value={endpoints ? intFormat(active) : "—"}
          hint={
            endpoints
              ? `Sur ${intFormat(endpoints.length)} dans le pool`
              : pool.error
                ? "Pool indisponible"
                : "Non accessible à votre rôle"
          }
          tone={pool.error ? "warn" : undefined}
        />
        <Metric
          label="Alertes"
          value={intFormat(alerts.length)}
          hint={alerts.length ? "Détail ci-dessous" : "Aucune anomalie détectée"}
          tone={alerts.length ? "warn" : "ok"}
        />
        <Metric
          label="Actions récentes"
          value={audit.data ? intFormat(audit.data.length) : "—"}
          hint={
            audit.data
              ? "50 dernières lignes du journal, au plus"
              : canReadAudit
                ? "Journal indisponible"
                : "Non accessible à votre rôle"
          }
        />
      </div>

      <Facts>
        <Fact label="Rôle" value={isOwner(admin) ? "Propriétaire" : "Staff"} />
        <Fact
          label="Périmètre"
          value={countLabel(
            admin?.memberships.length ?? null,
            "communauté rattachée",
            "communautés rattachées",
          )}
        />
        <Fact
          label="Endpoints en drainage"
          value={
            endpoints ? intFormat(endpoints.filter((endpoint) => endpoint.status === "draining").length) : "—"
          }
        />
        <Fact
          label="Endpoints dégradés"
          value={
            endpoints ? intFormat(endpoints.filter((endpoint) => endpoint.health !== "healthy").length) : "—"
          }
        />
        <Fact label="Révision du pool" value={revision === null ? "—" : intFormat(revision)} />
      </Facts>

      <div className="two-col">
        <Panel title="Alertes">
          {alerts.length ? (
            <ul className="alerts">
              {alerts.map((alert, index) => (
                <li key={`${alert.text}-${index}`} data-tone={alert.tone}>
                  <span>{alert.text}</span>
                  {alert.detail ? <span className="meta"> {alert.detail}</span> : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">
              Aucune alerte : aucune communauté suspendue, aucun endpoint expiré, dégradé ou en drainage.
            </p>
          )}
          {pool.error ? (
            <p className="form-error">Le pool n’a pas pu être chargé : {pool.error.message}</p>
          ) : null}
        </Panel>

        <Panel title="Communautés" flush>
          {communities.length ? (
            <DataTable
              caption="Communautés visibles"
              columns={[
                { label: "Nom" },
                { label: "Identifiant" },
                { label: "Statut" },
                { label: "Commission" },
                { label: "Créée le" },
              ]}
            >
              {communities.map((community) => (
                <tr key={community.id}>
                  <td>
                    <span className="cell-title">{community.name}</span>
                  </td>
                  <td>
                    <span className="mono">{community.slug || "—"}</span>
                  </td>
                  <td>
                    <Pill value={community.status} />
                  </td>
                  <td>{community.commissionBps === null ? "—" : `${(community.commissionBps / 100).toFixed(2).replace(".", ",")} %`}</td>
                  <td>
                    <TimeTag value={community.createdAt} />
                  </td>
                </tr>
              ))}
            </DataTable>
          ) : (
            <div className="panel-body">
              <p className="muted">Aucune communauté n’est rattachée à ce compte.</p>
            </div>
          )}
        </Panel>
      </div>
    </section>
  );
}
