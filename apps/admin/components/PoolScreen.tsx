"use client";

import { intFormat, relative } from "@/lib/format";
import { normalizePool } from "@/lib/normalize";
import { can } from "@/lib/permissions";
import type { PoolSnapshot } from "@/lib/types";
import { useAsync } from "@/lib/useAsync";
import { useSession } from "./SessionProvider";
import { AccessPanel, DataTable, EmptyPanel, FailurePanel, Facts, Fact, Loading, Metric, Panel, Pill, ScreenHeader, TimeTag } from "./ui";
import { RefreshIcon } from "./Icons";

/**
 * Pool. Ressource globale : aucun filtre par communauté.
 * La projection (`normalizeEndpoint`) ne retient que libellé, région, charge,
 * statut, santé, latence et dates. Ni UUID, ni hôte, ni port, ni chemin
 * WebSocket, ni credential, ni clé de déploiement — même si l'API en ajoutait.
 */
export function PoolScreen() {
  const { admin, request } = useSession();
  const allowed = can(admin, "endpoint.read", null);

  const pool = useAsync<PoolSnapshot | null>(
    async () => (allowed ? normalizePool(await request("/v1/admin/pool")) : null),
    [allowed],
  );

  if (!allowed) {
    return (
      <AccessPanel
        title="Pool"
        message="La lecture du pool est réservée au propriétaire, aux administrateurs de communauté et au support."
      />
    );
  }

  if (pool.error) return <FailurePanel error={pool.error} onRetry={pool.reload} />;
  if (pool.loading && !pool.data) return <Loading label="Chargement du pool…" />;

  const endpoints = pool.data?.endpoints ?? [];
  const revision = pool.data?.poolRevision ?? null;
  const count = pool.data?.count ?? null;
  const active = endpoints.filter((endpoint) => endpoint.status === "active").length;
  const degraded = endpoints.filter((endpoint) => endpoint.health !== "healthy").length;
  const expiring = endpoints.filter((endpoint) => {
    if (!endpoint.expiresAt) return false;
    return Date.parse(endpoint.expiresAt) - Date.now() < 60 * 60 * 1000;
  }).length;

  return (
    <section className="stack" aria-busy={pool.loading}>
      <ScreenHeader
        title="Pool"
        description="État du pool. Cette vue ne montre que le libellé, la région, la charge, la latence et les dates : jamais de quoi ouvrir un tunnel."
        actions={
          <button className="button button-quiet" type="button" onClick={pool.reload}>
            <RefreshIcon />
            Rafraîchir
          </button>
        }
      />

      <Facts>
        <Fact label="Révision du pool" value={revision === null ? "—" : intFormat(revision)} />
        <Fact label="Endpoints listés" value={intFormat(endpoints.length)} />
        <Fact label="Compteur serveur" value={count === null ? "—" : intFormat(count)} />
      </Facts>

      <div className="metrics">
        <Metric label="Endpoints" value={intFormat(count === null ? endpoints.length : count)} hint="Pool global de la plateforme" />
        <Metric label="Actifs" value={intFormat(active)} hint="Reçoivent de nouveaux clients" />
        <Metric
          label="Dégradés"
          value={intFormat(degraded)}
          hint={degraded ? "Santé à vérifier" : "Tous sains"}
          tone={degraded ? "warn" : "ok"}
        />
        <Metric
          label="Expirent sous 1 h"
          value={intFormat(expiring)}
          hint="Seuil d’affichage de l’interface"
          tone={expiring ? "warn" : "ok"}
        />
      </div>

      {endpoints.length ? (
        <Panel flush>
          <DataTable
            caption="Endpoints du pool"
            columns={[
              { label: "Libellé" },
              { label: "Région" },
              { label: "Statut" },
              { label: "Santé" },
              { label: "Charge" },
              { label: "Latence" },
              { label: "Expire" },
              { label: "Dernière vue" },
            ]}
          >
            {endpoints.map((endpoint, index) => {
              const load =
                endpoint.capacity && endpoint.inUse !== null
                  ? `${intFormat(endpoint.inUse)} / ${intFormat(endpoint.capacity)} (${Math.round((endpoint.inUse / endpoint.capacity) * 100)} %)`
                  : "—";
              return (
                // Aucun identifiant n'est conservé : la clé est l'index de la ligne.
                <tr key={`${endpoint.label}-${index}`}>
                  <td>
                    <span className="cell-title">{endpoint.label}</span>
                  </td>
                  <td>{endpoint.region || "—"}</td>
                  <td>
                    <Pill value={endpoint.status} />
                  </td>
                  <td>
                    <Pill value={endpoint.health} />
                  </td>
                  <td>{load}</td>
                  <td>{endpoint.latencyMs === null ? "—" : `${intFormat(endpoint.latencyMs)}\u00a0ms`}</td>
                  <td>
                    <TimeTag value={endpoint.expiresAt} />
                    <span className="meta">{` ${relative(endpoint.expiresAt)}`}</span>
                  </td>
                  <td>
                    <TimeTag value={endpoint.lastSeenAt} />
                    <span className="meta">{` ${relative(endpoint.lastSeenAt)}`}</span>
                  </td>
                </tr>
              );
            })}
          </DataTable>
        </Panel>
      ) : (
        <EmptyPanel title="Pool vide" message="Aucun endpoint n’est enregistré pour le moment." />
      )}
    </section>
  );
}
